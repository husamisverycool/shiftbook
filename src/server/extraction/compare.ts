/**
 * Compares the two independent extraction passes of one page (SPEC §6). A value counts as agreed
 * only when both passes read the same value AND found it in the same place on the page. Every value
 * keeps its provenance (page, box) from pass A. Rows only one pass saw are kept, never agreed.
 * Deterministic cross-checks: a reading's number must fit its written text, and per-worker and
 * grand totals written on the document must add up.
 */
import type { Box } from "../db/schema";
import { foldName } from "../intake/names";
import { parseClockText, parseDecimalHours, parseWholeMinutes } from "../intake/parse";
import type { FieldReading, RawEntry } from "../intake/types";
import type { ExtractedRow, ExtractionOutput } from "./output-schema";

/** Overlap of two boxes as intersection / union, in thousandths (0–1000), integer-rounded. */
export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  if (union <= 0) return 0;
  return Math.floor((inter * 1000 * 2 + union) / (2 * union));
}

/** Pass B reads a cropped image; this maps its boxes back to page thousandths. */
export function mapCropBoxToPage(b: Box, crop: Box): Box {
  const scale = (v: number, size: number) => Math.floor((v * size * 2 + 1000) / 2000);
  return { x: crop.x + scale(b.x, crop.w), y: crop.y + scale(b.y, crop.h), w: scale(b.w, crop.w), h: scale(b.h, crop.h) };
}

/** Boxes agree when they overlap by at least 20% of their union. */
export const BOX_AGREEMENT_MIN = 200;

type Cell = { text: string | null; minutes?: number | null; iso?: string | null; box: Box | null };

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return iou(a, b) >= BOX_AGREEMENT_MIN;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function consistent(field: "in" | "out" | "break" | "total", text: string | null, minutes: number | null): boolean {
  if (text === null || minutes === null) return true;
  if (field === "in" || field === "out") {
    const r = parseClockText(text);
    if (!r) return true; // unparseable text is judged by the passes, not here
    if (r.meridiem === null) return minutes % 720 === r.minute % 720 || (minutes === 1440 && r.minute % 720 === 0);
    return minutes === r.minute || (minutes === 1440 && r.minute === 0);
  }
  if (field === "break") {
    const m = parseWholeMinutes(text);
    return m === null || m === minutes;
  }
  const m = parseDecimalHours(text);
  return m === null || m === minutes;
}

export interface PageReading {
  clientHint: string | null;
  entries: RawEntry[];
}

export function comparePasses(a: ExtractionOutput, b: ExtractionOutput, mapB: (box: Box) => Box, pageNumber: number): PageReading {
  const rowDate = (out: ExtractionOutput, r: ExtractedRow) => r.date.iso ?? out.sheetDate;
  const key = (out: ExtractionOutput, r: ExtractedRow) => `${foldName(r.workerName.text ?? "")}|${rowDate(out, r) ?? ""}`;
  const usedB = new Set<number>();
  const pairs: { ra: ExtractedRow | null; rb: ExtractedRow | null }[] = [];

  a.rows.forEach((ra, ia) => {
    let jb = b.rows.findIndex((rb, j) => !usedB.has(j) && key(b, rb) === key(a, ra));
    if (jb < 0) {
      const rb = b.rows[ia];
      const close = rb && !usedB.has(ia) && rowDate(b, rb) === rowDate(a, ra) && editDistance(foldName(rb.workerName.text ?? ""), foldName(ra.workerName.text ?? "")) <= 2;
      if (close) jb = ia;
    }
    if (jb >= 0) usedB.add(jb);
    pairs.push({ ra, rb: jb >= 0 ? b.rows[jb]! : null });
  });
  b.rows.forEach((rb, j) => {
    if (!usedB.has(j)) pairs.push({ ra: null, rb });
  });

  const entries: RawEntry[] = pairs.map(({ ra, rb }, rowIndex) => {
    const main = ra ?? rb!;
    const mainOut = ra ? a : b;
    const lone = !ra || !rb;
    const handwritten = Boolean(ra?.handwritten || rb?.handwritten);
    const mainBox = (box: Box | null) => (box && !ra ? mapB(box) : box);
    const checks: string[] = lone ? ["seen_by_one_pass"] : [];

    const field = <T>(value: T | null, text: string | null, ca: Cell | null, cb: Cell | null, equal: boolean): FieldReading<T> => ({
      text,
      value,
      page: pageNumber,
      box: mainBox((ra ? ca?.box : cb?.box) ?? null),
      passA: ca ? (ca.text ?? ca.iso ?? null) : null,
      passB: cb ? (cb.text ?? cb.iso ?? null) : null,
      agree: !lone && equal && sameBox(ca?.box ?? null, cb?.box ? mapB(cb.box) : null),
      handwritten,
    });

    const nameA = ra?.workerName ?? null;
    const nameB = rb?.workerName ?? null;
    const worker = field<string>(
      main.workerName.text,
      main.workerName.text,
      nameA,
      nameB,
      foldName(nameA?.text ?? "") === foldName(nameB?.text ?? ""),
    );

    const isoA = ra ? rowDate(a, ra) : null;
    const isoB = rb ? rowDate(b, rb) : null;
    const date: FieldReading<string> = {
      ...field<string>(rowDate(mainOut, main), main.date.text ?? rowDate(mainOut, main), ra ? { ...ra.date, text: isoA } : null, rb ? { ...rb.date, text: isoB } : null, isoA === isoB),
    };

    const minutesField = (name: "in" | "out" | "break" | "total", pick: (r: ExtractedRow) => Cell & { minutes: number | null }) => {
      const ca = ra ? pick(ra) : null;
      const cb = rb ? pick(rb) : null;
      const m = pick(main);
      if ((ca?.text ?? null) === null && (ca?.minutes ?? null) === null && (cb?.text ?? null) === null && (cb?.minutes ?? null) === null) return null;
      if (!consistent(name, m.text, m.minutes)) checks.push(`inconsistent_reading:${name}`);
      return field<number>(m.minutes, m.text, ca, cb, (ca?.minutes ?? null) === (cb?.minutes ?? null));
    };

    return {
      rowIndex,
      worker,
      date,
      in: minutesField("in", (r) => r.timeIn),
      out: minutesField("out", (r) => r.timeOut),
      break: minutesField("break", (r) => r.breakMinutes),
      total: minutesField("total", (r) => r.totalHours),
      externalId: null,
      checks,
    };
  });

  // Totals written on the document must equal the sum of the rows read.
  const minutesOf = (e: RawEntry) => e.total?.value ?? (e.in?.value != null && e.out?.value != null ? e.out.value - e.in.value - (e.break?.value ?? 0) : 0);
  for (const t of a.workerTotals) {
    const mine = entries.filter((e) => foldName(e.worker.value ?? "") === foldName(t.workerName));
    const sum = mine.reduce((s, e) => s + minutesOf(e), 0);
    if (mine.length > 0 && sum !== t.minutes) for (const e of mine) e.checks.push("row_total_mismatch");
  }
  if (a.grandTotalMinutes !== null) {
    const sum = entries.reduce((s, e) => s + minutesOf(e), 0);
    if (sum !== a.grandTotalMinutes) for (const e of entries) e.checks.push("grand_total_mismatch");
  }

  return { clientHint: a.clientName ?? b.clientName, entries };
}
