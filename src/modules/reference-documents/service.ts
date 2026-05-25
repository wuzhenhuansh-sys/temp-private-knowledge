import { createEmbedding } from "../../lib/embedding";
import { config } from "../../lib/config";
import { createServiceSupabaseClient } from "../../lib/supabase";
import { utf8ByteLength } from "../../lib/text";
import {
  createReferenceDocumentRecord,
  decrementReferenceLibraryDocumentCount,
  deleteReferenceDocumentRecord,
  ensureOwnedReferenceLibrary,
  getReferenceDocumentRecord,
  incrementReferenceLibraryDocumentCount,
  listReferenceDocumentEmbeddingsByLibrary,
  listReferenceDocumentsByLibrary,
  matchReferenceDocumentByEmbedding,
} from "./repository";
import type { CreateReferenceDocumentInput, SearchReferenceLibraryInput } from "./schema";
import type { ReferenceDocumentContent, ReferenceDocumentSummary } from "./types";
import { toReferenceDocumentContent, toReferenceDocumentSummary } from "./mapper";
import {
  buildReferenceDocumentPath,
  deleteReferenceDocument as deleteReferenceDocumentObject,
  downloadReferenceDocument,
  uploadReferenceDocument,
} from "../storage/service";
import { indexPrivateReferenceDocument } from "../indexing/service";

export function assertMarkdownSize(markdown: string) {
  const contentSize = utf8ByteLength(markdown);
  if (contentSize > config.maxMarkdownBytes) {
    return {
      ok: false as const,
      contentSize,
      maxBytes: config.maxMarkdownBytes,
    };
  }

  return {
    ok: true as const,
    contentSize,
    maxBytes: config.maxMarkdownBytes,
  };
}

export async function listReferenceDocuments(referenceLibraryId: string): Promise<ReferenceDocumentSummary[] | null> {
  const { client, userId } = await createServiceSupabaseClient();
  const isOwned = await ensureOwnedReferenceLibrary(client, userId, referenceLibraryId);
  if (!isOwned) return null;

  const documents = await listReferenceDocumentsByLibrary(client, userId, referenceLibraryId);
  return documents.map(toReferenceDocumentSummary);
}

export async function createReferenceDocument(
  referenceLibraryId: string,
  input: CreateReferenceDocumentInput,
): Promise<ReferenceDocumentSummary | null> {
  const { client, userId } = await createServiceSupabaseClient();
  const isOwned = await ensureOwnedReferenceLibrary(client, userId, referenceLibraryId);
  if (!isOwned) return null;

  const documentId = crypto.randomUUID();
  const storagePath = buildReferenceDocumentPath(userId, referenceLibraryId, documentId);
  await uploadReferenceDocument(client, storagePath, input.markdown);

  try {
    const record = await createReferenceDocumentRecord(
      client,
      documentId,
      userId,
      referenceLibraryId,
      config.privateReferenceBucket,
      storagePath,
      input,
    );

    await incrementReferenceLibraryDocumentCount(client, userId, referenceLibraryId);
    await indexPrivateReferenceDocument({
      client,
      documentId,
      ownerUserId: userId,
      referenceLibraryId,
      title: input.title,
      markdown: input.markdown,
    });

    const refreshedRecord = await getReferenceDocumentRecord(client, userId, referenceLibraryId, documentId);
    return toReferenceDocumentSummary(refreshedRecord ?? record);
  } catch (error) {
    await deleteReferenceDocumentObject(client, storagePath).catch(() => undefined);
    await deleteReferenceDocumentRecord(client, userId, referenceLibraryId, documentId).catch(() => undefined);
    await decrementReferenceLibraryDocumentCount(client, userId, referenceLibraryId).catch(() => undefined);
    throw error;
  }
}

export async function getReferenceDocument(
  referenceLibraryId: string,
  documentId: string,
): Promise<ReferenceDocumentSummary | null> {
  const { client, userId } = await createServiceSupabaseClient();
  const record = await getReferenceDocumentRecord(client, userId, referenceLibraryId, documentId);
  return record ? toReferenceDocumentSummary(record) : null;
}

export async function getReferenceDocumentContent(
  referenceLibraryId: string,
  documentId: string,
): Promise<ReferenceDocumentContent | null> {
  const { client, userId } = await createServiceSupabaseClient();
  const record = await getReferenceDocumentRecord(client, userId, referenceLibraryId, documentId);
  if (!record) return null;

  const markdown = await downloadReferenceDocument(client, record.storage_path);
  return toReferenceDocumentContent(record, markdown);
}

export async function deleteReferenceDocument(referenceLibraryId: string, documentId: string) {
  const { client, userId } = await createServiceSupabaseClient();
  const record = await getReferenceDocumentRecord(client, userId, referenceLibraryId, documentId);
  if (!record) return false;

  await deleteReferenceDocumentObject(client, record.storage_path);
  await deleteReferenceDocumentRecord(client, userId, referenceLibraryId, documentId);
  await decrementReferenceLibraryDocumentCount(client, userId, referenceLibraryId);
  return true;
}

export async function searchReferenceLibrary(referenceLibraryId: string, input: SearchReferenceLibraryInput) {
  const { client, userId } = await createServiceSupabaseClient();
  const isOwned = await ensureOwnedReferenceLibrary(client, userId, referenceLibraryId);
  if (!isOwned) {
    return null;
  }

  const readyDocuments = await listReferenceDocumentEmbeddingsByLibrary(client, userId, referenceLibraryId);
  if (readyDocuments.length === 0) {
    return {
      response: "",
      document: null,
      referenceLibraryId,
      query: input.query,
      indexStatus: "pending",
    };
  }

  const queryEmbedding = await createEmbedding(input.query);
  const matchedDocument = await matchReferenceDocumentByEmbedding(
    client,
    userId,
    referenceLibraryId,
    queryEmbedding.vector,
  );

  return {
    response: matchedDocument
      ? `${matchedDocument.title}\n\n${matchedDocument.summary ?? ""}`.trim()
      : "",
    document: matchedDocument
      ? {
          documentId: matchedDocument.id,
          title: matchedDocument.title,
          summary: matchedDocument.summary,
          indexStatus: matchedDocument.index_status,
        }
      : null,
    referenceLibraryId,
    query: input.query,
    indexStatus: matchedDocument ? matchedDocument.index_status : "ready",
  };
}
