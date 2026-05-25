import { config } from "../../lib/config";
import type { AppSupabaseClient } from "../../lib/supabase";

export function buildReferenceDocumentPath(ownerUserId: string, referenceLibraryId: string, documentId: string) {
  return `${ownerUserId}/${referenceLibraryId}/${documentId}.md`;
}

export async function uploadReferenceDocument(client: AppSupabaseClient, path: string, markdown: string) {
  const { error } = await client.storage.from(config.privateReferenceBucket).upload(path, markdown, {
    contentType: "text/markdown; charset=utf-8",
    upsert: false,
  });

  if (error) throw error;
}

export async function downloadReferenceDocument(client: AppSupabaseClient, path: string) {
  const { data, error } = await client.storage.from(config.privateReferenceBucket).download(path);

  if (error) throw error;
  return await data.text();
}

export async function deleteReferenceDocument(client: AppSupabaseClient, path: string) {
  const { error } = await client.storage.from(config.privateReferenceBucket).remove([path]);

  if (error) throw error;
}
