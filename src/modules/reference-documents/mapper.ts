import type { ReferenceDocumentContent, ReferenceDocumentSummary } from "./types";
import type { ReferenceDocumentRecord } from "./repository";

export function toReferenceDocumentSummary(record: ReferenceDocumentRecord): ReferenceDocumentSummary {
  return {
    id: record.id,
    referenceLibraryId: record.reference_library_id,
    title: record.title,
    contentSize: record.content_size,
    indexStatus: record.index_status,
    indexError: record.index_error,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function toReferenceDocumentContent(record: ReferenceDocumentRecord, markdown: string): ReferenceDocumentContent {
  return {
    id: record.id,
    referenceLibraryId: record.reference_library_id,
    title: record.title,
    markdown,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
