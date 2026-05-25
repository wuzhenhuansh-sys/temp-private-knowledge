import { Hono } from "hono";
import healthRoutes from "./routes/health";
import referenceLibraryRoutes from "../modules/reference-libraries/routes";
import referenceDocumentRoutes from "../modules/reference-documents/routes";
import { errorResponse } from "../lib/response";

const app = new Hono();

app.route("/", healthRoutes);
app.route("/api", referenceLibraryRoutes);
app.route("/api", referenceDocumentRoutes);

app.notFound(() => errorResponse(404, "not_found", "Resource not found."));

app.onError((error) => {
  console.error("[private-knowledge] Unhandled error", error);
  return errorResponse(500, "internal_error", "Internal server error.");
});

export default app;
