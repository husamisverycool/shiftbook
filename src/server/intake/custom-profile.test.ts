import { describe, expect, it } from "vitest";
import { profileProblems, type TimeclockProfile } from "./profiles";
import { firstLines, parseStructuredFile, UnrecognisedFileError } from "./structured";

const csv = (text: string) => new TextEncoder().encode(text);

/** A time clock that writes two title lines above its header and keeps hours only (no punches). */
const HOURS_ONLY = "Acme Clock Export\nWeek of 10/05/2026\nBadge,Associate,Work Date,Site,Hrs\n101,Rivera Ana,10/05/2026,Joliet,8.5\n102,Bell Marcus,10/06/2026,Joliet,7.25\n";
const PUNCHES = "Emp Name,Day,Start,End,Lunch\nAna Rivera,2026-10-05,7:00 AM,3:30 PM,30\n";

const hoursProfile: TimeclockProfile = {
  kind: "timeclock",
  key: "timeclock:acme",
  name: "Acme clock (hours)",
  version: 1,
  dateFormat: "MM/DD/YYYY",
  headerRow: 3,
  columns: { externalId: "Badge", name: "Associate", date: "Work Date", totalHours: "Hrs", clientName: "Site" },
};

describe("a time file read through a profile a person saved (SPEC §6)", () => {
  it("is not recognised until a profile for its layout is saved", () => {
    expect(() => parseStructuredFile("acme.csv", csv(HOURS_ONLY))).toThrow(UnrecognisedFileError);
  });

  it("reads the header from the row the person picked, and hours without punches", () => {
    const doc = parseStructuredFile("acme.csv", csv(HOURS_ONLY), [hoursProfile]);
    expect(doc.profileKey).toBe("timeclock:acme");
    expect(doc.kind).toBe("timeclock_csv");
    expect(doc.clientHint).toBe("Joliet");
    expect(doc.entries.map((e) => [e.worker.value, e.date.value, e.total?.value, e.in, e.checks])).toEqual([
      ["Rivera Ana", "2026-10-05", 510, null, []],
      ["Bell Marcus", "2026-10-06", 435, null, []],
    ]);
    // Each value keeps the spreadsheet row it came from.
    expect(doc.entries[0]!.total?.source).toEqual({ kind: "cell", row: 4, column: "Hrs" });
  });

  it("reads punches in another date format", () => {
    const p: TimeclockProfile = { kind: "timeclock", key: "timeclock:semi", name: "Punches", version: 1, dateFormat: "YYYY-MM-DD", columns: { name: "Emp Name", date: "Day", in: "Start", out: "End", breakMinutes: "Lunch" } };
    const doc = parseStructuredFile("punches.csv", csv(PUNCHES), [p]);
    expect(doc.entries.map((e) => [e.in?.value, e.out?.value, e.break?.value, e.total])).toEqual([[420, 930, 30, null]]);
  });
});

describe("a profile is complete before it is saved", () => {
  const header = ["Badge", "Associate", "Work Date", "Site", "Hrs"];
  it("is fine as made above", () => {
    expect(profileProblems(hoursProfile, header)).toEqual([]);
  });
  it("needs either punches (in and out) or hours", () => {
    expect(profileProblems({ ...hoursProfile, columns: { ...hoursProfile.columns, totalHours: undefined } }, header)).toEqual(["hours_or_punches"]);
    expect(profileProblems({ ...hoursProfile, columns: { ...hoursProfile.columns, totalHours: undefined, in: "Badge" } }, header)).toEqual(["hours_or_punches"]);
  });
  it("needs the worker's name and the date", () => {
    expect(profileProblems({ ...hoursProfile, columns: { ...hoursProfile.columns, name: "" } }, header)).toEqual(["name"]);
    expect(profileProblems({ ...hoursProfile, columns: { ...hoursProfile.columns, date: "" } }, header)).toEqual(["date"]);
  });
  it("uses each column once, and only columns the header has", () => {
    expect(profileProblems({ ...hoursProfile, columns: { ...hoursProfile.columns, date: "Associate" } }, header)).toEqual(["used_twice"]);
    expect(profileProblems({ ...hoursProfile, columns: { ...hoursProfile.columns, totalHours: "Hours" } }, header)).toEqual(["not_in_header"]);
  });
});

describe("the first lines of a file, to pick the header row from", () => {
  it("numbers the spreadsheet's own lines and keeps at most 15", async () => {
    const lines = await firstLines("acme.csv", csv(HOURS_ONLY));
    expect(lines[0]).toEqual({ n: 1, values: ["Acme Clock Export"] });
    expect(lines[2]).toEqual({ n: 3, values: ["Badge", "Associate", "Work Date", "Site", "Hrs"] });
    expect(await firstLines("long.csv", csv(Array.from({ length: 40 }, (_, i) => `a${i}`).join("\n")))).toHaveLength(15);
  });
});
