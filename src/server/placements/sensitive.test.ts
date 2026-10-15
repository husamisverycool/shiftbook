import { describe, expect, it } from "vitest";
import { dropSensitive, headingProblem, safeFilename } from "./sensitive";

const today = "2026-10-15";
const one = (heading: string, value = "x") => dropSensitive(["Name", heading], [["Anita Patel", value]], today);

describe("headings that name an SSN, a tax id or a birth date", () => {
  it.each([
    "S.S.N.", "SS#", "SS No", "SS Number", "SSNumber", "Soc. Sec. No.", "Soc Sec #", "social_security_number", "SocialSecurityNumber", "Employee SSN",
    "SSN4", "SSN Last 4", "Tax ID", "ITIN", "TIN", "Employee TIN", "SIN", "Candidate SS#", "NSS", "CURP",
    "Birth_Date", "D.O.B.", "date_of_birth", "candidate.dateOfBirth", "Born", "Birth", "Birthday", "Fecha de nacimiento", "Fecha Nac", "F. Nac.", "FNac",
    "Seguro Social", "Número de Seguro Social", "Cumpleaños",
  ])("drops a column headed %s, and says so by position", (heading) => {
    const out = one(heading);
    expect(out.header).toEqual(["Name"]);
    expect(out.rows).toEqual([["Anita Patel"]]);
    expect(out.removed).toEqual([{ column: "B", heading, reason: "heading" }]);
  });

  it.each([
    "Business Number", "Class Number", "WC Class Number", "Address Number", "Process Number", "Access Number", "Pass Number", "Tin Can Plant",
    "Sin fecha de fin", "Tarifa sin IVA", "Shift (SS)", "Assoc. Secondary Recruiter", "Business Name", "Job Title", "Placement ID", "Nacionalidad", "Birthplace",
  ])("keeps a column headed %s (the letters only appear inside other words)", (heading) => {
    expect(one(heading).header).toEqual(["Name", heading]);
  });
});

describe("values shaped like Social Security numbers", () => {
  it.each(["900123456", "900 12 3456", "900.12.3456", "SSN 900123456", "900–12–3456", "900-12-3456", "900 - 12 - 3456", "900_12_3456", "900/12/3456", "９００-１２-３４５６"])(
    "drop a column holding %s",
    (value) => {
      const out = one("Notes", value);
      expect(out.header).toEqual(["Name"]);
      expect(out.removed).toEqual([{ column: "B", heading: "Notes", reason: "ssn_values" }]);
    },
  );

  it.each(["91761-1234", "60601 0001", "312-555-1234", "3125551234"])("keep a column of ZIP+4 codes or phone numbers (%s)", (value) => {
    expect(one("Worksite ZIP", value).header).toEqual(["Name", "Worksite ZIP"]);
  });
});

