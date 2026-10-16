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
    expect(safeFilename("placements for 900-12-3456.csv", today)).toBe("placements for •••.csv");
    expect(safeFilename("placements 91761-1234.csv", today)).toBe("placements 91761-1234.csv");
  });
});

describe("fourth review: dates with a time of day, more spellings, fewer false alarms", () => {
  it.each([
    [["70001", "Anita Patel", "10/19/2026 12:00:00 AM", "1/2/1990 12:00:00 AM"]],
    [["70001", "1/2/1990 0:00"]],
    [["2026-10-19T00:00:00Z"]],
  ])("refuses a first row whose dates carry a time of day: %j", (header) => {
    expect(headingProblem(header, today)).toBe(true);
  });

  it.each(["May 2026", "Sept 2026", "October 2026", "Q4 2026", "Rate 2026"])("takes %s as a heading (a month and year is not a date)", (heading) => {
    expect(headingProblem(["Candidate", heading], today)).toBe(false);
  });

  it.each([
    [["1/2/1990 12:00:00 AM", "3/4/1985 0:00"]],
    [["Jan-02-1990", "Mar-04-1985"]],
    [["1990-Jan-02", "1985-Mar-04"]],
    [["Tue Jan 02 1990", "Mon Mar 04 1985"]],
  ])("drops a column of old dates written as %j", (dates) => {
    const out = dropSensitive(["Name", "Info"], dates.map((d, i) => [`Worker ${i}`, d]), today);
    expect(out.removed).toEqual([{ column: "B", heading: "Info", reason: "birth_dates" }]);
  });

  it.each(["Nacido el 02/01/1990", "nacida el 2 de enero de 1990"])("drops free text that gives a birth date in Spanish: %s", (note) => {
    expect(dropSensitive(["Name", "Notes"], [["A", note]], today).removed).toEqual([{ column: "B", heading: "Notes", reason: "birth_dates" }]);
  });

  it("hides a date written with a month name in a removed heading", () => {
    expect(dropSensitive(["Name", "DOB Jan-02-1990"], [["A", "x"]], today).removed).toEqual([{ column: "B", heading: "DOB •••", reason: "heading" }]);
  });

  it.each(["Social Sec #", "Last4", "Social Insurance Number", "bday", "B-day", "Date de naissance", "Geburtsdatum", "Nacido el", "Nacida"])("drops a column headed %s", (heading) => {
    expect(one(heading).removed).toEqual([{ column: "B", heading, reason: "heading" }]);
  });

  it("hides a birth date or an SSN in a filename, and keeps an ordinary date", () => {
    expect(safeFilename("Anita Patel DOB 01-02-1990.csv", today)).toBe("Anita Patel DOB •••.csv");
    expect(safeFilename("people born 1990-01-02.csv", today)).toBe("people born •••.csv");
    expect(safeFilename("placements 2026-10-19.csv", today)).toBe("placements 2026-10-19.csv");
    expect(safeFilename("placements for 900-12-3456.csv", today)).toBe("placements for •••.csv");
  });
});

