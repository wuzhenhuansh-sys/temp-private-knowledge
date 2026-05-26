export {};

const fixtures = [
  "tests/fixtures/ai-large-models-overview.md",
  "tests/fixtures/brain-computer-interface-overview.md",
  "tests/fixtures/web3-overview.md",
];

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
    text?: unknown;
  }>;
  output_text?: unknown;
  output?: unknown;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/^http:\/\/http:\/\//, "http://").replace(/\/$/, "");
}

function joinUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function parseSummary(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? payload.output_text;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(payload.output)) {
    const texts = payload.output
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const content = (item as Record<string, unknown>).content;
        return Array.isArray(content) ? content : [];
      })
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        return typeof record.text === "string" ? record.text : "";
      })
      .filter(Boolean);

    if (texts.length > 0) {
      return texts.join("\n").trim();
    }
  }

  throw new Error("LLM response does not contain summary text.");
}

async function createSummary(model: string, markdown: string) {
  const baseUrl = readEnv("LLM_BASE_URL");
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  const candidates = ["/chat/completions", "/v1/chat/completions"];
  const errors: string[] = [];

  for (const path of candidates) {
    const response = await fetch(joinUrl(baseUrl, path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是中文技术文档摘要助手。请用准确、克制、结构化的中文总结长文，不编造原文不存在的信息。",
          },
          {
            role: "user",
            content: [
              "请总结下面这篇文档。要求：",
              "1. 输出 5-8 条要点；",
              "2. 覆盖核心概念、关键技术、应用场景、主要挑战；",
              "3. 最后给出一句 80 字以内的总括；",
              "4. 只输出摘要，不要输出寒暄。",
              "",
              markdown,
            ].join("\n"),
          },
        ],
        temperature: 0.2,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      errors.push(`${path}: ${response.status} ${raw}`);
      continue;
    }

    try {
      return parseSummary(JSON.parse(raw) as ChatCompletionPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${message}`);
    }
  }

  throw new Error(`LLM summary request failed. ${errors.join(" | ")}`);
}

function getSummaryModels() {
  return [readEnv("LLM_MODEL"), process.env.LLM_FALLBACK_MODEL?.trim() || ""].filter(Boolean);
}

async function createSummaryWithFallback(markdown: string) {
  const errors: string[] = [];

  for (const model of getSummaryModels()) {
    try {
      return await createSummary(model, markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${message}`);
    }
  }

  throw new Error(`LLM summary request failed for all configured models. ${errors.join(" | ")}`);
}

async function main() {
  const models = getSummaryModels();
  console.log(`[summary-check] Base URL: ${normalizeBaseUrl(readEnv("LLM_BASE_URL"))}`);
  console.log(`[summary-check] Models: ${models.join(", ")}`);

  for (const fixture of fixtures) {
    const markdown = await Bun.file(fixture).text();
    console.log(`\n===== ${fixture} =====\n`);
    const summary = await createSummaryWithFallback(markdown);
    console.log(summary);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[summary-check] ${message}`);
  process.exit(1);
});
