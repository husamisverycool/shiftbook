import { describe, expect, it } from "vitest";
import { groupRows, inverseOf, moveColumn, normaliseView, parseDate, parseDuration, parseTsv, planPaste, rangeOf, sortRows, summarise, toTsv, COLUMNS, DEFAULT_VIEW } from "./grid-view";
import type { GridRow } from "./types";

const row = (over: Partial<GridRow>): GridRow => ({
  id: over.id ?? "r",
  workerId: "w1",
  workerName: "Ana Diaz",
  workerNameRaw: "Ana Diaz",
  clientName: "Prairie",
  workDate: "2026-10-05",
  inMinute: 420,
  outMinute: 930,
  breakMinutes: 30,
  minutes: 480,
  confidence: "high",
  status: "needs_review",
  reviewReasons: [],
  otherClient: null,
  fields: {},
  document: null,
  rowIndex: 0,
  ...over,
});
const PERIOD = { startsOn: "2026-10-05", endsOn: "2026-10-11" };
const ROSTER = [
  { id: "w1", name: "Ana Diaz" },
  { id: "w2", name: "Ben Okafor" },
];

describe("view", () => {
  it("a stored view is repaired: unknown fields dropped, missing appended, worker first and never hidden", () => {
    const v = normaliseView({ order: ["hours", "nope", "worker"], hidden: ["worker", "client", "x"], widths: { hours: 9999, x: 3 }, rowHeight: "huge", sort: { col: "date", dir: "up" } });
    expect(v.order[0]).toBe("worker");
    expect(v.order[1]).toBe("hours");
    expect(new Set(v.order)).toEqual(new Set(COLUMNS));
    expect(v.hidden).toEqual(["client"]);
    expect(v.widths).toEqual({ hours: 480 });
    expect(v.rowHeight).toBe("medium");
    expect(v.sort).toBeNull();
    expect(normaliseView(null)).toEqual(DEFAULT_VIEW);
  });
  it("dragging a header onto another moves it to that place; the worker field stays put", () => {
    const order = [...COLUMNS];
    expect(moveColumn(order, "hours", "client").slice(0, 3)).toEqual(["worker", "hours", "client"]);
    expect(moveColumn(order, "client", "date").slice(0, 4)).toEqual(["worker", "date", "client", "in"]);
    expect(moveColumn(order, "worker", "date")).toBe(order);
  });
});

