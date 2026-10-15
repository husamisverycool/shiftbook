import { describe, expect, it } from "vitest";
import { autoMap, PRESETS } from "./fields";
import { distinctValues, planRows, type Catalog } from "./plan";
import { dropSensitive } from "./sensitive";

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

describe("sensitive columns never leave the upload", () => {
  it("drops SSN and birth-date columns by header, and any column holding SSN-shaped values", () => {
    const header = ["ID", "Candidate", "SSN", "Date of Birth", "Notes", "Start Date"];
    const rows = [
      ["1", "Anita Patel", "900-11-2222", "01/02/1990", "ok", "10/12/2026"],
      ["2", "Bob Jones", "", "", "id 900-33-4444 on file", "10/12/2026"],
    ];
    const out = dropSensitive(header, rows);
    expect(out.header).toEqual(["ID", "Candidate", "Start Date"]);
    expect(out.rows).toEqual([
      ["1", "Anita Patel", "10/12/2026"],
      ["2", "Bob Jones", "10/12/2026"],
    ]);
    expect(out.dropped).toBe(3);
    expect(JSON.stringify(out)).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  });
});

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
      row: 1,
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
    expect(plan[1]).toEqual({ row: 2, outcome: "skip", reason: { code: "new_job_order_needs_worksite", value: "Forklift Operator" } });
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
    expect(leftOut[0]).toEqual({ row: 1, outcome: "skip", reason: { code: "left_out", value: "Anita Patel" } });
  });

  it("lists each distinct value with its row count and what it maps to", () => {
    const values = distinctValues(header, rows, mapping, {}, catalog);
    expect(values.worker.find((v) => v.raw === "Bob Jones")).toEqual({ raw: "Bob Jones", count: 1, match: "w-robert" });
    expect(values.worker.find((v) => v.raw === "Maria Gomez")).toEqual({ raw: "Maria Gomez", count: 1, match: null });
    expect(values.client.find((v) => v.raw === "Unknown Client")).toEqual({ raw: "Unknown Client", count: 1, match: null });
    expect(values.jobOrder.find((v) => v.raw === "c-prairie|forklift operator|night")).toMatchObject({ count: 1, match: null, label: "Forklift Operator · Night" });
  });
});
