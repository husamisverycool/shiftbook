import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractionOutput } from "./output-schema";
import { buildPassRequest } from "./prompts";
import { RecordedTransport, RecordingMissingError, RecordingTransport, requestHash, type ExtractionTransport } from "./transport";

const output: ExtractionOutput = {
  documentType: "daily_sign_in_sheet",
  clientName: "Example Client",
  shiftLabel: "2nd",
  sheetDate: "2026-10-06",
  rows: [],
  workerTotals: [],
  grandTotalMinutes: null,
};

const req = (pass: "A" | "B", image = Buffer.from("fake-jpeg-bytes")) =>
  buildPassRequest({ pass, image, period: { startsOn: "2026-10-05", endsOn: "2026-10-11" }, clients: ["Example Client"] });

describe("pass requests", () => {
  it("uses Claude Opus 5.5 and two genuinely different prompts", () => {
    const a = req("A");
    const b = req("B");
    expect(a.model).toBe("claude-opus-5-5");
    expect(a.system).not.toBe(b.system);
    expect(a.instructions).not.toBe(b.instructions);
    expect(a.promptVersion).not.toBe(b.promptVersion);
    expect(a.instructions).toContain("2026-10-05");
    expect(a.instructions).toContain("Example Client");
  });

  it("tells the model never to return identifying numbers", () => {
    expect(req("A").system.toLowerCase()).toContain("social security");
    expect(req("B").system.toLowerCase()).toContain("social security");
  });
});

describe("requestHash", () => {
  it("is stable for the same request and changes with the image, pass or prompt", () => {
    expect(requestHash(req("A"))).toBe(requestHash(req("A")));
    expect(requestHash(req("A"))).not.toBe(requestHash(req("B")));
    expect(requestHash(req("A"))).not.toBe(requestHash(req("A", Buffer.from("other-image"))));
  });
});

describe("recorded answers (demo mode and tests: no outside calls)", () => {
  it("records a live answer once, then replays it without calling out", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sb-rec-"));
    let calls = 0;
    const live: ExtractionTransport = {
      run: async () => {
        calls += 1;
        return output;
      },
    };
    await new RecordingTransport(live, dir).run(req("A"));
    expect(calls).toBe(1);
    expect(readdirSync(dir)).toEqual([`${requestHash(req("A"))}.json`]);
    const replayed = await new RecordedTransport(dir).run(req("A"));
    expect(replayed).toEqual(output);
    expect(calls).toBe(1);
  });

  it("explains plainly when a document has no recorded answer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sb-rec-"));
    await expect(new RecordedTransport(dir).run(req("A"))).rejects.toBeInstanceOf(RecordingMissingError);
  });
});
