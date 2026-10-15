import { describe, expect, it } from "vitest";
import { autoMap, PRESETS } from "./fields";
import { dateOrderOf, dateValues, distinctValues, parseDate, planRows, type Catalog } from "./plan";

const catalog: Catalog = {
  workers: [
    { workerId: "w-anita", firstName: "Anita", lastName: "Patel" },
    { workerId: "w-robert", firstName: "Robert", lastName: "Jones" },
  ],
  nicknames: [["Bob", "Robert"]],
  clients: [{ id: "c-prairie", name: "Prairie Line Manufacturing" }],
  jobOrders: [{ id: "jo-operator", clientId: "c-prairie", position: "Machine Operator", shift: "Day" }],
  worksites: [{ id: "ws-joliet", clientId: "c-prairie" }],
  imported: new Set(["bullhorn|9001"]),
};

describe("column mapping", () => {
  it("maps a Bullhorn placement list by its documented labels", () => {
    const header = ["ID", "Candidate First Name", "Candidate Last Name", "Company", "Job Title", "Start Date", "End Date", "Status", "Pay Rate", "Bill Rate"];
    expect(autoMap(header, "bullhorn")).toEqual({
      externalId: "ID",
      workerFirstName: "Candidate First Name",
      workerLastName: "Candidate Last Name",
      client: "Company",
      position: "Job Title",
      startDate: "Start Date",
      endDate: "End Date",
      status: "Status",
      payRate: "Pay Rate",
      billRate: "Bill Rate",
    });
  });

  it("maps JobAdder API field names and Spott table labels", () => {
    expect(autoMap(["placementId", "candidate.firstName", "candidate.lastName", "company.name", "jobTitle", "startDate"], "jobadder")).toMatchObject({
      externalId: "placementId",
      workerFirstName: "candidate.firstName",
      client: "company.name",
      position: "jobTitle",
      startDate: "startDate",
    });
    expect(autoMap(["Company", "Vacancy", "Candidate", "Start date", "End date"], "spott")).toEqual({ client: "Company", position: "Vacancy", workerName: "Candidate", startDate: "Start date", endDate: "End date" });
  });

  it("prefers a mapping remembered from an earlier import", () => {
    expect(autoMap(["Person", "Customer", "Role", "Begins"], "other", { workerName: "Person", client: "Customer", position: "Role", startDate: "Begins" })).toEqual({
      workerName: "Person",
      client: "Customer",
      position: "Role",
      startDate: "Begins",
    });
  });

  it("never offers a field for a sensitive column, in any preset", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(JSON.stringify(preset)).not.toMatch(/ssn|birth|dob/i);
    }
  });
});

