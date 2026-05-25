import { createHash, randomUUID } from "node:crypto";
import { config } from "../lib/config";
import { createServiceSupabaseClient } from "../lib/supabase";

const schema = "public";
const librariesTable = "private_reference_libraries";
const documentsTable = "private_reference_documents";

function logStep(message: string) {
  console.log(`[supabase-runtime-check] ${message}`);
}

async function main() {
  const { client, userId } = await createServiceSupabaseClient();
  const libraryId = randomUUID();
  const documentId = randomUUID();
  const nameSuffix = libraryId.slice(0, 8);
  const libraryName = `runtime-check-${nameSuffix}`;
  const documentTitle = `runtime-check-doc-${nameSuffix}`;
  const storagePath = `${userId}/${libraryId}/${documentId}.md`;
  const markdown = [
    "# Runtime Check",
    "",
    `- userId: ${userId}`,
    `- libraryId: ${libraryId}`,
    `- documentId: ${documentId}`,
  ].join("\n");
  const contentSize = Buffer.byteLength(markdown, "utf8");
  const contentSha256 = createHash("sha256").update(markdown).digest("hex");

  let storageUploaded = false;
  let documentInserted = false;
  let libraryInserted = false;

  try {
    logStep(`Using Supabase URL ${config.supabaseUrl}`);
    logStep(`Authenticated as ${userId}`);

    logStep("Creating reference library record");
    const { data: insertedLibrary, error: insertLibraryError } = await client
      .schema(schema)
      .from(librariesTable)
      .insert({
        id: libraryId,
        owner_user_id: userId,
        name: libraryName,
        description: "Created by runtime connectivity check.",
      })
      .select("id, owner_user_id, name, description, status, document_count, created_at, updated_at")
      .single();

    if (insertLibraryError) throw insertLibraryError;
    libraryInserted = true;
    logStep(`Created library ${insertedLibrary.id}`);

    logStep("Reading library back");
    const { data: fetchedLibrary, error: fetchLibraryError } = await client
      .schema(schema)
      .from(librariesTable)
      .select("id, owner_user_id, name, description, status, document_count")
      .eq("id", libraryId)
      .single();

    if (fetchLibraryError) throw fetchLibraryError;
    logStep(`Fetched library ${fetchedLibrary.id} with name ${fetchedLibrary.name}`);

    logStep("Updating library description");
    const { data: updatedLibrary, error: updateLibraryError } = await client
      .schema(schema)
      .from(librariesTable)
      .update({
        description: "Updated by runtime connectivity check.",
      })
      .eq("id", libraryId)
      .select("id, description, updated_at")
      .single();

    if (updateLibraryError) throw updateLibraryError;
    logStep(`Updated library description to: ${updatedLibrary.description}`);

    logStep("Listing libraries for current user");
    const { data: listedLibraries, error: listLibrariesError } = await client
      .schema(schema)
      .from(librariesTable)
      .select("id, name")
      .order("updated_at", { ascending: false })
      .limit(5);

    if (listLibrariesError) throw listLibrariesError;
    const foundLibrary = (listedLibraries ?? []).some((library) => library.id === libraryId);
    logStep(`Library appears in list: ${foundLibrary}`);

    logStep(`Uploading markdown to bucket ${config.privateReferenceBucket}`);
    const { error: uploadError } = await client.storage.from(config.privateReferenceBucket).upload(storagePath, markdown, {
      contentType: "text/markdown; charset=utf-8",
      upsert: false,
    });

    if (uploadError) throw uploadError;
    storageUploaded = true;
    logStep(`Uploaded storage object ${storagePath}`);

    logStep("Downloading markdown from storage");
    const { data: downloadData, error: downloadError } = await client.storage
      .from(config.privateReferenceBucket)
      .download(storagePath);

    if (downloadError) throw downloadError;
    const downloadedMarkdown = await downloadData.text();
    if (downloadedMarkdown !== markdown) {
      throw new Error("Downloaded markdown does not match uploaded markdown.");
    }
    logStep("Downloaded markdown matches uploaded content");

    logStep("Creating reference document record");
    const { data: insertedDocument, error: insertDocumentError } = await client
      .schema(schema)
      .from(documentsTable)
      .insert({
        id: documentId,
        reference_library_id: libraryId,
        owner_user_id: userId,
        title: documentTitle,
        storage_bucket: config.privateReferenceBucket,
        storage_path: storagePath,
        content_size: contentSize,
        content_sha256: contentSha256,
        index_status: "pending",
      })
      .select("id, reference_library_id, owner_user_id, title, storage_bucket, storage_path, index_status")
      .single();

    if (insertDocumentError) throw insertDocumentError;
    documentInserted = true;
    logStep(`Created document ${insertedDocument.id}`);

    logStep("Reading document back");
    const { data: fetchedDocument, error: fetchDocumentError } = await client
      .schema(schema)
      .from(documentsTable)
      .select("id, title, storage_path, index_status")
      .eq("id", documentId)
      .single();

    if (fetchDocumentError) throw fetchDocumentError;
    logStep(`Fetched document ${fetchedDocument.id} with status ${fetchedDocument.index_status}`);

    logStep("Updating document summary");
    const { data: updatedDocument, error: updateDocumentError } = await client
      .schema(schema)
      .from(documentsTable)
      .update({
        summary: "Updated by runtime connectivity check.",
      })
      .eq("id", documentId)
      .select("id, summary")
      .single();

    if (updateDocumentError) throw updateDocumentError;
    logStep(`Updated document summary to: ${updatedDocument.summary}`);

    logStep("Deleting document record");
    const { error: deleteDocumentError } = await client.schema(schema).from(documentsTable).delete().eq("id", documentId);

    if (deleteDocumentError) throw deleteDocumentError;
    documentInserted = false;
    logStep("Deleted document record");

    logStep("Removing storage object");
    const { error: removeStorageError } = await client.storage.from(config.privateReferenceBucket).remove([storagePath]);
    if (removeStorageError) throw removeStorageError;
    storageUploaded = false;
    logStep("Removed storage object");

    logStep("Deleting library record");
    const { error: deleteLibraryError } = await client.schema(schema).from(librariesTable).delete().eq("id", libraryId);

    if (deleteLibraryError) throw deleteLibraryError;
    libraryInserted = false;
    logStep("Deleted library record");

    logStep("Success: DB CRUD and Storage operations are available with the current runtime auth configuration.");
  } finally {
    if (documentInserted) {
      await client.schema(schema).from(documentsTable).delete().eq("id", documentId);
    }

    if (storageUploaded) {
      await client.storage.from(config.privateReferenceBucket).remove([storagePath]);
    }

    if (libraryInserted) {
      await client.schema(schema).from(librariesTable).delete().eq("id", libraryId);
    }
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`[supabase-runtime-check] ${error.message}`);
    const details = error as Error & {
      code?: string;
      details?: string;
      hint?: string;
      status?: number;
    };
    if (details.code) console.error(`[supabase-runtime-check] code=${details.code}`);
    if (details.status) console.error(`[supabase-runtime-check] status=${details.status}`);
    if (details.details) console.error(`[supabase-runtime-check] details=${details.details}`);
    if (details.hint) console.error(`[supabase-runtime-check] hint=${details.hint}`);
  } else if (error && typeof error === "object") {
    console.error(`[supabase-runtime-check] ${JSON.stringify(error, null, 2)}`);
  } else {
    console.error(`[supabase-runtime-check] ${String(error)}`);
  }
  process.exit(1);
});
