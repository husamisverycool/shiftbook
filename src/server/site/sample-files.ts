/**
 * The website's "where the week goes" tabs (slice aa; docs/patterns/site.md, after Stripe Connect's flow
 * with its code panel): one sample week rendered by the real exporters into each payroll system's import
 * file, so the page shows the file the app writes, with its control totals and its notes. The workers,
 * ids and codes are sample data (the same week as the export goldens' basic cases).
 */
import type { ControlTotals } from "../db/schema";
import { renderExport, type ExportFixture, type ExportPayLine, type ExportWorker } from "../../exports/registry";
import { SYSTEM_NAME, SYSTEM_OF, type ExportFormat } from "../../exports/targets";

export const SITE_FILE_FORMATS = ["gusto_hours_csv", "adp_wfn_paydata", "adp_run_csv", "paychex_flex_csv", "paylocity_time_csv"] as const satisfies readonly ExportFormat[];

export interface SiteSampleFile {
  format: ExportFormat;
  system: string;
  filename: string;
  /** The file's first lines, as written. */
  preview: string[];
  controlTotals: ControlTotals;
  notes: string[];
}

const PEOPLE = [
  { workerId: "w1", firstName: "Lucía", lastName: "Fernández Ruiz" },
  { workerId: "w2", firstName: "Marcus", lastName: "Bell" },
  { workerId: "w3", firstName: "Tran", lastName: "Nguyen" },
];
const RATE = { num: 1825, den: 1 };
const OT_RATE = { num: 5475, den: 2 };
const WEEK = "2026-10-05";
const LINES: ExportPayLine[] = [
  { workerId: "w1", type: "REG", minutes: 2280, amountCents: 69350, rate: RATE, workweekStart: WEEK },
  { workerId: "w2", type: "REG", minutes: 2400, amountCents: 73000, rate: RATE, workweekStart: WEEK },
  { workerId: "w2", type: "OT", minutes: 240, amountCents: 10950, rate: OT_RATE, workweekStart: WEEK },
  { workerId: "w3", type: "REG", minutes: 2400, amountCents: 73000, rate: RATE, workweekStart: WEEK },
  { workerId: "w3", type: "OT", minutes: 37, amountCents: 1688, rate: OT_RATE, workweekStart: WEEK },
];
const OT_FACTOR = { num: 3, den: 2 };

/** Each system's sample settings: its ids for the three workers, its codes, its company options. */
const SETUP: Record<(typeof SITE_FILE_FORMATS)[number], Pick<ExportFixture, "mappingVersion" | "earningCodeMap" | "target" | "codes"> & { ids: (i: number) => ExportWorker["payrollIds"] }> = {
  gusto_hours_csv: {
    mappingVersion: "gusto-core-v1",
    earningCodeMap: { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours" },
    ids: (i) => ({ gusto: { id: `9a1b2${i}`, title: "Picker (Primary)" } }),
  },
  adp_wfn_paydata: {
    mappingVersion: "adp-wfn-v1",
    earningCodeMap: {},
    target: { format: "adp_wfn_paydata", companyCode: "XYZ" },
    codes: { REG: { code: "Reg Hours", as: "hours" }, OT: { code: "O/T Hours", as: "hours", factor: OT_FACTOR } },
    ids: (i) => ({ adp_wfn: { id: `00010${i}` } }),
  },
  adp_run_csv: {
    mappingVersion: "adp-run-v1",
    earningCodeMap: {},
    target: { format: "adp_run_csv", companyCode: "ABC1234" },
    codes: { REG: { code: "REG", as: "hours" }, OT: { code: "OT", as: "hours" } },
    ids: (i) => ({ adp_run: { id: `10${i}` } }),
  },
  paychex_flex_csv: {
    mappingVersion: "paychex-flex-spi-v1",
    earningCodeMap: {},
    target: { format: "paychex_flex_csv", clientId: "ABC12345" },
    codes: { REG: { code: "Hourly", as: "hours" }, OT: { code: "Overtime 1.5x", as: "hours", factor: OT_FACTOR } },
    ids: (i) => ({ paychex: { id: `A12${i}` } }),
  },
  paylocity_time_csv: {
    mappingVersion: "paylocity-timeimprt-v1",
    earningCodeMap: {},
    target: { format: "paylocity_time_csv" },
    codes: { REG: { code: "REG", as: "hours" }, OT: { code: "OT15", as: "hours", factor: OT_FACTOR } },
    ids: (i) => ({ paylocity: { id: `A12${i}` } }),
  },
};

export function siteSampleFiles(): SiteSampleFile[] {
  return SITE_FILE_FORMATS.map((format) => {
    const { ids, ...setup } = SETUP[format];
    const result = renderExport({
      format,
      ...setup,
      period: { startsOn: WEEK, endsOn: "2026-10-11" },
      workers: PEOPLE.map((p, i) => ({ ...p, payrollIds: ids(i + 1) })),
      payLines: LINES,
    });
    const text = new TextDecoder().decode(result.bytes).replace(/^﻿/, "");
    return {
      format,
      system: SYSTEM_NAME[SYSTEM_OF[format]],
      filename: result.filename,
      preview: text.split(/\r?\n/).filter((l) => l !== "").slice(0, 7),
      controlTotals: result.controlTotals,
      notes: result.notes,
    };
  });
}
