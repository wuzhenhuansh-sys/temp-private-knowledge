const encoder = new TextEncoder();

export function utf8ByteLength(value: string) {
  return encoder.encode(value).byteLength;
}

export async function sha256Hex(value: string) {
  const bytes = encoder.encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
