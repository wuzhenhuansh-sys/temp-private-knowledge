export type ReferenceDocumentSummary = {
  id: string;
  referenceLibraryId: string;
  title: string;
  contentSize: number;
  indexStatus: string;
  indexError?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ReferenceDocumentContent = {
  id: string;
  referenceLibraryId: string;
  title: string;
  markdown: string;
  createdAt?: string;
  updatedAt?: string;
};
