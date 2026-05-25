import { createEmbedding } from "../../lib/embedding";
import { config } from "../../lib/config";
import type { AppSupabaseClient } from "../../lib/supabase";
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

export async function generateDocumentSummary(input: {
  title: string;
  markdown: string;
}): Promise<GeneratedDocumentSummary> {
  const normalized = input.markdown.replace(/\s+/g, " ").trim();
  const excerpt = normalized.slice(0, 280);
  return {
    text: excerpt ? `${input.title}: ${excerpt}` : input.title,
  };
}

export async function generateSummaryEmbedding(summary: string): Promise<GeneratedEmbedding | null> {
  if (!config.embeddingModel) {
    return null;
  }

  const embedding = await createEmbedding(summary);

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown indexing error.";

    await updateReferenceDocumentIndexState(input.client, input.ownerUserId, input.referenceLibraryId, input.documentId, {
      indexStatus: "failed",
      indexError: message,
    });

    throw error;
  }
}
