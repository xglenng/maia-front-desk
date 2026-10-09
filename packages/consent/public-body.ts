export class PublicBodyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Bound actual streamed bytes even when Content-Length is absent or misleading. */
export async function readPublicJson(request: Request, maximum = 64 * 1024): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    const size = Number(length);
    if (!Number.isSafeInteger(size) || size < 0) throw new PublicBodyError("Invalid request size.", 400);
    if (size > maximum) throw new PublicBodyError("Request is too large.", 413);
  }
  if (!request.body) throw new PublicBodyError("Invalid JSON body.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new PublicBodyError("Request is too large.", 413);
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new PublicBodyError("Invalid JSON body.", 400); }
  } finally { reader.releaseLock(); }
}
