import { supabaseAuthClient, createUserSupabaseClient } from "../src/lib/supabase";
import { listReferenceLibrariesByOwner } from "../src/modules/reference-libraries/repository";
import { createEmbedding } from "../src/lib/embedding";
import { matchReferenceDocumentByEmbedding } from "../src/modules/reference-documents/repository";

const targetLibraryName = "Imported local reference docs";
const query = process.argv.slice(2).join(" ") || "参考库 search 接口返回什么结构";

async function resolveAccessToken() {
  const email = process.env.SUPABASE_TEST_EMAIL?.trim();
  const password = process.env.SUPABASE_TEST_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error("SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are required.");
  }

  const { data, error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.user) {
    throw new Error(`Failed to sign in test user: ${error?.message ?? "missing session"}`);
  }

  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
  };
}

async function main() {
  const { accessToken, userId } = await resolveAccessToken();
  const client = createUserSupabaseClient(accessToken);
  const libraries = await listReferenceLibrariesByOwner(client, userId);
  const library = libraries.find((item) => item.name === targetLibraryName);
  if (!library) {
    throw new Error(`Reference library not found: ${targetLibraryName}`);
  }

  const embedding = await createEmbedding(query);
  const matched = await matchReferenceDocumentByEmbedding(client, userId, library.id, embedding.vector);

  console.log(JSON.stringify({
    query,
    referenceLibraryId: library.id,
    matched: matched
      ? {
          documentId: matched.id,
          title: matched.title,
          summary: matched.summary,
          distance: matched.distance,
          indexStatus: matched.index_status,
        }
      : null,
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[check-reference-recall] ${message}`);
  process.exit(1);
});