describe("fifth review: time zones, more spellings, no false alarms on names, and speed", () => {
  it.each([
    [["70001", "2026-10-19 00:00:00 UTC"]],
    [["70001", "1990-01-02 00:00:00-05"]],
    [["Tue Jan 02 1990 00:00:00 GMT-0500 (Eastern Standard Time)"]],
    [["Tue, 02 Jan 1990 00:00:00 GMT"]],
    [["1/2/1990 12:00 AM EST"]],
  ])("refuses a first row whose dates carry a time zone: %j", (header) => {
    expect(headingProblem(header, today)).toBe(true);
  });

  it.each([
    [["1990-01-02 00:00:00 UTC", "1985-03-04 00:00:00 UTC"]],
    [["Tue, 02 Jan 1990 00:00:00 GMT", "Mon, 04 Mar 1985 00:00:00 GMT"]],
    [["1/2/1990 12:00 AM EST", "3/4/1985 12:00 AM EST"]],
    [["Jan 2 '90", "Mar 4 '85"]],
    [["01 02 1990", "03 04 1985"]],
    [["1990 01 02", "1985 03 04"]],
    [["2 janvier 1990", "4 mars 1985"]],
    [["2. Januar 1990", "4. März 1985"]],
  ])("drops a column of old dates written as %j", (dates) => {
    const out = dropSensitive(["Name", "Info"], dates.map((d, i) => [`Worker ${i}`, d]), today);
    expect(out.removed).toEqual([{ column: "B", heading: "Info", reason: "birth_dates" }]);
  });

  it.each(["geb. 02.01.1990", "Née le 2 janvier 1990", "F.N. 02/01/1990", "dob 01021990"])("drops free text that gives a birth date: %s", (note) => {
    expect(dropSensitive(["Name", "Notes"], [["A", note]], today).removed).toEqual([{ column: "B", heading: "Notes", reason: "birth_dates" }]);
  });

  it.each(["Geb.-Datum", "Date naiss.", "Naiss.", "YOB", "Bdate", "B-Date", "Seguro Soc.", "L4", "Last Four"])("drops a column headed %s", (heading) => {
    expect(one(heading).removed).toEqual([{ column: "B", heading, reason: "heading" }]);
  });

  it.each(["DOB 01 02 1990", "DOB 1990 01 02", "Born Jan 2 '90", "Geburtsdatum 2. Januar 1990", "DOB 1990年1月2日"])("never keeps a year in a removed heading: %s", (heading) => {
    const out = one(heading);
    expect(out.removed).toHaveLength(1);
    expect(out.removed[0]!.heading).not.toMatch(/\d{2}/);
  });

  it("keeps names that only start like a birth word, and ranges that look like dates", () => {
    expect(dropSensitive(["Name", "Supervisor"], [["A", "Mike Dobson 10/19/2026"]], today).removed).toEqual([]);
    expect(dropSensitive(["Name", "Recruiter"], [["A", "Nee Lewis 10/20/2026"]], today).removed).toEqual([]);
    expect(safeFilename("Dobbins Staffing 2026-10-19.csv", today)).toBe("Dobbins Staffing 2026-10-19.csv");
    expect(headingProblem(["Candidate", "Oct 5-11"], today)).toBe(false);
    expect(dropSensitive(["Name", "Period"], [["A", "Jan 1-10"], ["B", "Feb 3-12"]], today).removed).toEqual([]);
  });

  it("stays fast on very long cells", () => {
    const long = `1${" ".repeat(100_000)}1`;
    const spaced = `1/2/1990${" ".repeat(50_000)}x`;
    const started = Date.now();
    dropSensitive(["Name", "Notes"], [["A", long], ["B", spaced], ["C", "T".repeat(100_000)]], today);
    headingProblem([long, spaced], today);
    safeFilename(long, today);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("sixth review: id columns kept, birth words next to dates, every digit hidden", () => {
  const column = (heading: string, values: string[]) => dropSensitive(["Name", heading], values.map((v, i) => [`Worker ${i}`, v]), today);
  it("removes birth dates padded with placeholders that hold no digits (n/a, unknown, -)", () => {
    expect(column("Notes", ["01/02/1990", "03/04/1985", "n/a", "unknown", "-", "?"]).removed).toHaveLength(1);
    expect(column("Notes", ["01/02/1990", "45000123", "45000124", "45000125"]).removed).toEqual([]);
  });
  /** 8-digit ids from a fixed sequence (MINSTD), so the test is the same every run. */
  const ids = (seed: number, count: number) => {
    let x = seed;
    return Array.from({ length: count }, () => {
      x = (x * 48271) % 2147483647;
      return String(10_000_000 + (x % 90_000_000));
    });
  };
  const block = (first: number, count: number) => Array.from({ length: count }, (_, i) => String(first + i));

  it.each([
    ["Placement ID", ["10011999", "45000123", "45000124", "45000125"]],
    ["Employee Number", ["02101998", "77777777", "88888888"]],
    ["Employee Number", block(10_011_950, 60)],
    ["Employee Number", block(12_011_950, 60)],
    ["Hours", ["8 8 10", "8 8 8", "10 10 12"]],
    ["When", ["19900102", "19850304"]],
  ])("keeps an id or number column even when some values look like old dates: %s %j", (heading, values) => {
    expect(column(heading, values).removed).toEqual([]);
  });

  it("keeps every column of random 8-digit ids, though some ids look like dates", () => {
    const columns = Array.from({ length: 200 }, (_, c) => ids(c + 1, 200));
    const header = ["Name", ...columns.map((_, c) => `Ref ${c}`)];
    const rows = Array.from({ length: 200 }, (_, r) => [`Worker ${r}`, ...columns.map((col) => col[r]!)]);
    const looksLikeDate = /^(?:(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:19|20)\d{2})$/;
    expect(columns.filter((col) => col.some((v) => looksLikeDate.test(v))).length).toBeGreaterThan(10);
    expect(dropSensitive(header, rows, today).removed).toEqual([]);
  });

  it("counts 8-digit and short spaced dates only next to a birth word, in the heading or the cell", () => {
    expect(column("Née le", ["19900102", "19850304"]).removed).toEqual([{ column: "B", heading: "Née le", reason: "birth_dates" }]);
    expect(column("Née le", ["8 8 80", "3 4 85"]).removed).toEqual([{ column: "B", heading: "Née le", reason: "birth_dates" }]);
    expect(column("Notes", ["ok", "DOB 19900102"]).removed).toEqual([{ column: "B", heading: "Notes", reason: "birth_dates" }]);
    expect(column("Notes", ["ok", "DOB 8 8 80"]).removed).toEqual([{ column: "B", heading: "Notes", reason: "birth_dates" }]);
  });

  it.each(["10192026", "8 8 10", "19900102"])("takes %s as a heading (a bare number is not a date there)", (heading) => {
    expect(headingProblem(["Candidate", heading], today)).toBe(false);
  });

  it("refuses a first row whose date carries a named time zone", () => {
    expect(headingProblem(["70001", "1990-01-02 00:00:00 America/Chicago"], today)).toBe(true);
    expect(headingProblem(["70001", "2026-10-19 07:00 America/Argentina/Buenos_Aires"], today)).toBe(true);
  });

  it("drops a column of old dates with a named time zone", () => {
    expect(column("Info", ["1990-01-02 00:00:00 America/Chicago", "1985-03-04 00:00:00 America/New_York"]).removed).toEqual([{ column: "B", heading: "Info", reason: "birth_dates" }]);
  });

  it.each(["L4 Hours", "Level L4"])("keeps a column headed %s (L4 alone is not an SSN there)", (heading) => {
    expect(one(heading).removed).toEqual([]);
  });

  it.each(["SSN L4", "Employee L4", "SS L4", "L4"])("drops a column headed %s", (heading) => {
    expect(one(heading).removed).toEqual([{ column: "B", heading, reason: "heading" }]);
  });

  it.each([
    ["DOB 1/2", "DOB •••/•••"],
    ["Born 1 2 9 0", "Born ••• ••• ••• •••"],
    ["SSN Last 4 1/2", "SSN Last 4 •••/•••"],
  ])("hides every digit in a removed heading but the 4 that names a last-four column: %s", (heading, shown) => {
    expect(one(heading).removed).toEqual([{ column: "B", heading: shown, reason: "heading" }]);
  });

  it.each([
    "Bdate 01/02/1990",
    "B-Date 01/02/1990",
    "dob01/02/1990",
    "geb 02.01.1990",
    "geb. am 2. Januar 1990",
    "FN 02/01/1990",
    "B'day 1/2/1990",
    "YOB 1990",
    "DOB 1990-01-02 00:00:00 America/Chicago",
  ])("drops free text that gives a birth date: %s", (note) => {
    expect(column("Notes", ["ok", note]).removed).toEqual([{ column: "B", heading: "Notes", reason: "birth_dates" }]);
  });

  it.each([
    "Mike Dobson 10/19/2026",
    "Dobbins 10/19/2026",
    "Osborne 10/19/2026",
    "Nee Lewis 10/20/2026",
    "Last 4 Weeks 10/19/2026",
    "Geb.-Nr. 12, 10/19/2026",
    "Gebühr 10/19/2026",
    "Seguro de vida 10/19/2026",
    "FN Anita, started 10/19/2026",
    "7:00 AM - 3:30 PM",
    "07:00-15:30",
    "$19.00/hr, OT 1.5x",
    "Mon-Fri",
    "Oct 5-11",
  ])("keeps free text that gives no birth date: %s", (note) => {
    expect(column("Notes", ["ok", note]).removed).toEqual([]);
  });

  it.each(["Dobson", "Osborne", "Last 4 Weeks", "Geb.-Nr.", "Gebühr", "Seguro de vida", "Mon-Fri", "Oct 5-11"])("keeps a column headed %s, and takes it as a heading", (heading) => {
    expect(one(heading).removed).toEqual([]);
    expect(headingProblem(["Candidate", heading], today)).toBe(false);
  });

  it("stays well under 100 ms a call on 200,000-character hostile cells", () => {
    const n = 200_000;
    const hostile = [
      "dob ".repeat(n / 4),
      "dob0".repeat(n / 4),
      "fn 1/".repeat(n / 5),
      "yob 19".repeat(n / 6),
      "geb. am ".repeat(n / 8),
      "1/2/".repeat(n / 4),
      "1 ".repeat(n / 2),
      "1990-01-02 00:00:00 a/".repeat(n / 22),
      "1990-01-02 00:00:00 " + "a/".repeat(n / 2),
      "mon, ".repeat(n / 5),
      "9".repeat(n),
      "a".repeat(n),
    ];
    for (const cell of hostile) {
      for (const call of [
        () => dropSensitive(["Name", "Notes"], [["A", cell]], today),
        () => dropSensitive(["Name", cell], [["A", "x"]], today),
        () => headingProblem([cell], today),
        () => safeFilename(cell, today),
      ]) {
        const started = performance.now();
        call();
        expect(performance.now() - started).toBeLessThan(100);
      }
    }
  });
});
