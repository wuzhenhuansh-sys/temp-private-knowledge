import { config } from "./config";
import { HttpRequestError, withRetry } from "./retry";
import { traceIndexing } from "./trace";

export type EmbeddingResponse = {
  model: string;
  vector: number[];
};

function joinUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Embedding response is missing a numeric vector.");
  }

  const vector = value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error("Embedding response contains non-numeric values.");
    }
    return entry;
  });

  return vector;
}

function parseEmbeddingPayload(payload: unknown): EmbeddingResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Embedding response is not a JSON object.");
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.data) && record.data.length > 0 && record.data[0] && typeof record.data[0] === "object") {
    const item = record.data[0] as Record<string, unknown>;
    const vector = toNumberArray(item.embedding);
    const model = typeof item.model === "string" && item.model ? item.model : config.embeddingModel;
    return { model, vector };
  }

  if (record.output && typeof record.output === "object") {
    const output = record.output as Record<string, unknown>;
    if (Array.isArray(output.embeddings) && output.embeddings.length > 0 && output.embeddings[0] && typeof output.embeddings[0] === "object") {
      const item = output.embeddings[0] as Record<string, unknown>;
      const vector = toNumberArray(item.embedding ?? item.vector);
      const model = typeof item.model === "string" && item.model ? item.model : config.embeddingModel;
      return { model, vector };
    }
  }

  if (Array.isArray(record.embeddings) && record.embeddings.length > 0 && record.embeddings[0] && typeof record.embeddings[0] === "object") {
    const item = record.embeddings[0] as Record<string, unknown>;
    const vector = toNumberArray(item.embedding ?? item.vector);
    const model = typeof item.model === "string" && item.model ? item.model : config.embeddingModel;
    return { model, vector };
  }

  throw new Error("Embedding response does not match any supported shape.");
}

export async function createEmbedding(input: string): Promise<EmbeddingResponse> {
  if (!config.embeddingBaseUrl) {
    throw new Error("EMBEDDING_BASE_URL is required.");
  }

  if (!config.embeddingApiKey) {
    throw new Error("EMBEDDING_API_KEY is required.");
  }

  if (!config.embeddingModel) {
    throw new Error("EMBEDDING_MODEL is required.");
  }

  const path = "/v1/embeddings";
  const url = joinUrl(config.embeddingBaseUrl, path);

  try {
    traceIndexing("embedding.endpoint_start", { path });
    const parsed = await withRetry(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          input,
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new HttpRequestError(`Embedding request to ${path} failed with ${response.status}: ${raw}`, response.status, raw);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`Embedding response from ${path} is not valid JSON.`);
      }

      return parseEmbeddingPayload(payload);
    });

    traceIndexing("embedding.endpoint_success", { path, model: parsed.model, dimensions: parsed.vector.length });
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    traceIndexing("embedding.endpoint_failed", { path, error: message });
    throw new Error(`Embedding request failed. ${path}: ${message}`);
  }
}