describe("sort and group", () => {
  const rows = [row({ id: "a", minutes: 300 }), row({ id: "b", minutes: null }), row({ id: "c", minutes: 600, clientName: "Harbor" }), row({ id: "d", minutes: 300 })];
  it("sorts by the raw value, empty values last both ways, ties keep their order", () => {
    expect(sortRows(rows, { col: "hours", dir: "asc" }).map((r) => r.id)).toEqual(["a", "d", "c", "b"]);
    expect(sortRows(rows, { col: "hours", dir: "desc" }).map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });
  it("groups in name order, empty last", () => {
    const g = groupRows([...rows, row({ id: "e", clientName: null })], "client");
    expect(g.map((x) => [x.key, x.rows.map((r) => r.id)])).toEqual([
      ["Harbor", ["c"]],
      ["Prairie", ["a", "b", "d"]],
      ["", ["e"]],
    ]);
  });
});

describe("summary bar", () => {
  it("sum, average (rounded once, half up), min, max, filled, empty, percent, unique", () => {
    const v = [480, 450, null, 451];
    expect(summarise(v, "sum", "hours")).toEqual({ kind: "minutes", value: 1381 });
    // 1381 / 3 = 460.33… → 460
    expect(summarise(v, "average", "hours")).toEqual({ kind: "minutes", value: 460 });
    expect(summarise([1, 2], "average", "hours")).toEqual({ kind: "minutes", value: 2 });
    expect(summarise(v, "min", "hours")).toEqual({ kind: "minutes", value: 450 });
    expect(summarise([420, 400], "max", "in")).toEqual({ kind: "clock", value: 420 });
    expect(summarise(["2026-10-07", "2026-10-05"], "min", "date")).toEqual({ kind: "date", value: "2026-10-05" });
    expect(summarise(v, "filled", "hours")).toEqual({ kind: "count", value: 3 });
    expect(summarise(v, "empty", "hours")).toEqual({ kind: "count", value: 1 });
    expect(summarise(v, "percentFilled", "hours")).toEqual({ kind: "percent", value: 75 });
    expect(summarise(["a", "b", "a", null], "unique", "worker")).toEqual({ kind: "count", value: 2 });
    expect(summarise(v, "none", "hours")).toBeNull();
  });
});

describe("clipboard", () => {
  it("round-trips tab-separated values, quoting tabs, quotes and new lines", () => {
    const cells = [["7:00", 'a "b"'], ["x\ty", "line\nnext"]];
    expect(parseTsv(toTsv(cells))).toEqual(cells);
    expect(parseTsv("1\t2\r\n3\t4\r\n")).toEqual([["1", "2"], ["3", "4"]]);
  });
  it("reads durations and dates exactly", () => {
    expect(parseDuration("8:30")).toBe(510);
    expect(parseDuration("8.5")).toBe(510);
    expect(parseDuration("8,25")).toBe(495);
    expect(parseDuration("8.33")).toBeNull();
    expect(parseDuration("45")).toBe(45);
    expect(parseDate("10/5/2026")).toBe("2026-10-05");
    expect(parseDate("2026-02-30")).toBeNull();
  });
});

describe("paste plan", () => {
  const cols = [...COLUMNS];
  const rows = [row({ id: "a" }), row({ id: "b", status: "locked" }), row({ id: "c", inMinute: null, outMinute: null, breakMinutes: null, minutes: 300 })];
  it("one value fills the whole range; unchanged values send nothing; locked rows are refused", () => {
    const plan = planPaste({ rows, columns: cols, range: rangeOf({ row: 0, col: 3 }, { row: 1, col: 3 }), clipboard: [["7:30"]], roster: ROSTER, period: PERIOD });
    expect(plan.changes.map((c) => [c.row.id, c.change])).toEqual([["a", { inMinute: 450 }]]);
    expect(plan.problems.map((p) => [p.row.id, p.problem])).toEqual([["b", "not_editable"]]);
    expect(planPaste({ rows, columns: cols, range: rangeOf({ row: 0, col: 3 }, { row: 0, col: 3 }), clipboard: [["7:00"]], roster: ROSTER, period: PERIOD }).changes).toEqual([]);
  });
  it("a block lands from the top-left cell; each value is checked for its field", () => {
    const plan = planPaste({
      rows,
      columns: cols,
      range: rangeOf({ row: 0, col: 0 }, { row: 0, col: 0 }),
      clipboard: [["Ben Okafor", "x", "2026-10-06", "nope"]],
      roster: ROSTER,
      period: PERIOD,
    });
    expect(plan.changes.map((c) => c.change)).toEqual([{ workerId: "w2", workDate: "2026-10-06" }]);
    expect(plan.problems.map((p) => [p.col, p.problem])).toEqual([
      ["client", "not_editable"],
      ["in", "invalid_value"],
    ]);
  });
  it("a date outside the period, an unknown worker and hours on a timed row are refused; a daily total takes hours", () => {
    const plan = planPaste({ rows, columns: cols, range: rangeOf({ row: 2, col: 6 }, { row: 2, col: 6 }), clipboard: [["8:00"]], roster: ROSTER, period: PERIOD });
    expect(plan.changes.map((c) => c.change)).toEqual([{ minutes: 480 }]);
    const bad = planPaste({ rows, columns: cols, range: rangeOf({ row: 0, col: 0 }, { row: 0, col: 6 }), clipboard: [["Zed", "", "2026-11-01", "", "", "", "9:00"]], roster: ROSTER, period: PERIOD });
    expect(bad.problems.map((p) => [p.col, p.problem])).toEqual([
      ["worker", "unknown_worker"],
      ["client", "not_editable"],
      ["date", "outside_period"],
      ["in", "invalid_value"],
      ["out", "invalid_value"],
      ["break", "invalid_value"],
      ["hours", "not_editable"],
    ]);
  });
  it("undo puts back what the change replaced", () => {
    expect(inverseOf(rows[0]!, { inMinute: 450, workerId: "w2" })).toEqual({ inMinute: 420, workerId: "w1" });
  });
});
