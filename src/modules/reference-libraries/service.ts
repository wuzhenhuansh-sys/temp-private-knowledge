import { createServiceSupabaseClient } from "../../lib/supabase";
import {
  createReferenceLibrary as createReferenceLibraryRecord,
  deleteReferenceLibrary as deleteReferenceLibraryRecord,
  getReferenceLibraryById,
  listReferenceLibrariesByOwner,
  updateReferenceLibrary as updateReferenceLibraryRecord,
} from "./repository";
import type { CreateReferenceLibraryInput, UpdateReferenceLibraryInput } from "./schema";
import { toReferenceLibrarySummary } from "./types";

export async function listReferenceLibraries() {
  const { client, userId } = await createServiceSupabaseClient();
  const libraries = await listReferenceLibrariesByOwner(client, userId);
  return libraries.map(toReferenceLibrarySummary);
}

export async function createReferenceLibrary(input: CreateReferenceLibraryInput) {
  const { client, userId } = await createServiceSupabaseClient();
  const library = await createReferenceLibraryRecord(client, userId, input);
  return toReferenceLibrarySummary(library);
}

export async function getReferenceLibrary(referenceLibraryId: string) {
  const { client, userId } = await createServiceSupabaseClient();
  const library = await getReferenceLibraryById(client, userId, referenceLibraryId);
  return library ? toReferenceLibrarySummary(library) : null;
}

export async function updateReferenceLibrary(referenceLibraryId: string, input: UpdateReferenceLibraryInput) {
  const { client, userId } = await createServiceSupabaseClient();
  const library = await updateReferenceLibraryRecord(client, userId, referenceLibraryId, input);
  return library ? toReferenceLibrarySummary(library) : null;
}

export async function deleteReferenceLibrary(referenceLibraryId: string) {
  const { client, userId } = await createServiceSupabaseClient();
  await deleteReferenceLibraryRecord(client, userId, referenceLibraryId);
}