describe("planning each row", () => {
  const header = ["ID", "Candidate", "Company", "Job Title", "Shift", "Start Date", "End Date", "Status", "Pay Rate", "Bill Rate"];
  const mapping = { externalId: "ID", workerName: "Candidate", client: "Company", position: "Job Title", shift: "Shift", startDate: "Start Date", endDate: "End Date", status: "Status", payRate: "Pay Rate", billRate: "Bill Rate" };
  const rows = [
    ["9100", "Anita Patel", "Prairie Line Manufacturing", "Machine Operator", "Day", "10/12/2026", "", "Approved", "19.00", "27.50"],
    ["9101", "Bob Jones", "prairie line manufacturing", "Forklift Operator", "Night", "2026-10-19", "12/31/2026", "Placed", "", ""],
    ["9001", "Anita Patel", "Prairie Line Manufacturing", "Machine Operator", "Day", "10/12/2026", "", "Approved", "", ""],
    ["9102", "Maria Gomez", "Prairie Line Manufacturing", "Machine Operator", "Day", "10/12/2026", "", "Approved", "", ""],
    ["9103", "Anita Patel", "Unknown Client", "Machine Operator", "Day", "10/12/2026", "", "Approved", "", ""],
    ["9104", "Robert Jones", "Prairie Line Manufacturing", "Machine Operator", "Day", "13/45/2026", "", "Approved", "", ""],
    ["9105", "Robert Jones", "Prairie Line Manufacturing", "Machine Operator", "Day", "10/12/2026", "", "Withdrawn", "", ""],
    ["9106", "Robert Jones", "Prairie Line Manufacturing", "Machine Operator", "Day", "10/12/2026", "", "Approved", "19.005", "27"],
    ["9100", "Anita Patel", "Prairie Line Manufacturing", "Machine Operator", "Day", "10/12/2026", "", "Approved", "", ""],
  ];

  it("matches workers, clients and job orders, and gives every skipped row its reason", () => {
    const plan = planRows("bullhorn", header, rows, mapping, {}, catalog);
    expect(plan[0]).toEqual({
      row: 2,
      outcome: "create",
      externalId: "9100",
      workerId: "w-anita",
      jobOrder: { id: "jo-operator" },
      startDate: "2026-10-12",
      endDate: null,
      status: "active",
      rates: { payRateCents: 1900, billRateCents: 2750 },
    });
    // A new job order needs its worksite chosen in the review step.
    expect(plan[1]).toEqual({ row: 3, outcome: "skip", reason: { code: "new_job_order_needs_worksite", value: "Forklift Operator" } });
    expect(plan.slice(2).map((p) => (p.outcome === "skip" ? p.reason.code : p.outcome))).toEqual([
      "already_imported",
      "not_on_roster",
      "client_not_found",
      "invalid_date",
      "cancelled_in_source",
      "invalid_rate",
      "twice_in_file",
    ]);
  });

  it("follows the person's decisions from the review step", () => {
    const decisions = { worker: { "Maria Gomez": "w-robert" }, jobOrder: { "c-prairie|forklift operator|night": "new:ws-joliet" } };
    const plan = planRows("bullhorn", header, rows, mapping, decisions, catalog);
    expect(plan[1]).toMatchObject({ outcome: "create", workerId: "w-robert", jobOrder: { new: { clientId: "c-prairie", worksiteId: "ws-joliet", position: "Forklift Operator", shift: "Night" } }, endDate: "2026-12-31" });
    expect(plan[3]).toMatchObject({ outcome: "create", workerId: "w-robert" });
    const leftOut = planRows("bullhorn", header, rows, mapping, { worker: { "Anita Patel": "leave_out" } }, catalog);
    expect(leftOut[0]).toEqual({ row: 2, outcome: "skip", reason: { code: "left_out", value: "Anita Patel" } });
  });

  it("lists each distinct value with its row count and what it maps to", () => {
    const values = distinctValues(header, rows, mapping, {}, catalog);
    expect(values.worker.find((v) => v.raw === "Bob Jones")).toEqual({ raw: "Bob Jones", count: 1, match: "w-robert" });
    expect(values.worker.find((v) => v.raw === "Maria Gomez")).toEqual({ raw: "Maria Gomez", count: 1, match: null });
    expect(values.client.find((v) => v.raw === "Unknown Client")).toEqual({ raw: "Unknown Client", count: 1, match: null });
    expect(values.jobOrder.find((v) => v.raw === "c-prairie|forklift operator|night")).toMatchObject({ count: 1, match: null, label: "Forklift Operator · Night" });
  });
});

