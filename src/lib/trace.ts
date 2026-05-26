type EventDetails = Record<string, string | number | boolean | null | undefined>;

function isEnabled() {
  return process.env.INDEXING_TRACE?.trim() === "1";
}

export function traceIndexing(event: string, details: EventDetails = {}) {
  if (!isEnabled()) {
    return;
  }

  console.log(`[indexing-trace] ${event} ${JSON.stringify(details)}`);
}