describe("birth dates", () => {
  it.each([
    [["01/02/1990", "03/04/1985"]],
    [["01/02/90", "03/04/85"]],
    [["Jan 2, 1990", "March 4, 1985"]],
    [["02-Jan-1990", "04-Mar-1985"]],
    [["1990/01/02", "1985/03/04"]],
    [["02.01.1990", "04.03.1985"]],
    [["19900102", "19850304"]],
    [["1990-01-02", "1985-03-04 00:00:00"]],
    [["2 de enero de 1990", "4 mar 1985"]],
  ])("drop a column whose dates are mostly 14 or more years old: %j", (dates) => {
    const out = dropSensitive(["Name", "When"], dates.map((d, i) => [`Worker ${i}`, d]), today);
    expect(out.header).toEqual(["Name"]);
    expect(out.removed).toEqual([{ column: "B", heading: "When", reason: "birth_dates" }]);
  });

  it("keep a column where only a few dates are old (a past placement, a 1900 placeholder)", () => {
    const rows = [["A", "10/19/2026"], ["B", "01/01/1900"], ["C", "11/02/2026"], ["D", "03/05/2012"], ["E", "12/01/2026"]];
    expect(dropSensitive(["Name", "Date Added"], rows, today).header).toEqual(["Name", "Date Added"]);
  });

  it("are never looked for in the start and end dates the import recognises (SSN shapes still are)", () => {
    const rows = [["A", "03/05/2012", "06/30/2012"], ["B", "01/02/2011", "01/01/1900"]];
    const out = dropSensitive(["Name", "Start Date", "End Date"], rows, today, { dateColumns: ["Start Date", "End Date"] });
    expect(out.header).toEqual(["Name", "Start Date", "End Date"]);
    const ssn = dropSensitive(["Name", "Start Date"], [["A", "900-12-3456"]], today, { dateColumns: ["Start Date"] });
    expect(ssn.header).toEqual(["Name"]);
  });

  it.each(["DOB 01/02/1990", "born Jan 2, 1990", "d.o.b. 2/1/90", "f. nac. 02/01/1990", "Fecha de nacimiento: 2 ene 1990", "nació el 2 de enero de 1990"])(
    "drop free text that gives one: %s",
    (note) => {
      const out = dropSensitive(["Name", "Notes"], [["A", "ok"], ["B", note], ["C", "rehire"]], today);
      expect(out.header).toEqual(["Name"]);
      expect(out.removed).toEqual([{ column: "B", heading: "Notes", reason: "birth_dates" }]);
    },
  );
});

describe("what is kept about a removed column", () => {
  it("is its position, its heading with anything shaped like an SSN or a date hidden, and why", () => {
    const header = ["ID", "Candidate", "SSN", "Date of Birth", "Notes", "Start Date", "SSN 900-12-3456"];
    const rows = [
      ["1", "Anita Patel", "900-11-2222", "01/02/1990", "ok", "10/12/2026", "x"],
      ["2", "Bob Jones", "", "", "id 900-33-4444 on file", "10/12/2026", "x"],
    ];
    const out = dropSensitive(header, rows, today);
    expect(out.header).toEqual(["ID", "Candidate", "Start Date"]);
    expect(out.rows).toEqual([
      ["1", "Anita Patel", "10/12/2026"],
      ["2", "Bob Jones", "10/12/2026"],
    ]);
    expect(out.removed).toEqual([
      { column: "C", heading: "SSN", reason: "heading" },
      { column: "D", heading: "Date of Birth", reason: "heading" },
      { column: "E", heading: "Notes", reason: "ssn_values" },
      { column: "G", heading: "SSN •••", reason: "heading" },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/\d{3}-\d{2}-\d{4}|1990/);
  });

  it("names columns past Z as a spreadsheet does", () => {
    const header = [...Array.from({ length: 27 }, (_, i) => `C${i}`), "SSN"];
    expect(dropSensitive(header, [header.map(() => "x")], today).removed).toEqual([{ column: "AB", heading: "SSN", reason: "heading" }]);
  });
});

describe("a file whose first row is not column names", () => {
  it.each([
    [["Anita Patel", "900-12-3456", "Prairie Line"]],
    [["Anita Patel", "01/02/1990"]],
    [["70001", "Prairie Line", "10/19/2026"]],
    [["70001", "2026-10-19"]],
    [["Jan 2, 1990"]],
  ])("is refused when a heading is shaped like an SSN or a date: %j", (header) => {
    expect(headingProblem(header, today)).toBe(true);
  });

  it("is taken when the headings are names", () => {
    expect(headingProblem(["ID", "Candidate", "Start Date (MM/DD/YYYY)", "Pay Rate 2026", "Worksite ZIP"], today)).toBe(false);
  });
});

describe("filenames", () => {
  it("hide an SSN-shaped part and keep the rest", () => {
    expect(safeFilename("placements for 900-12-3456.csv")).toBe("placements for •••.csv");
    expect(safeFilename("placements 91761-1234.csv")).toBe("placements 91761-1234.csv");
  });
});
