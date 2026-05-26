import { config } from "../../lib/config";
import { createEmbedding } from "../../lib/embedding";
import { createSummaryWithLlm } from "../../lib/llm";
import type { AppSupabaseClient } from "../../lib/supabase";
import { traceIndexing } from "../../lib/trace";
import {
  updateReferenceDocumentIndexState,
  upsertReferenceDocumentEmbedding,
} from "../reference-documents/repository";

export type IndexPrivateReferenceDocumentInput = {
  client: AppSupabaseClient;
  documentId: string;
  ownerUserId: string;
  referenceLibraryId: string;
  title: string;
  markdown: string;
};

export type GeneratedDocumentSummary = {
  text: string;
};

export type GeneratedEmbedding = {
  model: string;
  vector: number[];
};

const llmSummaryInputLimitChars = 4000;

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\s+/g, " ").trim();
}

function generateDeterministicSummary(input: { title: string; markdown: string }) {
  const normalized = normalizeMarkdown(input.markdown);
  const excerpt = normalized.slice(0, 280);
  return excerpt ? `${input.title}: ${excerpt}` : input.title;
}

async function tryGenerateLlmSummary(input: { title: string; markdown: string }) {
  const models = [config.llmModel, config.llmFallbackModel].filter((model) => model.length > 0);

  if (!config.llmBaseUrl || models.length === 0) {
    traceIndexing("summary.llm_skipped", {
      reason: !config.llmBaseUrl ? "missing_base_url" : "missing_model",
    });
    return null;
  }

  for (const model of models) {
    traceIndexing("summary.llm_model_start", { model });
    try {
      const summary = await createSummaryWithLlm({
        title: input.title,
        markdown: input.markdown,
        model,
      });
      traceIndexing("summary.llm_model_success", { model, summaryChars: summary.length });
      return summary;
    } catch (error) {
      traceIndexing("summary.llm_model_failed", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  traceIndexing("summary.llm_all_failed");
  return null;
}

export async function generateDocumentSummary(input: {
  title: string;
  markdown: string;
}): Promise<GeneratedDocumentSummary> {
  const deterministicSummary = generateDeterministicSummary(input);
  const normalized = normalizeMarkdown(input.markdown);

  traceIndexing("summary.llm_start", {
    markdownChars: normalized.length,
    inputLimitChars: llmSummaryInputLimitChars,
  });

  const llmInput = normalized.slice(0, llmSummaryInputLimitChars);
  if (llmInput.length < normalized.length) {
    traceIndexing("summary.llm_input_truncated", {
      markdownChars: normalized.length,
      inputChars: llmInput.length,
    });
  }

  const llmSummary = await tryGenerateLlmSummary({
    title: input.title,
    markdown: llmInput,
  });

  if (!llmSummary) {
    traceIndexing("summary.deterministic", {
      reason: "llm_unavailable",
      markdownChars: normalized.length,
      inputLimitChars: llmSummaryInputLimitChars,
      summaryChars: deterministicSummary.length,
    });
  }

  return {
    text: llmSummary || deterministicSummary,
  };
}

export async function generateSummaryEmbedding(summary: string): Promise<GeneratedEmbedding | null> {
  if (!config.embeddingModel) {
    traceIndexing("embedding.skipped", { reason: "missing_model" });
    return null;
  }

  traceIndexing("embedding.start", { summaryChars: summary.length });
  const embedding = await createEmbedding(summary);
  traceIndexing("embedding.success", { model: embedding.model, dimensions: embedding.vector.length });

  return {
    model: embedding.model,
    vector: embedding.vector,
  };
}

export async function indexPrivateReferenceDocument(input: IndexPrivateReferenceDocumentInput) {
  await updateReferenceDocumentIndexState(input.client, input.ownerUserId, input.referenceLibraryId, input.documentId, {
    indexStatus: "indexing",
    indexError: null,
  });

  try {
    traceIndexing("indexing.start", { documentId: input.documentId, title: input.title });
    const summary = await generateDocumentSummary({
      title: input.title,
      markdown: input.markdown,
    });

    await updateReferenceDocumentIndexState(input.client, input.ownerUserId, input.referenceLibraryId, input.documentId, {
      summary: summary.text,
      indexStatus: "pending",
      indexError: null,
    });

    const embedding = await generateSummaryEmbedding(summary.text);

    if (!embedding) {
      await updateReferenceDocumentIndexState(input.client, input.ownerUserId, input.referenceLibraryId, input.documentId, {
        indexStatus: "pending",
        indexError: null,
      });
      traceIndexing("indexing.pending", { documentId: input.documentId, reason: "embedding_disabled" });
      return;
    }

    await upsertReferenceDocumentEmbedding(input.client, {
      documentId: input.documentId,
      ownerUserId: input.ownerUserId,
      summaryText: summary.text,
      embeddingModel: embedding.model,
      embedding: embedding.vector,
    });

    await updateReferenceDocumentIndexState(input.client, input.ownerUserId, input.referenceLibraryId, input.documentId, {
      indexStatus: "ready",
      indexError: null,
    });
    traceIndexing("indexing.ready", { documentId: input.documentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown indexing error.";

    await updateReferenceDocumentIndexState(input.client, input.ownerUserId, input.referenceLibraryId, input.documentId, {
      indexStatus: "failed",
      indexError: message,
    });
    traceIndexing("indexing.failed", { documentId: input.documentId, error: message });

    throw error;
  }
}
