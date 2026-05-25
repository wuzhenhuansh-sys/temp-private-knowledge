import { Hono } from "hono";
import { errorResponse } from "../../lib/response";
import { requireAuth, type AppVariables } from "../../app/auth";
import { createReferenceDocumentSchema, searchReferenceLibrarySchema } from "./schema";
import {
  assertMarkdownSize,
  createReferenceDocument,
  deleteReferenceDocument,
  getReferenceDocument,
  getReferenceDocumentContent,
  listReferenceDocuments,
  searchReferenceLibrary,
} from "./service";

const routes = new Hono<{ Variables: AppVariables }>();

routes.use("*", requireAuth);

routes.get("/reference-libraries/:referenceLibraryId/documents", async (c) => {
  const documents = await listReferenceDocuments(c.req.param("referenceLibraryId"));
  if (!documents) {
    return errorResponse(404, "not_found", "Reference library not found.");
  }
  return c.json({ documents });
});

routes.post("/reference-libraries/:referenceLibraryId/documents", async (c) => {
  const payload = createReferenceDocumentSchema.safeParse(await c.req.json().catch(() => ({}) as unknown));
  if (!payload.success) {
    return errorResponse(400, "invalid_request", "Invalid reference document payload.", {
      issues: payload.error.issues,
    });
  }

  const sizeCheck = assertMarkdownSize(payload.data.markdown);
  if (!sizeCheck.ok) {
    return errorResponse(413, "content_too_large", "Markdown content is too large.", {
      maxBytes: sizeCheck.maxBytes,
    });
  }

  const document = await createReferenceDocument(c.req.param("referenceLibraryId"), payload.data);
  if (!document) {
    return errorResponse(404, "not_found", "Reference library not found.");
  }
  return c.json({ document }, 201);
});

routes.get("/reference-libraries/:referenceLibraryId/documents/:documentId", async (c) => {
  const document = await getReferenceDocument(c.req.param("referenceLibraryId"), c.req.param("documentId"));
  if (!document) {
    return errorResponse(404, "not_found", "Reference document not found.");
  }
  return c.json({ document });
});

routes.get("/reference-libraries/:referenceLibraryId/documents/:documentId/content", async (c) => {
  const document = await getReferenceDocumentContent(c.req.param("referenceLibraryId"), c.req.param("documentId"));
  if (!document) {
    return errorResponse(404, "not_found", "Reference document not found.");
  }
  return c.json({ document });
});

routes.delete("/reference-libraries/:referenceLibraryId/documents/:documentId", async (c) => {
  const deleted = await deleteReferenceDocument(c.req.param("referenceLibraryId"), c.req.param("documentId"));
  if (!deleted) {
    return errorResponse(404, "not_found", "Reference document not found.");
  }
  return c.json({ deleted: true, documentId: c.req.param("documentId") });
});

routes.post("/reference-libraries/:referenceLibraryId/search", async (c) => {
  const payload = searchReferenceLibrarySchema.safeParse(await c.req.json().catch(() => ({}) as unknown));
  if (!payload.success) {
    return errorResponse(400, "invalid_request", "Invalid search payload.", {
      issues: payload.error.issues,
    });
  }

  const result = await searchReferenceLibrary(c.req.param("referenceLibraryId"), payload.data);
  if (!result) {
    return errorResponse(404, "not_found", "Reference library not found.");
  }
  return c.json({ response: result.response, document: result.document, indexStatus: result.indexStatus });
});

export default routes;
