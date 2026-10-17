import { describe, expect, it } from "vitest";
import { checkHours, parseHoursTable, parseMinutes, parseWorkDate } from "./il-hours";

describe("parseMinutes", () => {
  it("reads decimal hours and h:mm exactly, in whole minutes", () => {
    expect(parseMinutes("8")).toBe(480);
    expect(parseMinutes("8.5")).toBe(510);
    expect(parseMinutes("7.75")).toBe(465);
    expect(parseMinutes("8:30")).toBe(510);
    expect(parseMinutes(" 10,5 ")).toBe(630);
  });

  it("refuses what is not hours: text, negatives, more than a day, a fraction of a minute", () => {
    expect(parseMinutes("eight")).toBeNull();
    expect(parseMinutes("-2")).toBeNull();
    expect(parseMinutes("25")).toBeNull();
    expect(parseMinutes("8.333")).toBeNull();
    expect(parseMinutes("")).toBeNull();
  });
});

describe("parseWorkDate", () => {
  it("reads ISO and US dates", () => {
    expect(parseWorkDate("2026-03-02")).toBe("2026-03-02");
    expect(parseWorkDate("3/2/2026")).toBe("2026-03-02");
    expect(parseWorkDate("03/02/26")).toBe("2026-03-02");
  });

  it("refuses dates that do not exist", () => {
    expect(parseWorkDate("2/30/2026")).toBeNull();
    expect(parseWorkDate("2026-13-01")).toBeNull();
    expect(parseWorkDate("yesterday")).toBeNull();
  });
});

describe("parseHoursTable", () => {
  it("finds the columns by their headings, in any order, and says which rows it could not read", () => {
    const { rows, problems } = parseHoursTable([
      ["Date", "Employee", "Client", "Hours"],
      ["2026-03-02", "Ana Ruiz", "Prairie Plant", "8"],
      ["2026-03-03", "Ana Ruiz", "Prairie Plant", "lots"],
      ["", "", "", ""],
    ]);
    expect(rows).toEqual([{ worker: "Ana Ruiz", client: "Prairie Plant", date: "2026-03-02", minutes: 480 }]);
    expect(problems).toEqual([{ row: 3, problem: "hours" }]);
  });

  it("says when a column is missing", () => {
    expect(parseHoursTable([["Name", "Hours"]]).missing).toEqual(["client", "date"]);
  });
});

/** Ten-hour days, Monday to Friday, from a start date for a number of weeks. */
function weekdays(worker: string, client: string, from: string, weeks: number, minutes = 600) {
  const out = [];
  const start = new Date(`${from}T00:00:00Z`).getTime();
  for (let d = 0; d < weeks * 7; d++) {
    const day = new Date(start + d * 86_400_000);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    out.push({ worker, client, date: day.toISOString().slice(0, 10), minutes });
  }
  return out;
}

describe("checkHours — 820 ILCS 175/42 with the app's own counter", () => {
  it("finds the day a worker passed 720 hours at one client within 12 months", () => {
    // 50 h a week from Monday 2026-01-05: 720 h after 14.4 weeks; 720 h exactly after 72 days, so the crossing is day 73, Wednesday 2026-04-15.
    const result = checkHours(weekdays("Ana Ruiz", "Prairie Plant", "2026-01-05", 16), "2026-04-30");
    expect(result.pairs).toHaveLength(1);
    const ana = result.pairs[0]!;
    expect(ana.minutes12).toBe(16 * 5 * 600);
    expect(ana.crossed720).toBe("2026-04-15");
    expect(ana.status).toBe("over");
  });

  it("counts each client apart, warns past 600 hours, and projects the crossing at the recent pace", () => {
    const rows = [...weekdays("Ana Ruiz", "Prairie Plant", "2026-01-05", 13), ...weekdays("Ana Ruiz", "Lakeside Foods", "2026-01-05", 2)];
    const result = checkHours(rows, "2026-04-05");
    const prairie = result.pairs.find((p) => p.client === "Prairie Plant")!;
    expect(prairie.minutes12).toBe(13 * 3000);
    expect(prairie.status).toBe("near");
    expect(prairie.crossed720).toBeNull();
    // 39,000 of 43,200 minutes; 3,000 a week over the last four weeks → 2 more weeks → about 2026-04-19.
    expect(prairie.projected720).toBe("2026-04-19");
    const lakeside = result.pairs.find((p) => p.client === "Lakeside Foods")!;
    expect(lakeside.status).toBe("ok");
  });

  it("does not count hours before April 1, 2024, or after the date it is checked on", () => {
    const result = checkHours([...weekdays("Ana Ruiz", "Prairie Plant", "2024-01-01", 8), ...weekdays("Ana Ruiz", "Prairie Plant", "2026-05-04", 1)], "2026-05-01");
    expect(result.pairs[0]!.minutes48).toBe(0);
  });

  it("matches names however they are capitalised or spaced", () => {
    const result = checkHours(
      [
        { worker: "ana  ruiz", client: "PRAIRIE plant", date: "2026-03-02", minutes: 480 },
        { worker: "Ana Ruiz", client: "Prairie Plant", date: "2026-03-03", minutes: 480 },
      ],
      "2026-03-31",
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.minutes12).toBe(960);
  });
});
