import type { AppSupabaseClient } from "../../lib/supabase";
import type { CreateReferenceLibraryInput, UpdateReferenceLibraryInput } from "./schema";
import type { ReferenceLibraryRecord } from "./types";

const schema = "public";
const tableName = "private_reference_libraries";
const selectColumns = "id, owner_user_id, name, description, status, document_count, created_at, updated_at";

function librariesTable(client: AppSupabaseClient) {
  return client.schema(schema).from(tableName);
}

export async function listReferenceLibrariesByOwner(client: AppSupabaseClient, ownerUserId: string) {
  const { data, error } = await librariesTable(client)
    .select(selectColumns)
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReferenceLibraryRecord[];
}

export async function createReferenceLibrary(client: AppSupabaseClient, ownerUserId: string, input: CreateReferenceLibraryInput) {
  const { data, error } = await librariesTable(client)
    .insert({
      id: crypto.randomUUID(),
      owner_user_id: ownerUserId,
      name: input.name,
      description: input.description ?? null,
    })
    .select(selectColumns)
    .single();

  if (error) throw error;
  return data as ReferenceLibraryRecord;
}

export async function getReferenceLibraryById(client: AppSupabaseClient, ownerUserId: string, referenceLibraryId: string) {
  const { data, error } = await librariesTable(client)
    .select(selectColumns)
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ReferenceLibraryRecord | null;
}

export async function updateReferenceLibrary(
  client: AppSupabaseClient,
  ownerUserId: string,
  referenceLibraryId: string,
  input: UpdateReferenceLibraryInput,
) {
  const patch: Record<string, string | null> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;

  const { data, error } = await librariesTable(client)
    .update(patch)
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId)
    .select(selectColumns)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ReferenceLibraryRecord | null;
}

export async function deleteReferenceLibrary(client: AppSupabaseClient, ownerUserId: string, referenceLibraryId: string) {
  const { error } = await librariesTable(client)
    .delete()
    .eq("owner_user_id", ownerUserId)
    .eq("id", referenceLibraryId);

  if (error) throw error;
}
