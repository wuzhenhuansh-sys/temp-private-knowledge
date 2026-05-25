import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { supabaseAuthClient, createUserSupabaseClient } from "../src/lib/supabase";
import { createReferenceLibrary, listReferenceLibrariesByOwner } from "../src/modules/reference-libraries/repository";
import {
  createReferenceDocumentRecord,
  getReferenceDocumentRecord,
  incrementReferenceLibraryDocumentCount,
} from "../src/modules/reference-documents/repository";
import { indexPrivateReferenceDocument } from "../src/modules/indexing/service";
import { buildReferenceDocumentPath, uploadReferenceDocument } from "../src/modules/storage/service";
import { config } from "../src/lib/config";

const targetLibraryName = "Imported local reference docs";
const documentPaths = [
  resolve("knowledge-reference-api-contract.md"),
  resolve("development-plan.md"),
];

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

async function ensureReferenceLibrary(accessToken: string, ownerUserId: string) {
  const client = createUserSupabaseClient(accessToken);
  const libraries = await listReferenceLibrariesByOwner(client, ownerUserId);
  const existing = libraries.find((library) => library.name === targetLibraryName);
  if (existing) return existing;

  return await createReferenceLibrary(client, ownerUserId, {
    name: targetLibraryName,
    description: "Imported from local markdown files for retrieval verification.",
  });
}

async function importDocument(accessToken: string, ownerUserId: string, referenceLibraryId: string, filePath: string) {
  const client = createUserSupabaseClient(accessToken);
  const markdown = await readFile(filePath, "utf8");
  const documentId = crypto.randomUUID();
  const title = basename(filePath, ".md");
  const storagePath = buildReferenceDocumentPath(ownerUserId, referenceLibraryId, documentId);

  await uploadReferenceDocument(client, storagePath, markdown);
  await createReferenceDocumentRecord(
    client,
    documentId,
    ownerUserId,
    referenceLibraryId,
    config.privateReferenceBucket,
    storagePath,
    { title, markdown },
  );
  await incrementReferenceLibraryDocumentCount(client, ownerUserId, referenceLibraryId);
  await indexPrivateReferenceDocument({
    client,
    documentId,
    ownerUserId,
    referenceLibraryId,
    title,
    markdown,
  });

  const record = await getReferenceDocumentRecord(client, ownerUserId, referenceLibraryId, documentId);
  return {
    documentId,
    title,
    indexStatus: record?.index_status ?? "unknown",
    summaryPreview: record?.summary?.slice(0, 120) ?? "",
  };
}

async function main() {
  const { accessToken, userId } = await resolveAccessToken();
  const library = await ensureReferenceLibrary(accessToken, userId);
  const results = [];

  for (const filePath of documentPaths) {
    results.push(await importDocument(accessToken, userId, library.id, filePath));
  }

  console.log(JSON.stringify({ referenceLibraryId: library.id, documents: results }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[import-reference-docs] ${message}`);
  process.exit(1);
});
