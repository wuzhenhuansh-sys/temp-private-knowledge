import { config } from "./config";
import { HttpRequestError, withRetry } from "./retry";
import { traceIndexing } from "./trace";

export type SummaryWithLlmInput = {
  title: string;
  markdown: string;
  model: string;
};

function joinUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function parseSummaryPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM summary response is not a JSON object.");
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.choices) || !record.choices[0] || typeof record.choices[0] !== "object") {
    throw new Error("LLM summary response is missing choices.");
  }

  const choice = record.choices[0] as Record<string, unknown>;
  const message = choice.message;
  if (message && typeof message === "object") {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }

  if (typeof choice.text === "string" && choice.text.trim()) {
    return choice.text.trim();
  }

  throw new Error("LLM summary response is missing text content.");
}

export async function createSummaryWithLlm(input: SummaryWithLlmInput) {
  if (!config.llmBaseUrl) {
    throw new Error("LLM_BASE_URL is required.");
  }

  const path = "/v1/chat/completions";
  const url = joinUrl(config.llmBaseUrl, path);

  try {
    traceIndexing("summary.llm_endpoint_start", { model: input.model, path });
    const summary = await withRetry(async () => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (config.llmApiKey) {
        headers.authorization = `Bearer ${config.llmApiKey}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: input.model,
          messages: [
            {
              role: "system",
              content: "You write concise knowledge-base summaries for retrieval. Preserve important names, terms, versions, and domain language. Respond with only the summary.",
            },
            {
              role: "user",
              content: `Title: ${input.title}\n\nMarkdown:\n${input.markdown}\n\nSummarize this document in Chinese if the source is Chinese, otherwise keep the source language. Focus on searchable facts and avoid generic introductions.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 220,
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new HttpRequestError(`LLM summary request to ${path} failed with ${response.status}: ${raw}`, response.status, raw);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`LLM summary response from ${path} is not valid JSON.`);
      }

      return parseSummaryPayload(payload);
    });

    traceIndexing("summary.llm_endpoint_success", { model: input.model, path, summaryChars: summary.length });
    return summary.slice(0, 1200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    traceIndexing("summary.llm_endpoint_failed", { model: input.model, path, error: message });
    throw new Error(`LLM summary request failed. ${input.model}${path}: ${message}`);
  }
}
