/**
 * Redaction before any model call (SPEC §6, §21): local OCR (no external call) finds SSN-shaped
 * numbers and dates of birth, and they are blacked out on the copy of the page that is sent to the
 * model. Work dates are kept. Known limit: handwriting the OCR cannot read is not found here, so
 * model output is also scanned and any SSN-shaped text is dropped (see pipeline.ts).
 */
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { createWorker, OEM, type Worker } from "tesseract.js";
import { packageDir } from "../package-dir";

export type SensitiveKind = "ssn" | "dob";
export interface Region {
  kind: SensitiveKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const SSN = /(?<![\d-])\d{3}[- ]?\d{2}[- ]?\d{4}(?![\d-])/g;
const DATE = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)|(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;
const BIRTH_WORDS = /\b(dob|d\.o\.b\.?|birth|born|birthday|fecha de nacimiento|nacimiento|nac\.?)\b/i;

/** Character spans of sensitive text in one line of OCR text. */
export function sensitiveSpans(line: string, periodYear: number): { kind: SensitiveKind; start: number; end: number }[] {
  const spans: { kind: SensitiveKind; start: number; end: number }[] = [];
  for (const m of line.matchAll(SSN)) spans.push({ kind: "ssn", start: m.index, end: m.index + m[0].length });
  const birthLine = BIRTH_WORDS.test(line);
  for (const m of line.matchAll(DATE)) {
    if (spans.some((s) => m.index < s.end && s.start < m.index + m[0].length)) continue;
    const yearText = m[3] ?? m[4] ?? "";
    let year = Number(yearText);
    if (yearText.length === 2) year = year + 2000 > periodYear ? 1900 + year : 2000 + year;
    // Anyone working is at least 14; a date that old on a timesheet is a birth date, not a work date.
    if (birthLine || year <= periodYear - 14) spans.push({ kind: "dob", start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

let workerPromise: Promise<Worker> | null = null;

/** The bundled English model (found as packageDir finds any package's own files). */
export function ocrLanguageDir(): string {
  const model = join("4.0.0_best_int", "eng.traineddata.gz");
  try {
    return join(packageDir("@tesseract.js-data/eng", model, [() => dirname(createRequire(import.meta.url).resolve("@tesseract.js-data/eng/package.json"))]), "4.0.0_best_int");
  } catch {
    // said plainly below
  }
  throw new Error("The text-recognition model (@tesseract.js-data/eng) is not installed, so identifying numbers cannot be blacked out.");
}

function ocrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", OEM.LSTM_ONLY, {
      langPath: ocrLanguageDir(),
      cachePath: join(tmpdir(), "shiftbook-ocr-cache"),
      gzip: true,
      // Errors reject the job's own promise instead of crashing the server process.
      errorHandler: () => undefined,
    }).catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function closeOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    workerPromise = null;
    await w.terminate();
  }
}

interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

async function ocrLines(image: Buffer): Promise<OcrWord[][]> {
  const worker = await ocrWorker();
  const { data } = await worker.recognize(image, {}, { blocks: true });
  const lines: OcrWord[][] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) lines.push(line.words.map((w) => ({ text: w.text, bbox: w.bbox })));
    }
  }
  return lines;
}

export async function ocrText(image: Buffer): Promise<string> {
  return (await ocrLines(image)).map((l) => l.map((w) => w.text).join(" ")).join("\n");
}

export async function findSensitiveRegions(image: Buffer, periodYear: number): Promise<Region[]> {
  const regions: Region[] = [];
  for (const words of await ocrLines(image)) {
    const text = words.map((w) => w.text).join(" ");
    const offsets: number[] = [];
    let at = 0;
    for (const w of words) {
      offsets.push(at);
      at += w.text.length + 1;
    }
    for (const span of sensitiveSpans(text, periodYear)) {
      const covered = words.filter((w, i) => offsets[i]! < span.end && span.start < offsets[i]! + w.text.length);
      if (covered.length === 0) continue;
      regions.push({
        kind: span.kind,
        x0: Math.min(...covered.map((w) => w.bbox.x0)),
        y0: Math.min(...covered.map((w) => w.bbox.y0)),
        x1: Math.max(...covered.map((w) => w.bbox.x1)),
        y1: Math.max(...covered.map((w) => w.bbox.y1)),
      });
    }
  }
  return regions;
}

/** Black boxes (with a small margin) over each region. */
export async function redact(image: Buffer, regions: Region[]): Promise<Buffer> {
  if (regions.length === 0) return image;
  const meta = await sharp(image).metadata();
  const pad = 6;
  const rects = regions
    .map((r) => `<rect x="${Math.max(0, r.x0 - pad)}" y="${Math.max(0, r.y0 - pad)}" width="${r.x1 - r.x0 + 2 * pad}" height="${r.y1 - r.y0 + 2 * pad}" fill="#000"/>`)
    .join("");
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${rects}</svg>`);
  return sharp(image).composite([{ input: overlay }]).jpeg({ quality: 90 }).toBuffer();
}
