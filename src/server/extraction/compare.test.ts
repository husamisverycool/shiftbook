import { describe, expect, it } from "vitest";
import { comparePasses, iou, mapCropBoxToPage } from "./compare";
import type { ExtractedRow, ExtractionOutput } from "./output-schema";

const box = (x: number, y: number, w = 40, h = 20) => ({ x, y, w, h });
const cell = (text: string | null, minutes: number | null, b = box(100, 100)) => ({ text, minutes, box: b });

function row(name: string, over: Partial<ExtractedRow> = {}, y = 200): ExtractedRow {
  return {
    workerName: { text: name, box: box(80, y, 200, 30) },
    date: { text: null, iso: null, box: null },
    timeIn: cell("3:00", 900, box(400, y)),
    timeOut: cell("11:30", 1410, box(500, y)),
    breakMinutes: cell("30", 30, box(600, y)),
    totalHours: cell("8", 480, box(700, y)),
    handwritten: true,
    crossedOut: [],
    ...over,
  };
}

function output(rows: ExtractedRow[], over: Partial<ExtractionOutput> = {}): ExtractionOutput {
  return {
    documentType: "daily_sign_in_sheet",
    clientName: "Prairie Line Manufacturing",
    shiftLabel: "2nd",
    sheetDate: "2026-10-06",
    rows,
    workerTotals: [],
    grandTotalMinutes: null,
    ...over,
  };
}

const identity = (b: { x: number; y: number; w: number; h: number }) => b;

describe("comparePasses", () => {
  it("accepts values both passes read the same way, keeping pass A's boxes", () => {
    const r = comparePasses(output([row("Bob Jones")]), output([row("Bob Jones")]), identity, 1);
    expect(r.clientHint).toBe("Prairie Line Manufacturing");
    expect(r.entries).toHaveLength(1);
    const e = r.entries[0]!;
    expect(e.worker).toMatchObject({ value: "Bob Jones", agree: true, handwritten: true, page: 1, passA: "Bob Jones", passB: "Bob Jones" });
    expect(e.date).toMatchObject({ value: "2026-10-06", agree: true });
    expect(e.out).toMatchObject({ value: 1410, agree: true, box: box(500, 200) });
    expect(e.checks).toEqual([]);
  });

  it("marks a value the passes read differently", () => {
    const b = row("Bob Jones", { timeOut: cell("11:50", 1430, box(500, 200)) });
    const e = comparePasses(output([row("Bob Jones")]), output([b]), identity, 1).entries[0]!;
    expect(e.out).toMatchObject({ value: 1410, agree: false, passA: "11:30", passB: "11:50" });
  });

  it("treats the same value read from a different place on the page as a disagreement", () => {
    const b = row("Bob Jones", { timeOut: cell("11:30", 1410, box(500, 600)) });
    const e = comparePasses(output([row("Bob Jones")]), output([b]), identity, 1).entries[0]!;
    expect(e.out!.agree).toBe(false);
  });

  it("pairs rows by name and date, not by position", () => {
    const a = output([row("Bob Jones", {}, 200), row("Andre Lewis", {}, 300)]);
    const b = output([row("Andre Lewis", {}, 300), row("Bob Jones", {}, 200)]);
    const r = comparePasses(a, b, identity, 1);
    expect(r.entries.map((e) => [e.worker.value, e.worker.agree])).toEqual([
      ["Bob Jones", true],
      ["Andre Lewis", true],
    ]);
  });

  it("keeps a row only one pass saw, with nothing agreed", () => {
    const r = comparePasses(output([row("Bob Jones"), row("Danny Ortiz", {}, 400)]), output([row("Bob Jones")]), identity, 1);
    const lone = r.entries.find((e) => e.worker.value === "Danny Ortiz")!;
    expect(lone.worker.agree).toBe(false);
    expect(lone.worker.passB).toBeNull();
    expect(lone.checks).toContain("seen_by_one_pass");
  });

  it("flags a clock reading whose minutes do not fit what is written", () => {
    const bad = row("Bob Jones", { timeIn: cell("3:00", 600, box(400, 200)) }); // 3:00 is never 10:00
    const e = comparePasses(output([bad]), output([bad]), identity, 1).entries[0]!;
    expect(e.checks).toContain("inconsistent_reading:in");
  });

  it("flags a weekly document whose per-worker totals or grand total do not add up", () => {
    const weekly = (minutes: number) =>
      output(
        [
          row("Byrne, Conor", { date: { text: "Sat 10/10", iso: "2026-10-10", box: box(700, 300) }, timeIn: cell(null, null, null as never), timeOut: cell(null, null, null as never), breakMinutes: cell(null, null, null as never), totalHours: cell("8.5", 510, box(700, 300)), handwritten: false }),
          row("Byrne, Conor", { date: { text: "Sun 10/11", iso: "2026-10-11", box: box(800, 300) }, timeIn: cell(null, null, null as never), timeOut: cell(null, null, null as never), breakMinutes: cell(null, null, null as never), totalHours: cell("9.0", 540, box(800, 300)), handwritten: false }),
        ],
        { documentType: "weekly_timesheet", sheetDate: null, workerTotals: [{ workerName: "Byrne, Conor", minutes }], grandTotalMinutes: minutes },
      );
    expect(comparePasses(weekly(1050), weekly(1050), identity, 1).entries.every((e) => e.checks.length === 0)).toBe(true);
    const off = comparePasses(weekly(1080), weekly(1080), identity, 1);
    expect(off.entries.every((e) => e.checks.includes("row_total_mismatch"))).toBe(true);
    expect(off.entries.every((e) => e.checks.includes("grand_total_mismatch"))).toBe(true);
  });
});

describe("geometry", () => {
  it("measures box overlap", () => {
    expect(iou(box(0, 0, 100, 100), box(0, 0, 100, 100))).toBe(1000);
    expect(iou(box(0, 0, 100, 100), box(200, 200, 10, 10))).toBe(0);
    expect(iou(box(0, 0, 100, 100), box(50, 0, 100, 100))).toBe(333);
  });

  it("maps a box from pass B's cropped image back onto the page", () => {
    // Pass B sees the page with 40/1000 trimmed from every edge (920/1000 of each side).
    expect(mapCropBoxToPage({ x: 0, y: 0, w: 1000, h: 1000 }, { x: 40, y: 40, w: 920, h: 920 })).toEqual({ x: 40, y: 40, w: 920, h: 920 });
    expect(mapCropBoxToPage({ x: 500, y: 250, w: 100, h: 50 }, { x: 40, y: 40, w: 920, h: 920 })).toEqual({ x: 500, y: 270, w: 92, h: 46 });
  });
});
