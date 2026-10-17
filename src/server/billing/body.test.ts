import { describe, expect, it } from "vitest";
import { readCapped } from "./body";

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });

describe("a request body read with a hard cap (security review: never trust Content-Length alone)", () => {
  it("the bytes exactly, joined from the stream's chunks", async () => {
    const r = await readCapped(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), 10);
    expect(r).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3]) });
  });

  it("refused as soon as it passes the cap, whatever the header said, and the stream is cancelled", async () => {
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(400));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await readCapped(endless, 1000)).toEqual({ ok: false });
    expect(cancelled).toBe(true);
    expect(await readCapped(streamOf([new Uint8Array(10)]), 10)).toMatchObject({ ok: true });
    expect(await readCapped(streamOf([new Uint8Array(11)]), 10)).toEqual({ ok: false });
  });

  it("no body: empty bytes", async () => {
    expect(await readCapped(null, 10)).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });
});
