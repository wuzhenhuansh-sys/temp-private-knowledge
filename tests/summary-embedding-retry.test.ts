import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { config } from "../src/lib/config";
import { createEmbedding } from "../src/lib/embedding";
import { createSummaryWithLlm } from "../src/lib/llm";
import { generateDocumentSummary } from "../src/modules/indexing/service";

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
};

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
    return handler(String(input), init);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  resetEnv();
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_USER_EMAIL = "user@example.com";
  process.env.SUPABASE_USER_PASSWORD = "password";
  process.env.LLM_BASE_URL = "http://llm.test";
  process.env.LLM_MODEL = "primary-model";
  process.env.LLM_FALLBACK_MODEL = "fallback-model";
  process.env.EMBEDDING_BASE_URL = "http://embedding.test";
  process.env.EMBEDDING_API_KEY = "embedding-key";
  process.env.EMBEDDING_MODEL = "embedding-model";
  config.llmBaseUrl = "http://llm.test";
  config.llmModel = "primary-model";
  config.llmFallbackModel = "fallback-model";
  config.llmApiKey = "";
  config.embeddingBaseUrl = "http://embedding.test";
  config.embeddingApiKey = "embedding-key";
  config.embeddingModel = "embedding-model";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetEnv();
  mock.restore();
});

test("short markdown uses primary LLM summary", async () => {
  const calls: FetchCall[] = [];
  installFetch((url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return jsonResponse({ choices: [{ message: { content: "short llm summary" } }] });
  });

  const summary = await generateDocumentSummary({
    title: "Short Doc",
    markdown: "alpha beta gamma",
  });

  expect(summary.text).toBe("short llm summary");
  expect(calls).toHaveLength(1);
  expect(calls[0].body.model).toBe("primary-model");
});

test("long markdown uses primary LLM summary", async () => {
  const calls: FetchCall[] = [];
  installFetch((url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return jsonResponse({ choices: [{ message: { content: "primary summary" } }] });
  });

  const summary = await generateDocumentSummary({
    title: "Long Doc",
    markdown: "知识点".repeat(1400),
  });

  expect(summary.text).toBe("primary summary");
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("http://llm.test/v1/chat/completions");
  expect(calls[0].body.model).toBe("primary-model");
});

test("long markdown falls back to second LLM model before deterministic summary", async () => {
  const models: unknown[] = [];
  installFetch((_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    models.push(body.model);

    if (body.model === "primary-model") {
      return new Response("busy", { status: 503 });
    }

    return jsonResponse({ choices: [{ message: { content: "fallback summary" } }] });
  });

  const summary = await generateDocumentSummary({
    title: "Long Doc",
    markdown: "知识点".repeat(1400),
  });

  expect(summary.text).toBe("fallback summary");
  expect(models).toEqual([
    "primary-model",
    "primary-model",
    "primary-model",
    "fallback-model",
  ]);
});

test("long markdown falls back to deterministic summary when both LLM models fail", async () => {
  installFetch(() => new Response("busy", { status: 503 }));

  const markdown = "知识点".repeat(1400);
  const summary = await generateDocumentSummary({
    title: "Long Doc",
    markdown,
  });

  expect(summary.text).toBe(`Long Doc: ${markdown.replace(/\s+/g, " ").trim().slice(0, 280)}`);
});

test("long markdown sends only first 4000 normalized chars to LLM", async () => {
  let userPrompt = "";
  installFetch((_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    userPrompt = body.messages.find((message) => message.role === "user")?.content ?? "";
    return jsonResponse({ choices: [{ message: { content: "capped summary" } }] });
  });

  const markdown = "a".repeat(4500);
  const summary = await generateDocumentSummary({
    title: "Long Doc",
    markdown,
  });

  expect(summary.text).toBe("capped summary");
  expect(userPrompt).toContain("a".repeat(4000));
  expect(userPrompt).not.toContain("a".repeat(4001));
});

test("LLM client retries transient failures", async () => {
  let attempts = 0;
  installFetch(() => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("busy", { status: 503 });
    }

    return jsonResponse({ choices: [{ message: { content: "retried summary" } }] });
  });

  const summary = await createSummaryWithLlm({
    title: "Retry Doc",
    markdown: "content",
    model: "primary-model",
  });

  expect(summary).toBe("retried summary");
  expect(attempts).toBe(3);
});

test("embedding retries transient failures and returns parsed vector", async () => {
  let attempts = 0;
  installFetch(() => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("busy", { status: 503 });
    }

    return jsonResponse({ data: [{ embedding: [0.1, 0.2, 0.3], model: "embedding-model" }] });
  });

  const embedding = await createEmbedding("hello");

  expect(embedding).toEqual({ model: "embedding-model", vector: [0.1, 0.2, 0.3] });
  expect(attempts).toBe(3);
});

test("embedding throws after fixed endpoint retries fail", async () => {
  let attempts = 0;
  installFetch(() => {
    attempts += 1;
    return new Response("busy", { status: 503 });
  });

  await expect(createEmbedding("hello")).rejects.toThrow("Embedding request failed. /v1/embeddings");
  expect(attempts).toBe(3);
});
