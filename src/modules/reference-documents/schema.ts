import { z } from "zod";

export const createReferenceDocumentSchema = z.object({
  title: z.string().trim().min(1),
  markdown: z.string().min(1),
});

export const searchReferenceLibrarySchema = z.object({
  query: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).optional(),
});

export type CreateReferenceDocumentInput = z.infer<typeof createReferenceDocumentSchema>;
export type SearchReferenceLibraryInput = z.infer<typeof searchReferenceLibrarySchema>;
