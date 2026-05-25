import type { AppSupabaseClient } from "../../lib/supabase";
import { sha256Hex, utf8ByteLength } from "../../lib/text";
import type { CreateReferenceDocumentInput } from "./schema";

const schema = "public";
const documentsTable = "private_reference_documents";
const librariesTable = "private_reference_libraries";
const embeddingsTable = "private_reference_document_embeddings";
const documentSelectColumns =
  "id, reference_library_id, owner_user_id, title, storage_bucket, storage_path, content_size, content_sha256, summary, index_status, index_error, created_at, updated_at";

function documents(client: AppSupabaseClient) {
  return client.schema(schema).from(documentsTable);
}

function libraries(client: AppSupabaseClient) {
  return client.schema(schema).from(librariesTable);
}

function embeddings(client: AppSupabaseClient) {
  return client.schema(schema).from(embeddingsTable);
}

export type ReferenceDocumentRecord = {
  id: string;
  reference_library_id: string;
  owner_user_id: string;
  title: string;
  storage_bucket: string;
  storage_path: string;
  content_size: number;
  content_sha256: string;
  summary: string | null;
  index_status: string;
  index_error?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ReferenceDocumentEmbeddingRecord = {
  id: string;
  document_id: string;
  owner_user_id: string;
  summary_text: string;
  embedding_model: string;
  created_at?: string;
};

export type MatchedReferenceDocumentRecord = ReferenceDocumentRecord & {
  distance: number;
};

function formatVectorLiteral(vector: number[]) {
  if (!vector.length) {
    throw new Error("Embedding vector must not be empty.");
  }

  return `[${vector.join(",")}]`;
}

function parseVectorResponse(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized.startsWith("[") || !normalized.endsWith("]")) {
      throw new Error("Embedding response from database is not a vector literal.");
    }

    return normalized
      .slice(1, -1)
      .split(",")
      .map((entry) => Number(entry.trim()));
  }

  throw new Error("Embedding response from database has an unsupported format.");
}

export async function matchReferenceDocumentByEmbedding(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
  queryEmbedding: number[],
) {
  const vector = formatVectorLiteral(queryEmbedding);
  const { data, error } = await client.rpc("match_private_reference_document", {
    p_owner_user_id: ownerUserId,
    p_reference_library_id: referenceLibraryId,
    p_query_embedding: vector,
  });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] ?? null) as MatchedReferenceDocumentRecord | null;
}

export async function getReferenceDocumentEmbeddingVector(
  client: AppSupabaseClient,
  ownerUserId: string,
  documentId: string,
) {
  const { data, error } = await embeddings(client)
    .select("embedding")
    .eq("owner_user_id", ownerUserId)
    .eq("document_id", documentId)
    .single();

  if (error) throw error;

  const vector = parseVectorResponse((data as { embedding: unknown }).embedding);
  if (vector.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error("Embedding vector contains non-numeric values.");
  }

  return vector as number[];
}

export async function listReferenceDocumentEmbeddingsByLibrary(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
) {
  const { data, error } = await client
    .schema(schema)
    .from(documentsTable)
    .select(
      `id, title, summary, index_status, ${embeddingsTable}(document_id, owner_user_id, summary_text, embedding_model, embedding)`
    )
    .eq("owner_user_id", ownerUserId)
    .eq("reference_library_id", referenceLibraryId)
    .eq("index_status", "ready");

  if (error) throw error;
  return data ?? [];
}

export async function ensureOwnedReferenceLibrary(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
) {
  const { data, error } = await libraries(client)
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function listReferenceDocumentsByLibrary(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
) {
  const { data, error } = await documents(client)
    .select(documentSelectColumns)
    .eq("owner_user_id", ownerUserId)
    .eq("reference_library_id", referenceLibraryId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReferenceDocumentRecord[];
}

export async function createReferenceDocumentRecord(
  client: AppSupabaseClient,
  documentId: string,
  ownerUserId: string,
  referenceLibraryId: string,
  storageBucket: string,
  storagePath: string,
  input: CreateReferenceDocumentInput,
) {
  const contentSize = utf8ByteLength(input.markdown);
  const contentSha256 = await sha256Hex(input.markdown);

  const { data, error } = await documents(client)
    .insert({
      id: documentId,
      reference_library_id: referenceLibraryId,
      owner_user_id: ownerUserId,
      title: input.title,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      content_size: contentSize,
      content_sha256: contentSha256,
      index_status: "pending",
    })
    .select(documentSelectColumns)
    .single();

  if (error) throw error;
  return data as ReferenceDocumentRecord;
}

export async function getReferenceDocumentRecord(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
  documentId: string,
) {
  const { data, error } = await documents(client)
    .select(documentSelectColumns)
    .eq("owner_user_id", ownerUserId)
    .eq("reference_library_id", referenceLibraryId)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ReferenceDocumentRecord | null;
}

export async function updateReferenceDocumentIndexState(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
  documentId: string,
  values: {
    summary?: string | null;
    indexStatus: string;
    indexError?: string | null;
  },
) {
  const patch: Record<string, string | null> = {
    index_status: values.indexStatus,
  };

  if (values.summary !== undefined) patch.summary = values.summary;
  if (values.indexError !== undefined) patch.index_error = values.indexError;

  const { data, error } = await documents(client)
    .update(patch)
    .eq("owner_user_id", ownerUserId)
    .eq("reference_library_id", referenceLibraryId)
    .eq("id", documentId)
    .select(documentSelectColumns)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ReferenceDocumentRecord | null;
}

export async function upsertReferenceDocumentEmbedding(
  client: AppSupabaseClient,
  params: {
    documentId: string;
    ownerUserId: string;
    summaryText: string;
    embeddingModel: string;
    embedding: number[];
  },
) {
  const { data, error } = await embeddings(client)
    .upsert(
      {
        id: crypto.randomUUID(),
        document_id: params.documentId,
        owner_user_id: params.ownerUserId,
        summary_text: params.summaryText,
        embedding_model: params.embeddingModel,
        embedding: params.embedding,
      },
      {
        onConflict: "document_id",
      },
    )
    .select("id, document_id, owner_user_id, summary_text, embedding_model, created_at")
    .single();

  if (error) throw error;
  return data as ReferenceDocumentEmbeddingRecord;
}

export async function incrementReferenceLibraryDocumentCount(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
) {
  const { data, error } = await libraries(client)
    .select("document_count")
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId)
    .single();

  if (error) throw error;

  const { error: updateError } = await libraries(client)
    .update({
      document_count: data.document_count + 1,
    })
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId);

  if (updateError) throw updateError;
}

export async function decrementReferenceLibraryDocumentCount(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
) {
  const { data, error } = await libraries(client)
    .select("document_count")
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId)
    .single();

  if (error) throw error;

  const { error: updateError } = await libraries(client)
    .update({
      document_count: Math.max(data.document_count - 1, 0),
    })
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId);

  if (updateError) throw updateError;
}

export async function deleteReferenceDocumentRecord(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
  documentId: string,
) {
  const { error } = await documents(client)
    .delete()
    .eq("owner_user_id", ownerUserId)
    .eq("reference_library_id", referenceLibraryId)
    .eq("id", documentId);

  if (error) throw error;
}
