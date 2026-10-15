/**
 * What actually happened in the demo agency's two weeks: the true hours per worker per day.
 * The demo documents are generated FROM this, so it is also the answer key for the extraction
 * goldens. Times are minutes after midnight; breaks and totals are minutes.
 */
import { CURRENT_PERIOD, PERIODS, WORKERS, type DemoWorker } from "./dataset";

export interface WorkDay {
  workerKey: string;
  date: string;
  inMinute: number | null;
  outMinute: number | null;
  breakMinutes: number;
  minutes: number;
}

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

const W2 = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const W1 = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

function day(workerKey: string, date: string, inT: string, outT: string, breakMinutes: number): WorkDay {
  const inMinute = t(inT);
  const outMinute = t(outT);
  return { workerKey, date, inMinute, outMinute, breakMinutes, minutes: outMinute - inMinute - breakMinutes };
}

/** Per-worker weekly patterns for the current week (2026-10-05). Index 0 = Monday. */
type Pattern = (string | null)[]; // "HH:MM-HH:MM/break" or null for a day off
const P = (s: string): Pattern => s.split(" ").map((x) => (x === "-" ? null : x));

const CURRENT: Record<string, Pattern> = {
  // California, Fieldglass export — daily totals only (the VMS has no punch times).
  "luis-hernandez": P("06:00-15:30/30 06:00-15:30/30 06:00-15:30/30 06:00-15:30/30 06:00-14:30/30 - -"),
  "maribel-torres": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  "kevin-tran": P("06:00-16:30/30 06:00-16:30/30 06:00-14:30/30 06:00-14:30/30 - - -"),
  "jasmine-carter": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 07:00-11:00/0 -"),
  "rafael-gutierrez": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  "ngoc-anh-pham": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - 06:00-14:30/30 - -"),
  "brianna-lewis": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  "oscar-medina": P("06:00-17:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  "samuel-okafor": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  "leticia-ramos-vega": P("06:00-14:30/30 06:00-14:30/30 - 06:00-14:30/30 06:00-14:30/30 - -"),
  "tyler-brooks": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  "hui-min-chen": P("06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 06:00-14:30/30 - -"),
  // Illinois day shift, time clock — punches to the minute.
  "marcus-bell": P("05:58-15:31/30 06:01-15:30/30 05:59-15:33/30 06:00-15:30/30 06:02-15:29/30 - -"),
  "anita-patel": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 - -"),
  "jerome-washington": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-11:00/0 -"),
  "katarzyna-nowak": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-13:30/30 - -"),
  "daniel-ruiz": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-16:07/30 - -"),
  "fatima-haddad": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 - -"),
  "trevor-lindqvist": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 - -"),
  "grace-mensah": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-11:30/30 - -"),
  "pedro-alcantara": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-17:30/30 - -"),
  "olivia-hart": P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 - -"),
  // Illinois second shift, handwritten sign-in sheets (Mon–Fri).
  "robert-jones": P("15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 - -"),
  "maria-jose-fernandez-ruiz": P("15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 - -"),
  "jesus-delgado": P("15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 15:00-23:30/30 - -"),
  "andre-lewis": P("15:00-23:30/30 15:00-23:30/30 15:00-22:30/30 15:00-23:30/30 15:00-23:30/30 - -"),
  "tran-nguyen": P("14:00-23:30/30 14:00-23:30/30 15:00-23:30/30 15:00-23:30/30 14:00-23:30/30 - -"),
  "kateryna-bondarenko": P("15:00-23:00/30 15:00-23:00/30 15:00-23:00/30 15:00-23:00/30 15:00-23:00/30 - -"),
  // Massachusetts events (Thu–Sun heavy), client-signed weekly PDF — daily hours only.
  "elizabeth-sullivan": P("- - - 16:00-22:00/0 16:00-00:00/0 12:00-22:00/0 12:00-21:00/0"),
  "conor-byrne": P("- - 16:00-22:00/0 16:00-22:00/0 16:00-00:00/0 12:00-20:30/0 12:00-21:00/0"),
  "isabela-souza": P("- - - 16:00-22:00/0 16:00-23:00/0 12:00-22:00/0 -"),
  "mohammed-al-amin": P("10:00-18:30/30 10:00-18:30/30 - 16:00-22:00/0 16:00-00:00/0 12:00-22:00/0 12:00-21:00/0"),
  "patrick-oneil": P("- - - 16:00-22:00/0 16:00-00:00/0 12:00-22:00/0 12:00-21:00/0"),
  "rosa-de-la-cruz": P("- - - - 16:00-00:00/0 12:00-22:00/0 12:00-21:00/0"),
  "jean-baptiste-pierre": P("- - 16:00-22:00/0 16:00-22:00/0 16:00-00:00/0 12:00-22:00/0 -"),
  "hannah-goldberg": P("- - - 16:00-22:00/0 16:00-22:00/0 12:00-18:00/0 12:00-18:00/0"),
  "victor-santos": P("- - - 16:00-22:00/0 16:00-00:00/0 12:00-22:00/0 12:00-21:00/0"),
  "mei-lin-zhou": P("- - - - 16:00-22:00/0 12:00-22:00/0 12:00-21:00/0"),
  "kwame-boateng": P("10:00-18:30/30 10:00-18:30/30 10:00-18:30/30 16:00-22:00/0 16:00-00:00/0 12:00-22:00/0 -"),
  "ashley-nguyen": P("- - - 16:00-22:00/0 16:00-22:00/0 12:00-22:00/0 12:00-21:00/0"),
};

function expand(pattern: Pattern, workerKey: string, dates: string[]): WorkDay[] {
  const days: WorkDay[] = [];
  pattern.forEach((cell, i) => {
    if (!cell) return;
    const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})\/(\d+)$/.exec(cell);
    if (!m) throw new Error(`bad pattern cell ${cell} for ${workerKey}`);
    // "00:00" as an end time means midnight at the end of the day.
    const out = m[2] === "00:00" ? "24:00" : m[2]!;
    days.push(day(workerKey, dates[i]!, m[1]!, out, Number(m[3])));
  });
  return days;
}

/** True hours for a period. The prior week (w1) is a plain 8-hour Monday–Friday for everyone. */
export function scenario(periodKey: (typeof PERIODS)[number]["key"]): WorkDay[] {
  if (periodKey === CURRENT_PERIOD.key) {
    return WORKERS.flatMap((w: DemoWorker) => expand(CURRENT[w.key] ?? [], w.key, W2));
  }
  return WORKERS.flatMap((w) => expand(P("07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 07:00-15:30/30 - -"), w.key, W1));
}

/** Second-shift sign-in sheets: deliberate, realistic problems the reader must flag, not guess. */
export const SHEET_QUIRKS = {
  /** Wednesday: Andre Lewis wrote 11:30, crossed it out, wrote 10:30 (the true time). */
  crossedOut: { date: "2026-10-07", workerKey: "andre-lewis", written: "11:30", corrected: "10:30" },
  /** Thursday: someone not on the roster signed in. Never auto-create a worker. */
  unknownPerson: { date: "2026-10-08", name: "Danny Ortiz", in: "3:00", out: "11:30", lunch: "30", total: "8" },
  /** Friday: Kateryna wrote a total of 8 hours, but 3:00–11:00 with a 30-minute lunch is 7.5. */
  wrongTotal: { date: "2026-10-09", workerKey: "kateryna-bondarenko", writtenTotal: "8" },
};

/** Fieldglass export: one worker's sheet was revoked by the buyer and must be ignored. */
export const FIELDGLASS_REVOKED = { workerKey: "kevin-tran", timeSheetId: "DEMOTS00051007" };
