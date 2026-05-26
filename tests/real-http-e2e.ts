import { randomUUID } from "node:crypto";
import serverConfig from "../src/index";
import { config } from "../src/lib/config";
import { createServiceSupabaseClient } from "../src/lib/supabase";

type ReferenceLibrary = {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  status: string;
};

type ReferenceLibraryListResponse = {
  referenceLibraries: ReferenceLibrary[];
};

type ReferenceDocumentListResponse = {
  documents: ReferenceDocument[];
};

type ReferenceDocument = {
  id: string;
  referenceLibraryId: string;
  title: string;
  contentSize: number;
  indexStatus: string;
};

type SearchResult = {
  response: string;
  document: {
    documentId: string;
    title: string;
    summary: string | null;
    indexStatus: string;
  } | null;
};

type Fixture = {
  key: string;
  title: string;
  filename: string;
  query: string;
};

const fixtures: Fixture[] = [
  {
    key: "ai",
    title: "AI Large Model Reference",
    filename: "ai-llm.md",
    query: "请检索和 RAG、MoE、embedding、上下文窗口相关的资料",
  },
  {
    key: "web3",
    title: "Web3 Infrastructure Reference",
    filename: "web3.md",
    query: "请检索和 钱包、智能合约、Layer2、Gas、EVM 相关的资料",
  },
  {
    key: "manufacturing",
    title: "Manufacturing Process Reference",
    filename: "manufacturing.md",
    query: "请检索和 BOM、MES、数控机床、公差、工艺路线 相关的资料",
  },
];