describe("planning: rates, statuses and dates are read strictly", () => {
  const header = ["Candidate", "Company", "Job Title", "Shift", "Start Date", "End Date", "Status", "Pay Rate", "Bill Rate"];
  const mapping = { workerName: "Candidate", client: "Company", position: "Job Title", shift: "Shift", startDate: "Start Date", endDate: "End Date", status: "Status", payRate: "Pay Rate", billRate: "Bill Rate" };
  const row = (over: Partial<Record<string, string>> = {}) => {
    const v = { Candidate: "Anita Patel", Company: "Prairie Line Manufacturing", "Job Title": "Machine Operator", Shift: "Day", "Start Date": "10/12/2026", "End Date": "", Status: "Approved", "Pay Rate": "19.00", "Bill Rate": "27.50", ...over };
    return header.map((h) => v[h as keyof typeof v] ?? "");
  };
  const plan = (rows: string[][], decisions = {}) => planRows("other", header, rows, mapping, decisions, catalog);
  const codes = (rows: string[][], decisions = {}) => plan(rows, decisions).map((p) => (p.outcome === "skip" ? `${p.reason.code}:${p.reason.value}` : "create"));

  it("refuses a rate with cents after a comma, and a rate over the limit", () => {
    expect(codes([row({ "Pay Rate": "18,25" }), row({ "Bill Rate": "$200,000" }), row({ "Pay Rate": "1,018.50" })])).toEqual(["invalid_rate:18,25", "invalid_rate:$200,000", "create"]);
  });

  it("names the missing value", () => {
    expect(codes([row({ "Bill Rate": "" }), row({ Status: "Completed", "End Date": "" })])).toEqual(["missing_value:billRate", "missing_value:endDate"]);
  });

  it("leaves a status it does not know for the person to decide", () => {
    expect(codes([row({ Status: "On hold" })])).toEqual(["status_unclear:On hold"]);
    expect(codes([row({ Status: "On hold" })], { status: { "On hold": "active" } })).toEqual(["create"]);
  });

  it("reads dates day first only when at least two dates show it and none shows month first", () => {
    const starts = (dates: string[], opts = {}) =>
      planRows("other", header, dates.map((d, i) => row({ Candidate: i % 2 ? "Robert Jones" : "Anita Patel", "Start Date": d })), mapping, {}, catalog, opts).map((p) =>
        p.outcome === "create" ? p.startDate : p.reason.code,
      );
    expect(dateOrderOf(["19/10/2026", "25/12/2026", "05/11/2026"])).toBe("day_first");
    expect(starts(["19/10/2026", "25/12/2026", "05/11/2026"])).toEqual(["2026-10-19", "2026-12-25", "2026-11-05"]);
    // One typo does not turn a whole US file around: that date alone is refused.
    expect(dateOrderOf(["10/05/2026", "13/12/2026", "11/02/2026"])).toBe("month_first");
    expect(starts(["10/05/2026", "13/12/2026", "11/02/2026"])).toEqual(["2026-10-05", "invalid_date", "2026-11-02"]);
    // Signs both ways: month first, and the day-first dates are refused.
    expect(dateOrderOf(["19/10/2026", "25/12/2026", "10/19/2026"])).toBe("month_first");
  });

  it("reads dates with a time of day, year-first dates with slashes, and dotted or dashed dates", () => {
    expect(parseDate("10/19/2026 12:00:00 AM", "month_first")).toBe("2026-10-19");
    expect(parseDate("2026-10-19T00:00:00", "month_first")).toBe("2026-10-19");
    expect(parseDate("2026-10-19 00:00", "day_first")).toBe("2026-10-19");
    expect(parseDate("2026/10/19", "month_first")).toBe("2026-10-19");
    expect(parseDate("19.10.2026", "day_first")).toBe("2026-10-19");
    expect(parseDate("10-19-2026 0:00", "month_first")).toBe("2026-10-19");
    expect(parseDate("10/19/2026 25:00", "month_first")).toBeNull();
    expect(dateOrderOf(["19.10.2026 0:00", "25.12.2026"])).toBe("day_first");
  });

  it("follows the order the person chose, and never re-reads an ISO date", () => {
    const rows = [row({ "Start Date": "05/11/2026" }), row({ Candidate: "Robert Jones", "Start Date": "2026-10-05", "End Date": "2026-11-02" })];
    const planned = planRows("other", header, rows, mapping, {}, catalog, { dateOrder: "day_first" });
    expect(planned.map((p) => (p.outcome === "create" ? [p.startDate, p.endDate] : p.reason.code))).toEqual([
      ["2026-11-05", null],
      ["2026-10-05", "2026-11-02"],
    ]);
  });

  it("lists each distinct date with what it reads as in the order used", () => {
    const rows = [row({ "Start Date": "05/11/2026" }), row({ "Start Date": "05/11/2026", "End Date": "31/12/2026" }), row({ "Start Date": "2026-10-05" })];
    expect(dateValues(header, rows, mapping, "month_first")).toEqual([
      { raw: "31/12/2026", count: 1, date: null },
      { raw: "05/11/2026", count: 2, date: "2026-05-11" },
      { raw: "2026-10-05", count: 1, date: "2026-10-05" },
    ]);
    expect(dateValues(header, rows, mapping, "day_first").map((d) => d.date)).toEqual(["2026-11-05", "2026-10-05", "2026-12-31"]);
  });

  it("gives each row the number it has in the file, blank rows counted", () => {
    const planned = planRows("other", header, [row(), row({ Candidate: "Robert Jones", "Start Date": "bad" })], mapping, {}, catalog, { rowNumbers: [4, 9] });
    expect(planned.map((p) => p.row)).toEqual([4, 9]);
  });

  it("spells a new job order as the file first spells it, even when that row is skipped", () => {
    const rows = [
      row({ Candidate: "Maria Gomez", "Job Title": "Forklift Operator", Shift: "Night" }),
      row({ "Job Title": "forklift operator", Shift: "night" }),
    ];
    const planned = planRows("other", header, rows, mapping, { jobOrder: { "c-prairie|forklift operator|night": "new:ws-joliet" } }, catalog);
    expect(planned[0]).toMatchObject({ outcome: "skip", reason: { code: "not_on_roster" } });
    expect(planned[1]).toMatchObject({ outcome: "create", jobOrder: { new: { position: "Forklift Operator", shift: "Night" } } });
  });

  it("refuses an over-long placement id", () => {
    const h = ["ID", ...header];
    const r = planRows("other", h, [["x".repeat(201), ...row()]], { ...mapping, externalId: "ID" }, {}, catalog);
    expect(r[0]).toMatchObject({ outcome: "skip", reason: { code: "invalid_value" } });
  });
});
