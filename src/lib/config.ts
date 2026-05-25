function readEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readOptionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

export const config = {
  port: readNumberEnv("PORT", 8787),
  host: process.env.HOST?.trim() || "0.0.0.0",
  supabaseUrl: readEnv("SUPABASE_URL"),
  supabaseAnonKey: readEnv("SUPABASE_ANON_KEY"),
  supabaseUserEmail: readEnv("SUPABASE_USER_EMAIL"),
  supabaseUserPassword: readEnv("SUPABASE_USER_PASSWORD"),
  supabaseServiceRoleKey: readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
  privateReferenceBucket: process.env.PRIVATE_REFERENCE_BUCKET?.trim() || "private-reference-documents",
  maxMarkdownBytes: readNumberEnv("MAX_MARKDOWN_BYTES", 1048576),
  embeddingModel: process.env.EMBEDDING_MODEL?.trim() || "",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() || "",
  embeddingApiKey: process.env.EMBEDDING_API_KEY?.trim() || "",
};
