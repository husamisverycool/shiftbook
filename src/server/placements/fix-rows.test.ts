import { describe, expect, it } from "vitest";
import { autoMap, templateHeader } from "./fields";
import { applyRowEdits, fixableField, withRemoved, type PlannedRow } from "./plan";

const header = ["Placement ID", "Talent First Name", "Talent Last Name", "Company Name", "Job Title", "Start Date", "End Date", "Reg Pay Rate", "Reg Bill Rate"];
const rows = [
  ["P-1", "Ana", "Ruiz", "Prairie Line", "Picker", "10/05/2026", "", "18.25", "26.50"],
  ["P-2", "Ben", "Okafor", "Prairie Line", "Picker", "", "", "abc", "26.50"],
];

describe("Avionté placements: the template and the mapping", () => {
  it("maps Avionté's comprehensive placement columns by themselves", () => {
    expect(autoMap(header, "avionte")).toEqual({ externalId: "Placement ID", workerFirstName: "Talent First Name", workerLastName: "Talent Last Name", client: "Company Name", position: "Job Title", startDate: "Start Date", endDate: "End Date", payRate: "Reg Pay Rate", billRate: "Reg Bill Rate" });
  });

  it("offers a template whose columns map back to every field", () => {
    const t = templateHeader("avionte");
    expect(t).toEqual(["Placement Id", "Talent First Name", "Talent Last Name", "Company Name", "Job Title", "Shift", "Start Date", "End Date", "Placement Status", "Reg Pay Rate", "Reg Bill Rate"]);
    for (const source of ["bullhorn", "jobadder", "spott", "avionte", "other"] as const) {
      expect(Object.keys(autoMap(templateHeader(source), source)).sort(), source).toEqual(["billRate", "client", "endDate", "externalId", "payRate", "position", "shift", "startDate", "status", "workerFirstName", "workerLastName"]);
    }
  });
});

describe("fixing only the rows with errors (Avionté bulk import)", () => {
  const mapping = autoMap(header, "avionte");

  it("finds the one cell to fix for a missing date and an unreadable rate", () => {
    expect(fixableField({ code: "missing_value", value: "startDate" }, header, rows[1]!, mapping)).toEqual({ field: "startDate", column: "Start Date", value: "" });
    expect(fixableField({ code: "invalid_rate", value: "abc" }, header, rows[1]!, mapping)).toEqual({ field: "payRate", column: "Reg Pay Rate", value: "abc" });
    expect(fixableField({ code: "invalid_date", value: "13/45/2026" }, header, ["P-3", "C", "D", "X", "Y", "13/45/2026", "", "1", "2"], mapping)).toMatchObject({ field: "startDate" });
    expect(fixableField({ code: "not_on_roster", value: "Ben Okafor" }, header, rows[1]!, mapping)).toBeNull();
  });

  it("applies typed fixes by the row's number in the file, leaving other rows alone", () => {
    const fixed = applyRowEdits(header, rows, [2, 3], { "3": { "Start Date": "10/06/2026", "Reg Pay Rate": "19.00" } });
    expect(fixed[0]).toBe(rows[0]);
    expect(fixed[1]).toEqual(["P-2", "Ben", "Okafor", "Prairie Line", "Picker", "10/06/2026", "", "19.00", "26.50"]);
    expect(rows[1]![5]).toBe(""); // the stored rows are never changed
  });

  it("skips the rows the person left out", () => {
    const plan: PlannedRow[] = [
      { row: 2, outcome: "skip", reason: { code: "missing_value", value: "startDate" } },
      { row: 3, outcome: "create", externalId: "P-2", workerId: "w", jobOrder: { id: "j" }, startDate: "2026-10-06", endDate: null, status: "active", rates: null },
    ];
    expect(withRemoved(plan, [3])).toEqual([plan[0], { row: 3, outcome: "skip", reason: { code: "removed_by_person", value: "" } }]);
  });
});
