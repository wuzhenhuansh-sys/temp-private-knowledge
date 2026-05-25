import { Hono } from "hono";
import { PostgrestError } from "@supabase/supabase-js";
import { errorResponse } from "../../lib/response";
import { requireAuth, type AppVariables } from "../../app/auth";
import { createReferenceLibrarySchema, updateReferenceLibrarySchema } from "./schema";
import {
  createReferenceLibrary,
  deleteReferenceLibrary,
  getReferenceLibrary,
  listReferenceLibraries,
  updateReferenceLibrary,
} from "./service";

const routes = new Hono<{ Variables: AppVariables }>();

routes.use("*", requireAuth);

routes.get("/reference-libraries", async (c) => {
  const referenceLibraries = await listReferenceLibraries();
  return c.json({ referenceLibraries });
});

routes.post("/reference-libraries", async (c) => {
  const payload = createReferenceLibrarySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!payload.success) {
    return errorResponse(400, "invalid_request", "Invalid reference library payload.", {
      issues: payload.error.issues,
    });
  }

  try {
    const referenceLibrary = await createReferenceLibrary(payload.data);
    return c.json({ referenceLibrary }, 201);
  } catch (error) {
    if (error instanceof PostgrestError && error.code === "23505") {
      return errorResponse(409, "name_conflict", "Reference library name already exists.");
    }
    throw error;
  }
});

routes.get("/reference-libraries/:referenceLibraryId", async (c) => {
  const referenceLibrary = await getReferenceLibrary(c.req.param("referenceLibraryId"));
  if (!referenceLibrary) {
    return errorResponse(404, "not_found", "Reference library not found.");
  }
  return c.json({ referenceLibrary });
});

routes.patch("/reference-libraries/:referenceLibraryId", async (c) => {
  const payload = updateReferenceLibrarySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!payload.success) {
    return errorResponse(400, "invalid_request", "Invalid reference library payload.", {
      issues: payload.error.issues,
    });
  }

  try {
    const referenceLibrary = await updateReferenceLibrary(c.req.param("referenceLibraryId"), payload.data);
    if (!referenceLibrary) {
      return errorResponse(404, "not_found", "Reference library not found.");
    }
    return c.json({ referenceLibrary });
  } catch (error) {
    if (error instanceof PostgrestError && error.code === "23505") {
      return errorResponse(409, "name_conflict", "Reference library name already exists.");
    }
    throw error;
  }
});

routes.delete("/reference-libraries/:referenceLibraryId", async (c) => {
  await deleteReferenceLibrary(c.req.param("referenceLibraryId"));
  return c.json({ deleted: true, referenceLibraryId: c.req.param("referenceLibraryId") });
});

export default routes;
