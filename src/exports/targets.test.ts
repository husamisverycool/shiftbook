import { describe, expect, it } from "vitest";
import { AGENCY_SETTINGS, demoPayrollIds, WORKERS } from "../server/demo/dataset";
import { adpWfnFileName, codeMapProblems, DEFAULT_LAYOUT, defaultCodes, EXPORT_FORMATS, idKey, layoutProblems, SYSTEM_OF, targetProblems, workerIdProblem, type PayrollSystem } from "./targets";

describe("payroll targets", () => {
  it("accepts each system with what its file needs, and names the field that is wrong", () => {
    expect(targetProblems({ format: "gusto_hours_csv" })).toEqual([]);
    expect(targetProblems({ format: "qbd_iif", version: "2022_or_later" })).toEqual([]);
    expect(targetProblems({ format: "qbd_iif", version: "2021_or_earlier", companyName: "Sample Staffing LLC", companyCreateTime: "1208544781" })).toEqual([]);
    expect(targetProblems({ format: "qbd_iif", version: "2021_or_earlier", companyName: "Sample", companyCreateTime: "12a" }).map((p) => p.field)).toEqual(["companyCreateTime"]);
    expect(targetProblems({ format: "qbo_time_csv", customer: "" }).map((p) => p.field)).toEqual(["customer"]);
    expect(targetProblems({ format: "adp_wfn_paydata", companyCode: "XYZ" })).toEqual([]);
    expect(targetProblems({ format: "adp_wfn_paydata", companyCode: "xyz1" }).map((p) => p.field)).toEqual(["companyCode"]);
    expect(targetProblems({ format: "adp_run_csv", companyCode: "ABC1234" })).toEqual([]);
    expect(targetProblems({ format: "spreadsheet_csv", layout: DEFAULT_LAYOUT })).toEqual([]);
    expect(targetProblems({ format: "nope" }).map((p) => p.field)).toEqual(["format"]);
  });

  it("names ADP's file for a two- or three-character company code", () => {
    expect(adpWfnFileName("XYZ")).toBe("PRXYZEPI.csv");
    expect(adpWfnFileName("XY")).toBe("PRXY_EPI.csv");
  });

  it("requires a spreadsheet layout to name the worker, the code, and a way to price every row", () => {
    expect(layoutProblems({ ...DEFAULT_LAYOUT, columns: DEFAULT_LAYOUT.columns.filter((c) => c.field !== "worker_id") }).map((p) => p.message)).toEqual(["Include the worker id, so the receiver can match each row to a person."]);
    expect(layoutProblems({ ...DEFAULT_LAYOUT, columns: DEFAULT_LAYOUT.columns.filter((c) => c.field !== "amount" && c.field !== "rate") }).map((p) => p.field)).toEqual(["columns"]);
    expect(layoutProblems({ ...DEFAULT_LAYOUT, fileName: "../payroll.csv" }).map((p) => p.field)).toEqual(["fileName"]);
    expect(layoutProblems({ ...DEFAULT_LAYOUT, fileName: "payroll-{week}.csv" }).map((p) => p.field)).toEqual(["fileName"]);
    expect(layoutProblems({ ...DEFAULT_LAYOUT, columns: [...DEFAULT_LAYOUT.columns, { field: "ssn", header: "SSN" }] }).map((p) => p.field)).toEqual(["columns.8"]);
  });

  it("checks codes per system: fixed columns, the code's form, hours or dollars, and the declared multiple", () => {
    expect(codeMapProblems("adp_wfn_paydata", defaultCodes("adp_wfn_paydata"))).toEqual([]);
    expect(codeMapProblems("adp_wfn_paydata", { REG: { code: "REG", as: "hours" } }).map((p) => p.field)).toEqual(["codes.REG"]);
    expect(codeMapProblems("adp_wfn_paydata", { DT: { code: "D", as: "hours" } }).map((p) => p.field)).toEqual(["codes.DT.factor"]);
    expect(codeMapProblems("adp_wfn_paydata", { DT: { code: "d", as: "hours", factor: { num: 2, den: 1 } } }).map((p) => p.field)).toEqual(["codes.DT"]);
    expect(codeMapProblems("adp_wfn_paydata", { BONUS: { code: "B", as: "hours" } }).map((p) => p.message)).toEqual(["This system takes this kind of pay in dollars only."]);
    expect(codeMapProblems("qbd_iif", { REG: { code: "Regular Pay", as: "hours" }, BONUS: { code: "Bonus", as: "dollars" } }).map((p) => p.field)).toEqual(["codes.BONUS"]);
    expect(codeMapProblems("qbd_iif", { REG: { code: "Pago régular", as: "hours" } }).map((p) => p.field)).toEqual(["codes.REG"]);
    // One code, one meaning: hours at 1× and at 1.5× cannot share a code.
    expect(codeMapProblems("adp_run_csv", { REG: { code: "REG", as: "hours" }, OT: { code: "REG", as: "hours" } }).map((p) => p.field)).toEqual(["codes.OT"]);
    expect(codeMapProblems("adp_run_csv", { REG: { code: "REG", as: "hours" }, HOL_NOT_WORKED: { code: "REG", as: "hours" } })).toEqual([]);
  });

  it("starts a new system with its fixed columns filled and its codes blank", () => {
    expect(defaultCodes("gusto_hours_csv")).toEqual({ REG: { code: "regular_hours", as: "hours" }, OT: { code: "overtime_hours", as: "hours" }, DT: { code: "double_overtime_hours", as: "hours" } });
    expect(defaultCodes("adp_wfn_paydata")).toMatchObject({ REG: { code: "Reg Hours", as: "hours" }, OT: { code: "O/T Hours", as: "hours", factor: { num: 3, den: 2 } }, DT: { code: "", as: "hours", factor: { num: 2, den: 1 } } });
    expect(defaultCodes("qbd_iif")).toEqual({});
  });

  it("checks a worker's id the way each system needs it", () => {
    expect(workerIdProblem("adp_wfn", "000123")).toBeNull();
    expect(workerIdProblem("adp_wfn", "50")?.field).toBe("id");
    expect(workerIdProblem("gusto", "a1b2", "")?.field).toBe("title");
    expect(workerIdProblem("qbd", "Okafor, Ben")).toBeNull();
    expect(workerIdProblem("qbd", "Núñez, Ana")?.field).toBe("id");
    expect(workerIdProblem("qbo", "Ana Núñez")).toBeNull();
    expect(workerIdProblem("adp_run", "E 12")?.field).toBe("id");
    expect(workerIdProblem("spreadsheet", " A-1")?.field).toBe("id");
  });

  it("the demo agency's payroll settings and worker ids pass the same checks", () => {
    const setting = (key: string) => AGENCY_SETTINGS.find((s) => s.key === key)?.value;
    expect(targetProblems(setting("payroll.target"))).toEqual([]);
    for (const format of EXPORT_FORMATS.filter((f) => f !== "gusto_hours_csv" && f !== "spreadsheet_csv")) expect(codeMapProblems(format, setting(`earning_code_map.${format}`))).toEqual([]);
    for (const w of WORKERS) {
      const ids = demoPayrollIds(w.key, "Picker (Primary)");
      for (const system of Object.values(SYSTEM_OF) as PayrollSystem[]) {
        const entry = ids[system];
        if (entry) expect(workerIdProblem(system, entry.id, entry.title), `${w.key} ${system}`).toBeNull();
      }
    }
  });

  it("refuses codes that are not text, and ADP codes ADP would refuse", () => {
    expect(codeMapProblems("adp_wfn_paydata", { BONUS: { code: 12, as: "dollars" } }).map((p) => p.rule)).toEqual(["code_text"]);
    expect(codeMapProblems("qbd_iif", { REG: { code: ["Hourly", "Rate"], as: "hours" } }).map((p) => p.rule)).toEqual(["code_text"]);
    expect(codeMapProblems("adp_run_csv", { REG: { code: "REG", as: "weekly" } }).map((p) => p.rule)).toEqual(["choose_as"]);
    const adp = (code: string) => codeMapProblems("adp_wfn_paydata", { BONUS: { code, as: "dollars" } }).length;
    expect(["B", "SD", "7", "79", "ABC", "B12"].map(adp)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(["40", "50", "60", "61", "80", "D1", "ABCD", "b"].map(adp)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("compares ADP file numbers as numbers", () => {
    expect(idKey("adp_wfn", "000123")).toBe(idKey("adp_wfn", "123"));
    expect(idKey("qbd", "Bell, Marcus")).toBe(idKey("qbd", "bell, marcus"));
  });
});
