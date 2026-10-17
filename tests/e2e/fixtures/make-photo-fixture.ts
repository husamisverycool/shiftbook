/**
 * TEST FIXTURE, not demo data: printed sign-in sheet images and hand-written "recorded readings"
 * for them, so the end-to-end tests can exercise the photo path (redaction, two passes, comparison,
 * review grid, source panel with boxes) without calling a model. The answers below were written by
 * hand to match the images; they are not a model's output and are never used by the demo.
 *   pnpm exec tsx tests/e2e/fixtures/make-photo-fixture.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { CLIENTS, CURRENT_PERIOD } from "../../../src/server/demo/dataset";
import { PASS_B_CROP } from "../../../src/server/extraction/images";
import type { ExtractionOutput } from "../../../src/server/extraction/output-schema";
import { createImageReader } from "../../../src/server/extraction/pipeline";
import { closeOcr } from "../../../src/server/extraction/redact";
import { RecordingTransport, type ExtractionTransport, type PassRequest } from "../../../src/server/extraction/transport";
import { LocalDocumentStore } from "../../../src/server/storage";

const OUT = "tests/e2e/fixtures";
const W = 1200;
const H = 700;
const box = (x: number, y: number, w: number, h: number) => ({ x: Math.round((x * 1000) / W), y: Math.round((y * 1000) / H), w: Math.round((w * 1000) / W), h: Math.round((h * 1000) / H) });

type Row = { name: string; y: number; in: readonly [string, number]; out: readonly [string, number]; brk: readonly [string, number]; total: readonly [string, number] };
/**
 * Two sheets. The first reads cleanly. The second is the kind a person must check: Kateryna's written
 * total (8) does not match her times (3:00 PM to 11:00 PM less 30 minutes is 7:30), and a visitor who
 * is not on the roster signed in.
 */
const SHEETS: { file: string; date: string; iso: string; rows: Row[] }[] = [
  {
    file: "photo-sign-in-2026-10-06.jpg",
    date: "10/06/2026",
    iso: "2026-10-06",
    rows: [
      { name: "Robert Jones", y: 260, in: ["3:00 PM", 900], out: ["11:30 PM", 1410], brk: ["30", 30], total: ["8", 480] },
      { name: "Kateryna Bondarenko", y: 340, in: ["3:00 PM", 900], out: ["11:00 PM", 1380], brk: ["30", 30], total: ["7.5", 450] },
    ],
  },
  {
    file: "photo-sign-in-2026-10-07.jpg",
    date: "10/07/2026",
    iso: "2026-10-07",
    rows: [
      { name: "Robert Jones", y: 260, in: ["3:00 PM", 900], out: ["11:30 PM", 1410], brk: ["30", 30], total: ["8", 480] },
      { name: "Kateryna Bondarenko", y: 340, in: ["3:00 PM", 900], out: ["11:00 PM", 1380], brk: ["30", 30], total: ["8", 480] },
      { name: "Dale Whitcomb", y: 420, in: ["3:00 PM", 900], out: ["7:00 PM", 1140], brk: ["0", 0], total: ["4", 240] },
    ],
  },
];

const svgOf = (sheet: (typeof SHEETS)[number]) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>
  <g font-family="DejaVu Sans, Arial" fill="#111">
    <text x="60" y="90" font-size="34">Prairie Line Manufacturing - 2nd shift sign-in</text>
    <text x="60" y="140" font-size="30">Date: ${sheet.date}</text>
    <text x="60" y="200" font-size="26">Name</text><text x="520" y="200" font-size="26">In</text><text x="700" y="200" font-size="26">Out</text><text x="880" y="200" font-size="26">Lunch</text><text x="1020" y="200" font-size="26">Total</text>
    ${sheet.rows.map((r) => `<text x="60" y="${r.y}" font-size="30">${r.name}</text><text x="520" y="${r.y}" font-size="30">${r.in[0]}</text><text x="700" y="${r.y}" font-size="30">${r.out[0]}</text><text x="880" y="${r.y}" font-size="30">${r.brk[0]}</text><text x="1020" y="${r.y}" font-size="30">${r.total[0]}</text>`).join("\n")}
  </g></svg>`;

function answer(sheet: (typeof SHEETS)[number], pass: "A" | "B"): ExtractionOutput {
  // Pass B sees the page cropped by PASS_B_CROP; give its boxes in that frame.
  const frame = (b: ReturnType<typeof box>) =>
    pass === "A"
      ? b
      : {
          x: Math.round(((b.x - PASS_B_CROP.x) * 1000) / PASS_B_CROP.w),
          y: Math.round(((b.y - PASS_B_CROP.y) * 1000) / PASS_B_CROP.h),
          w: Math.round((b.w * 1000) / PASS_B_CROP.w),
          h: Math.round((b.h * 1000) / PASS_B_CROP.h),
        };
  return {
    documentType: "daily_sign_in_sheet",
    clientName: "Prairie Line Manufacturing",
    shiftLabel: "2nd",
    sheetDate: sheet.iso,
    rows: sheet.rows.map((r) => ({
      workerName: { text: r.name, box: frame(box(55, r.y - 32, 400, 42)) },
      date: { text: null, iso: null, box: null },
      timeIn: { text: r.in[0], minutes: r.in[1], box: frame(box(515, r.y - 32, 150, 42)) },
      timeOut: { text: r.out[0], minutes: r.out[1], box: frame(box(695, r.y - 32, 170, 42)) },
      breakMinutes: { text: r.brk[0], minutes: r.brk[1], box: frame(box(875, r.y - 32, 60, 42)) },
      totalHours: { text: r.total[0], minutes: r.total[1], box: frame(box(1015, r.y - 32, 70, 42)) },
      handwritten: false,
      crossedOut: [],
    })),
    workerTotals: [],
    grandTotalMinutes: null,
  };
}

async function main() {
  mkdirSync(`${OUT}/recordings`, { recursive: true });
  for (const sheet of SHEETS) {
    const handWritten: ExtractionTransport = { run: async (r: PassRequest) => answer(sheet, r.pass) };
    const bytes = await sharp(Buffer.from(svgOf(sheet))).jpeg({ quality: 92 }).toBuffer();
    writeFileSync(`${OUT}/${sheet.file}`, bytes);
    const reader = createImageReader({ transport: new RecordingTransport(handWritten, `${OUT}/recordings`), store: new LocalDocumentStore(".storage-fixture") });
    const result = await reader.read({
      agencyId: "00000000-0000-4000-a000-000000000000",
      documentId: "fixture",
      filename: sheet.file,
      mediaType: "image/jpeg",
      bytes: new Uint8Array(bytes),
      period: { startsOn: CURRENT_PERIOD.startsOn, endsOn: CURRENT_PERIOD.endsOn },
      clients: Object.values(CLIENTS).map((c) => c.name).sort(),
    });
    console.log(`${sheet.file}: rows read: ${result.parsed.entries.length}; checks: ${JSON.stringify(result.parsed.entries.map((e) => e.checks))}`);
  }
  await closeOcr();
}

void main();
