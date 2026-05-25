export type ReferenceLibraryRecord = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  status: string;
  document_count: number;
  created_at?: string;
  updated_at?: string;
};

export type ReferenceLibrarySummary = {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export function toReferenceLibrarySummary(record: ReferenceLibraryRecord): ReferenceLibrarySummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    documentCount: record.document_count,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
