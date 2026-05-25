import { z } from "zod";

export const createReferenceLibrarySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});

export const updateReferenceLibrarySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.name || value.description, {
    message: "At least one field is required.",
  });

export type CreateReferenceLibraryInput = z.infer<typeof createReferenceLibrarySchema>;
export type UpdateReferenceLibraryInput = z.infer<typeof updateReferenceLibrarySchema>;
