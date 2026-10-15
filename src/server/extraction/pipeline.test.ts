import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { LocalDocumentStore } from "../storage";
import type { ExtractionOutput } from "./output-schema";
import { createImageReader } from "./pipeline";
import { closeOcr, ocrText } from "./redact";
import type { ExtractionTransport, PassRequest } from "./transport";

afterAll(() => closeOcr());

const TEST_SSN = "912-34-5678"; // 9xx only

async function sheet(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="100%" height="100%" fill="#fff"/>
    <g font-family="DejaVu Sans, Arial" font-size="40" fill="#111">
      <text x="50" y="100">Sign-in sheet 10/06/2026</text>
      <text x="50" y="220">Bob Jones   3:00   11:30   30   8</text>
      <text x="50" y="340">SSN ${TEST_SSN}</text>
    </g></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

function answer(over: Partial<ExtractionOutput["rows"][number]> = {}, name = "Bob Jones"): ExtractionOutput {
  const b = (x: number) => ({ x, y: 330, w: 60, h: 40 });
  return {
    documentType: "daily_sign_in_sheet",
    clientName: "Prairie Line Manufacturing",
    shiftLabel: "2nd",
    sheetDate: "2026-10-06",
    rows: [
      {
        workerName: { text: name, box: { x: 40, y: 330, w: 220, h: 40 } },
        date: { text: null, iso: null, box: null },
        timeIn: { text: "3:00", minutes: 900, box: b(330) },
        timeOut: { text: "11:30", minutes: 1410, box: b(450) },
        breakMinutes: { text: "30", minutes: 30, box: b(590) },
        totalHours: { text: "8", minutes: 480, box: b(680) },
        handwritten: true,
        crossedOut: [],
        ...over,
      },
    ],
    workerTotals: [],
    grandTotalMinutes: null,
  };
}

class FakeTransport implements ExtractionTransport {
  requests: PassRequest[] = [];
  constructor(private readonly respond: (r: PassRequest) => ExtractionOutput) {}
  async run(r: PassRequest) {
    this.requests.push(r);
    return this.respond(r);
  }
}

const period = { startsOn: "2026-10-05", endsOn: "2026-10-11" };

describe("image reading pipeline", () => {
  it("sends only the redacted page to the model, in two different passes", async () => {
    const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-pipe-")));
    // Pass B sees a cropped image; give it boxes in its own frame that map back to pass A's.
    const transport = new FakeTransport((r) => (r.pass === "A" ? answer() : answer({}, "Bob Jones")));
    const reader = createImageReader({ transport, store });
    const result = await reader.read({ agencyId: "agency-1", documentId: "doc-1", filename: "sheet.jpg", mediaType: "image/jpeg", bytes: await sheet(), period, clients: ["Prairie Line Manufacturing (demo)"] });

    expect(transport.requests.map((r) => r.pass).sort()).toEqual(["A", "B"]);
    for (const r of transport.requests) {
      const seen = await ocrText(Buffer.from(r.image.base64, "base64"));
      expect(seen).not.toContain("912");
    }
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.redactions).toBe(1);
    const original = await store.get(result.pages[0]!.storageKey);
    const redacted = await store.get(result.pages[0]!.redactedStorageKey);
    expect(Buffer.compare(Buffer.from(original), Buffer.from(redacted))).not.toBe(0);
    expect(result.parsed.kind).toBe("image");
    expect(result.parsed.clientHint).toBe("Prairie Line Manufacturing");
    expect(result.parsed.entries).toHaveLength(1);
  }, 90_000);

  it("drops any identifying number the model returns anyway", async () => {
    const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-pipe-")));
    const leaky = (): ExtractionOutput => answer({}, `Bob Jones ${TEST_SSN}`);
    const reader = createImageReader({ transport: new FakeTransport(leaky), store });
    const result = await reader.read({ agencyId: "agency-1", documentId: "doc-2", filename: "sheet.jpg", mediaType: "image/jpeg", bytes: await sheet(), period, clients: [] });
    const text = JSON.stringify(result.parsed);
    expect(text).not.toContain("912-34-5678");
    expect(result.parsed.notes.join(" ")).toMatch(/identifying number/);
  }, 90_000);
});
