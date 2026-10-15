import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseClockText, parseDecimalHours, parseUsDate } from "./parse";
import { parseStructuredFile } from "./structured";

const SAMPLES = "demo/samples/2026-10-05";
const truth = (file: string) => JSON.parse(readFileSync(`demo/truth/2026-10-05/${file}.json`, "utf8"));

describe("value parsers", () => {
  it("parses clock times with and without AM/PM", () => {
    expect(parseClockText("5:58 AM")).toEqual({ minute: 358, meridiem: "AM" });
    expect(parseClockText("3:31 PM")).toEqual({ minute: 931, meridiem: "PM" });
    expect(parseClockText("12:00 AM")).toEqual({ minute: 0, meridiem: "AM" });
    expect(parseClockText("12:15 PM")).toEqual({ minute: 735, meridiem: "PM" });
    expect(parseClockText("11:30")).toEqual({ minute: 690, meridiem: null });
    expect(parseClockText("23:30")).toEqual({ minute: 1410, meridiem: "24h" });
    expect(parseClockText("noon-ish")).toBeNull();
    expect(parseClockText("13:00 PM")).toBeNull();
  });

  it("parses US dates strictly", () => {
    expect(parseUsDate("10/05/2026")).toBe("2026-10-05");
    expect(parseUsDate("2/30/2026")).toBeNull();
    expect(parseUsDate("10/5/26")).toBe("2026-10-05");
  });

  it("parses decimal hours to whole minutes without floating point", () => {
    expect(parseDecimalHours("9.05")).toBe(543);
    expect(parseDecimalHours("7.5")).toBe(450);
    expect(parseDecimalHours("8")).toBe(480);
    expect(parseDecimalHours("0.62")).toBe(37);
    expect(parseDecimalHours("abc")).toBeNull();
  });
});

describe("time-clock CSV through its saved profile", () => {
  const file = "IL-prairie-line-timeclock-2026-10-05.csv";
  const parsed = parseStructuredFile(file, readFileSync(`${SAMPLES}/${file}`));

  it("recognises the profile from the header row", () => {
    expect(parsed.profileKey).toBe("timeclock-punch-export");
    expect(parsed.kind).toBe("timeclock_csv");
  });

  it("reads every punch with in, out, break and the written total", () => {
    const expected = truth(file).rows as { date: string; inMinute: number; outMinute: number; breakMinutes: number; minutes: number }[];
    expect(parsed.entries).toHaveLength(expected.length);
    const first = parsed.entries[0]!;
    expect(first.worker.value).toMatch(/,/); // "Last, First"
    for (const e of parsed.entries) {
      const minutes = (e.out!.value as number) - (e.in!.value as number) - (e.break!.value as number);
      expect(minutes).toBe(e.total!.value);
    }
    expect(parsed.entries.map((e) => e.date.value).sort()).toEqual(expected.map((r) => r.date).sort());
  });

  it("keeps provenance to the row and column", () => {
    expect(parsed.entries[0]!.in!.source).toEqual({ kind: "cell", row: 2, column: "Clock In" });
  });
});

describe("Fieldglass-style export through its saved profile", () => {
  const file = "CA-pacific-crest-fieldglass-approved-time-sheets.csv";
  const parsed = parseStructuredFile(file, readFileSync(`${SAMPLES}/${file}`));

  it("recognises the Fieldglass profile", () => {
    expect(parsed.profileKey).toBe("fieldglass-approved-time-sheet");
    expect(parsed.kind).toBe("vms_export");
  });

  it("sums ST and OT rows into one daily total per worker, skipping zero days", () => {
    const expected = truth(file).rows as { workerKey: string; date: string; minutes: number }[];
    expect(parsed.entries).toHaveLength(expected.length);
    const totalMinutes = parsed.entries.reduce((s, e) => s + (e.total!.value as number), 0);
    expect(totalMinutes).toBe(expected.reduce((s, r) => s + r.minutes, 0));
  });

  it("skips revoked time sheets and says so", () => {
    expect(parsed.notes.some((n) => n.includes("DEMOTS00051007") && n.includes("Revoked"))).toBe(true);
  });

  it("carries the buyer name as the client hint", () => {
    expect(parsed.clientHint).toBe("Pacific Crest Distribution (demo)");
  });
});
