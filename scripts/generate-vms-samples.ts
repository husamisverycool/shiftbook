/**
 * Invented sample exports for the Beeline, Coupa and Magnit profiles (decision 0043), written to
 * demo/samples/vms/ — outside the demo week's sample folder, so the demo's own week is unchanged.
 * Every name and id is invented. Each file has three workers for a week, one day split into regular
 * and overtime rows, and one time sheet in a status that does not count (skipped and listed).
 *   pnpm tsx scripts/generate-vms-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const VMS_SAMPLES_DIR = "demo/samples/vms";

/** The week, Monday first, and who worked what (minutes per day; a day over 480 splits into overtime). */
const WEEK = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
export const VMS_SAMPLE_WORKERS = [
  { id: "DEMO-V-1001", first: "Renata", last: "Duarte", minutes: [480, 480, 540, 480, 480] },
  { id: "DEMO-V-1002", first: "Tomás", last: "Ibarra", minutes: [480, 480, 480, 480, 0] },
  { id: "DEMO-V-1003", first: "Grace", last: "Whitaker", minutes: [450, 480, 480, 480, 480] },
];
/** The fourth worker's sheet is not approved: none of its rows count. */
const UNAPPROVED = { id: "DEMO-V-1004", first: "Owen", last: "Mercer", minutes: [480, 480, 480, 480, 480] };

const us = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const hours = (m: number) => (m / 60).toFixed(2);
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: string[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

type Row = { sheet: string; status: string; w: typeof UNAPPROVED; date: string; minutes: number; kind: "regular" | "overtime" };

function rowsFor(approved: string, pending: string): Row[] {
  const out: Row[] = [];
  const emit = (w: typeof UNAPPROVED, n: number, status: string) =>
    WEEK.forEach((date, d) => {
      const m = w.minutes[d]!;
      if (m === 0) return;
      out.push({ sheet: `TS-${2610 + n}`, status, w, date, minutes: Math.min(m, 480), kind: "regular" });
      if (m > 480) out.push({ sheet: `TS-${2610 + n}`, status, w, date, minutes: m - 480, kind: "overtime" });
    });
  VMS_SAMPLE_WORKERS.forEach((w, n) => emit(w, n, approved));
  emit(UNAPPROVED, 9, pending);
  return out;
}

export const VMS_SAMPLES = {
  beeline: {
    file: "beeline-timesheets-2026-10-05.csv",
    build: () =>
      csv([
        ["Timesheet ID", "Timesheet Status", "Beeline ID", "Resource Last Name", "Resource First Name", "Assignment ID", "Client", "Location", "Cost Center", "Work Date", "Pay Code", "Hours"],
        ...rowsFor("Approved", "Submitted").map((r) => [r.sheet, r.status, r.w.id, r.w.last, r.w.first, "A-9039", "Harborview Events (demo)", "Boston Seaport Pavilion", "Events", us(r.date), r.kind === "regular" ? "Regular Time" : "Overtime", hours(r.minutes)]),
      ]),
  },
  coupa: {
    file: "coupa-time-sheet-lines-2026-10-05.csv",
    build: () =>
      csv([
        ["Time Sheet Number", "Time Sheet Status", "Worker Number", "Worker Last Name", "Worker First Name", "Customer", "Work Location", "Line Date", "Rate Type", "Hours"],
        ...rowsFor("approved", "pending_approval").map((r) => [r.sheet, r.status, r.w.id, r.w.last, r.w.first, "Prairie Line Manufacturing (demo)", "Joliet Plant 2", r.date, r.kind === "regular" ? "Straight Time" : "Overtime", hours(r.minutes)]),
      ]),
  },
  magnit: {
    file: "magnit-timesheets-2026-10-05.csv",
    build: () =>
      csv([
        ["Timesheet Number", "Timesheet Status", "Contractor ID", "Contractor Last Name", "Contractor First Name", "Client Name", "Work Location", "Date Worked", "Time Type", "Hours Worked"],
        ...rowsFor("Approved", "Rejected").map((r) => [r.sheet, r.status, r.w.id, r.w.last, r.w.first, "Pacific Crest Distribution (demo)", "Ontario DC", us(r.date), r.kind === "regular" ? "ST" : "OT", hours(r.minutes)]),
      ]),
  },
} as const;

if (process.argv[1]?.endsWith("generate-vms-samples.ts")) {
  mkdirSync(VMS_SAMPLES_DIR, { recursive: true });
  for (const s of Object.values(VMS_SAMPLES)) {
    writeFileSync(join(VMS_SAMPLES_DIR, s.file), s.build());
    console.log(`wrote ${join(VMS_SAMPLES_DIR, s.file)}`);
  }
}
