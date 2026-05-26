const fixture = "tests/fixtures/web3-overview.md";
const models = [
  "bl/glm-4.7",
  "bl/glm-5",
  "bl/kimi/kimi-k2.5",
  "bl/MiniMax/MiniMax-M2.5",
  "bl/qwen3-coder-plus",
  "bl/qwen3.5-plus",
  "bl/qwen3.6-plus",
  "qwen3.6:35b",
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
  usage?: unknown;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function joinUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
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

async function summarize(model: string, markdown: string) {
  const baseUrl = readEnv("LLM_BASE_URL");
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  const candidates = ["/chat/completions", "/v1/chat/completions"];
  const errors: string[] = [];

  for (const path of candidates) {
    const startedAt = performance.now();
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
              "请总结下面这篇 Web3 文档。要求：",
              "1. 输出 5 条要点；",
              "2. 覆盖核心概念、关键技术、应用场景、主要挑战；",
              "3. 最后给出一句 60 字以内的总括；",
              "4. 只输出摘要，不要输出寒暄。",
              "",
              markdown,
            ].join("\n"),
          },
        ],
        temperature: 0.2,
      }),
    });
    const elapsedMs = performance.now() - startedAt;
    const raw = await response.text();

    if (!response.ok) {
      errors.push(`${path}: ${response.status} ${raw}`);
      continue;
    }

    try {
      const payload = JSON.parse(raw) as ChatCompletionPayload;
      return {
        path,
        elapsedMs,
        summary: parseSummary(payload),
        usage: payload.usage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function main() {
  const baseUrl = readEnv("LLM_BASE_URL");
  const markdown = await Bun.file(fixture).text();
  const results: Array<{ model: string; ok: boolean; elapsedMs?: number }> = [];

  console.log(`[summary-benchmark] Base URL: ${baseUrl}`);
  console.log(`[summary-benchmark] Fixture: ${fixture}`);
  console.log(`[summary-benchmark] Models: ${models.join(", ")}`);

  for (const model of models) {
    console.log(`\n===== ${model} =====`);
    try {
      const result = await summarize(model, markdown);
      const seconds = (result.elapsedMs / 1000).toFixed(2);
      results.push({ model, ok: true, elapsedMs: result.elapsedMs });
      console.log(`[ok] ${seconds}s via ${result.path}`);
      if (result.usage) console.log(`[usage] ${JSON.stringify(result.usage)}`);
      console.log(result.summary);
    } catch (error) {
      results.push({ model, ok: false });
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[failed] ${message}`);
    }
  }

  console.log("\n===== Speed Ranking =====");
  for (const result of results.filter((entry) => entry.ok).sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))) {
    console.log(`${result.model}: ${((result.elapsedMs ?? 0) / 1000).toFixed(2)}s`);
  }

  const failed = results.filter((entry) => !entry.ok);
  if (failed.length > 0) {
    console.log("\n===== Failed Models =====");
    for (const result of failed) console.log(result.model);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[summary-benchmark] ${message}`);
  process.exit(1);
});