function logStep(message: string) {
  console.log(`[real-http-e2e] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`Response from ${path} is not valid JSON: ${raw}`);
    }
  }

  if (!response.ok) {
    throw new Error(`Request ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

async function waitForDocumentReady(baseUrl: string, referenceLibraryId: string, documentId: string, timeoutMs = 60000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const payload = await requestJson<{ document: ReferenceDocument }>(
      baseUrl,
      `/api/reference-libraries/${referenceLibraryId}/documents/${documentId}`,
    );

    if (payload.document.indexStatus === "ready") {
      return payload.document;
    }

    if (payload.document.indexStatus === "failed") {
      throw new Error(`Document ${documentId} indexing failed.`);
    }

    await Bun.sleep(1000);
  }

  throw new Error(`Timed out waiting for document ${documentId} to become ready.`);
}

async function main() {
  const { client, userId } = await createServiceSupabaseClient();
  const runId = randomUUID().slice(0, 8);
  const libraryName = `e2e-real-${runId}`;
  const server = Bun.serve({
    ...serverConfig,
    hostname: "127.0.0.1",
    port: 0,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  let libraryId: string | null = null;
  const documentIds: string[] = [];

  try {
    logStep(`Using Supabase URL ${config.supabaseUrl}`);
    logStep(`Authenticated as ${userId}`);
    logStep(`Started local API server at ${baseUrl}`);

    const createdLibrary = await requestJson<{ referenceLibrary: ReferenceLibrary }>(baseUrl, "/api/reference-libraries", {
      method: "POST",
      body: JSON.stringify({
        name: libraryName,
        description: "Real HTTP API end-to-end verification.",
      }),
    });
    libraryId = createdLibrary.referenceLibrary.id;
    logStep(`Created library ${libraryId}`);

    for (const fixture of fixtures) {
      const markdown = await Bun.file(`tests/fixtures/${fixture.filename}`).text();
      const createdDocument = await requestJson<{ document: ReferenceDocument }>(
        baseUrl,
        `/api/reference-libraries/${libraryId}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            title: fixture.title,
            markdown,
          }),
        },
      );

      documentIds.push(createdDocument.document.id);
      logStep(`Created document ${createdDocument.document.id} for fixture ${fixture.key}`);

      const contentPayload = await requestJson<{ document: { markdown: string } }>(
        baseUrl,
        `/api/reference-libraries/${libraryId}/documents/${createdDocument.document.id}/content`,
      );
      assert(contentPayload.document.markdown === markdown, `Content mismatch for ${fixture.filename}.`);

      const storagePath = `${userId}/${libraryId}/${createdDocument.document.id}.md`;
      const { data: storageData, error: storageError } = await client.storage
        .from(config.privateReferenceBucket)
        .download(storagePath);
      if (storageError) throw storageError;
      const storedMarkdown = await storageData.text();
      assert(storedMarkdown === markdown, `Storage content mismatch for ${fixture.filename}.`);
    }

    const libraryPayload = await requestJson<{ referenceLibrary: ReferenceLibrary }>(
      baseUrl,
      `/api/reference-libraries/${libraryId}`,
    );
    assert(libraryPayload.referenceLibrary.documentCount === fixtures.length, "Library document count is incorrect.");

    const listPayload = await requestJson<ReferenceLibraryListResponse>(baseUrl, "/api/reference-libraries");
    const listedLibrary = listPayload.referenceLibraries.find((library) => library.id === libraryId);
    assert(listedLibrary, "Created library is missing from the library list.");
    assert(listedLibrary.documentCount === fixtures.length, "Library list document count is incorrect.");

    const documentsPayload = await requestJson<ReferenceDocumentListResponse>(
      baseUrl,
      `/api/reference-libraries/${libraryId}/documents`,
    );
    assert(documentsPayload.documents.length === fixtures.length, "Documents list count is incorrect.");
    assert(
      listedLibrary.documentCount === documentsPayload.documents.length,
      "Library list document count does not match the documents endpoint.",
    );

    for (const documentId of documentIds) {
      await waitForDocumentReady(baseUrl, libraryId, documentId);
    }
    logStep("All documents reached ready status");

    const readyDocumentsPayload = await requestJson<ReferenceDocumentListResponse>(
      baseUrl,
      `/api/reference-libraries/${libraryId}/documents`,
    );
    assert(
      readyDocumentsPayload.documents.every((document) => document.indexStatus === "ready"),
      "Documents endpoint returned a non-ready document after indexing completed.",
    );

    const refreshedListPayload = await requestJson<ReferenceLibraryListResponse>(baseUrl, "/api/reference-libraries");
    const refreshedLibrary = refreshedListPayload.referenceLibraries.find((library) => library.id === libraryId);
    assert(refreshedLibrary, "Created library is missing from the refreshed library list.");
    assert(
      refreshedLibrary.documentCount === readyDocumentsPayload.documents.length,
      "Refreshed library list document count does not match the documents endpoint.",
    );

    const { data: embeddingRows, error: embeddingError } = await client
      .schema("public")
      .from("private_reference_document_embeddings")
      .select("document_id, embedding_model, summary_text")
      .eq("owner_user_id", userId)
      .in("document_id", documentIds);
    if (embeddingError) throw embeddingError;
    assert((embeddingRows ?? []).length === fixtures.length, "Embedding row count is incorrect.");
    for (const row of embeddingRows ?? []) {
      assert(typeof row.embedding_model === "string" && row.embedding_model.length > 0, "Embedding model is missing.");
      assert(typeof row.summary_text === "string" && row.summary_text.length > 0, "Embedding summary text is missing.");
    }
    logStep("Verified embedding rows in database");

    for (const fixture of fixtures) {
      const searchPayload = await requestJson<SearchResult>(baseUrl, `/api/reference-libraries/${libraryId}/search`, {
        method: "POST",
        body: JSON.stringify({
          query: fixture.query,
        }),
      });

      assert(searchPayload.document, `Search did not return a document for fixture ${fixture.key}.`);
      assert(searchPayload.document.title === fixture.title, `Search matched ${searchPayload.document.title} instead of ${fixture.title}.`);
      assert(searchPayload.document.indexStatus === "ready", `Search result for ${fixture.key} is not ready.`);
      logStep(`Verified recall for fixture ${fixture.key}`);
    }

    logStep("Success: full HTTP API ingestion, storage, embedding, and recall flow verified.");
  } finally {
    if (libraryId) {
      for (const documentId of [...documentIds].reverse()) {
        await fetch(`${baseUrl}/api/reference-libraries/${libraryId}/documents/${documentId}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }

      await fetch(`${baseUrl}/api/reference-libraries/${libraryId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }

    server.stop(true);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[real-http-e2e] ${message}`);
  process.exit(1);
});
