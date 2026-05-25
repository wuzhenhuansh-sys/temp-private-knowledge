import { randomUUID } from "node:crypto";
import { config } from "../lib/config";
import { createServiceSupabaseClient } from "../lib/supabase";

function logStep(message: string) {
  console.log(`[supabase-storage-check] ${message}`);
}

async function main() {
  const { client, userId } = await createServiceSupabaseClient();
  const libraryId = randomUUID();
  const documentId = randomUUID();
  const storagePath = `${userId}/${libraryId}/${documentId}.md`;
  const markdown = [
    "# Storage Runtime Check",
    "",
    `- userId: ${userId}`,
    `- libraryId: ${libraryId}`,
    `- documentId: ${documentId}`,
  ].join("\n");

  let storageUploaded = false;

  try {
    logStep(`Using Supabase URL ${config.supabaseUrl}`);
    logStep(`Using bucket ${config.privateReferenceBucket}`);
    logStep(`Authenticated as ${userId}`);

    logStep(`Uploading storage object ${storagePath}`);
    const { error: uploadError } = await client.storage.from(config.privateReferenceBucket).upload(storagePath, markdown, {
      contentType: "text/markdown; charset=utf-8",
      upsert: false,
    });

    if (uploadError) throw uploadError;
    storageUploaded = true;
    logStep("Upload succeeded");

    logStep("Downloading uploaded object");
    const { data: downloadData, error: downloadError } = await client.storage
      .from(config.privateReferenceBucket)
      .download(storagePath);

    if (downloadError) throw downloadError;
    const downloadedMarkdown = await downloadData.text();
    if (downloadedMarkdown !== markdown) {
      throw new Error("Downloaded markdown does not match uploaded markdown.");
    }
    logStep("Download succeeded and content matches");

    logStep("Removing uploaded object");
    const { error: removeError } = await client.storage.from(config.privateReferenceBucket).remove([storagePath]);
    if (removeError) throw removeError;
    storageUploaded = false;
    logStep("Delete succeeded");

    logStep("Success: Storage upload/download/delete works with the current runtime auth configuration.");
  } finally {
    if (storageUploaded) {
      await client.storage.from(config.privateReferenceBucket).remove([storagePath]);
    }
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`[supabase-storage-check] ${error.message}`);
    const details = error as Error & {
      code?: string;
      details?: string;
      hint?: string;
      statusCode?: string;
      status?: number;
    };
    if (details.code) console.error(`[supabase-storage-check] code=${details.code}`);
    if (details.status) console.error(`[supabase-storage-check] status=${details.status}`);
    if (details.statusCode) console.error(`[supabase-storage-check] statusCode=${details.statusCode}`);
    if (details.details) console.error(`[supabase-storage-check] details=${details.details}`);
    if (details.hint) console.error(`[supabase-storage-check] hint=${details.hint}`);
  } else if (error && typeof error === "object") {
    console.error(`[supabase-storage-check] ${JSON.stringify(error, null, 2)}`);
  } else {
    console.error(`[supabase-storage-check] ${String(error)}`);
  }
  process.exit(1);
});
