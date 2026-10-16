import { describe, expect, it } from "vitest";
import type * as s from "../db/schema";
import { vmsInput } from "./invoice-documents";
import type { InvoicePlan, PlannedLine } from "./invoice-plan";

const worker = { id: "w1", firstName: "Marcus", lastName: "Bell" } as typeof s.workers.$inferSelect;
const entry = (id: string, timeSheetIds?: string[]) => ({ id, vmsRefs: timeSheetIds ? { timeSheetIds, workerId: "FG-1" } : {} }) as unknown as typeof s.timeEntries.$inferSelect;
const line = (type: PlannedLine["type"], entryIds: string[], over: Partial<PlannedLine> = {}): PlannedLine => ({
  clientId: "c1",
  workerId: "w1",
  assignmentId: "a1",
  workweekStart: "2026-10-05",
  type,
  minutes: 480,
  rate: { num: 2650, den: 1 },
  amountCents: 21_200,
  entryIds,
  po: null,
  worksite: null,
  ...over,
});
const plan = (lines: PlannedLine[]) => ({ number: "PLM-20261005", lines }) as unknown as InvoicePlan;
const ctx = { workersById: new Map([["w1", worker]]), period: { id: "p", startsOn: "2026-10-05", endsOn: "2026-10-11" } };

describe("the Fieldglass upload's time sheet per line (second opinion, slice g)", () => {
  it("a line is on a time sheet only when every one of its days is", () => {
    const entries = new Map([
      ["e1", entry("e1", ["TS-1"])],
      ["e2", entry("e2")],
    ]);
    expect(vmsInput(plan([line("REG", ["e1", "e2"])]), ctx, entries).lines[0]!.timeSheetIds).toEqual([]);
    expect(vmsInput(plan([line("REG", ["e1"])]), ctx, entries).lines[0]!.timeSheetIds).toEqual(["TS-1"]);
  });

  it("a line that is not worked hours (a holiday not worked) goes on the worker's one time sheet for that placement and week", () => {
    const entries = new Map([
      ["e1", entry("e1", ["TS-1"])],
      ["e3", entry("e3", ["TS-2"])],
    ]);
    const one = vmsInput(plan([line("REG", ["e1"]), line("HOL_NOT_WORKED", [])]), ctx, entries).lines;
    expect(one.map((l) => [l.type, l.timeSheetIds])).toEqual([
      ["REG", ["TS-1"]],
      ["HOL_NOT_WORKED", ["TS-1"]],
    ]);
    // Two time sheets that week (or none): it cannot be placed, and the upload refuses it.
    const two = vmsInput(plan([line("REG", ["e1"]), line("OT", ["e3"]), line("HOL_NOT_WORKED", [])]), ctx, entries).lines;
    expect(two.find((l) => l.type === "HOL_NOT_WORKED")!.timeSheetIds).toEqual([]);
    expect(vmsInput(plan([line("HOL_NOT_WORKED", [])]), ctx, entries).lines[0]!.timeSheetIds).toEqual([]);
  });
});
