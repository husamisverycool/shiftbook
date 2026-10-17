/**
 * A request body read with a hard cap (security review of decision 0036): the stream itself is counted,
 * so a missing or false Content-Length cannot make the server hold more than the cap.
 */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  if (!body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes };
}
