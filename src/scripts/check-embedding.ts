import { createEmbedding } from "../lib/embedding";
import { config } from "../lib/config";

async function main() {
  if (!config.embeddingBaseUrl) {
    throw new Error("EMBEDDING_BASE_URL is required.");
  }

  if (!config.embeddingApiKey) {
    throw new Error("EMBEDDING_API_KEY is required.");
  }

  if (!config.embeddingModel) {
    throw new Error("EMBEDDING_MODEL is required.");
  }

  const input = "这是一段用于验证 embedding 接口是否可用的测试文本。";

  console.log(`[embedding-check] Base URL: ${config.embeddingBaseUrl}`);
  console.log(`[embedding-check] Model: ${config.embeddingModel}`);

  const embedding = await createEmbedding(input);

  console.log("[embedding-check] Success.");
  console.log(`[embedding-check] Returned model: ${embedding.model}`);
  console.log(`[embedding-check] Dimension: ${embedding.vector.length}`);
  console.log(`[embedding-check] Preview: ${embedding.vector.slice(0, 8).join(", ")}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[embedding-check] ${message}`);
  process.exit(1);
});
