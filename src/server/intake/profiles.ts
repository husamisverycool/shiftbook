/**
 * Saved column-mapping profiles for structured time files (SPEC §6). A profile says which column
 * holds which field; files are recognised by their header row. Adding a VMS (Beeline, Coupa,
 * Magnit) or another time clock is a new profile row, not new code.
 */

export type DateFormat = "MM/DD/YYYY" | "YYYY-MM-DD";

export interface TimeclockProfile {
  kind: "timeclock";
  key: string;
  name: string;
  version: number;
  dateFormat: DateFormat;
  columns: {
    externalId?: string;
    name: string; // "Last, First"
    date: string;
    in: string;
    out: string;
    breakMinutes: string;
    totalHours?: string;
  };
}

export interface VmsProfile {
  kind: "vms";
  key: string;
  name: string;
  version: number;
  vms: string;
  dateFormat: DateFormat;
  /** Statuses whose rows count; everything else (e.g. "Revoked") is skipped and reported. */
  includeStatuses: string[];
  columns: {
    timeSheetId: string;
    status: string;
    externalId: string;
    lastName: string;
    firstName: string;
    date: string;
    hours: string;
    rateCategory: string;
    site?: string;
    /** The buyer (client) named in the export, used as the document's client hint. */
    clientName?: string;
  };
}

export type MappingProfile = TimeclockProfile | VmsProfile;

export const BUILT_IN_PROFILES: MappingProfile[] = [
  {
    kind: "vms",
    key: "fieldglass-approved-time-sheet",
    name: "SAP Fieldglass — Approved Time Sheet Download",
    version: 1,
    vms: "SAP Fieldglass",
    dateFormat: "MM/DD/YYYY",
    includeStatuses: ["Approved", "Invoiced"],
    columns: {
      timeSheetId: "Time Sheet ID",
      status: "Time Sheet Status",
      externalId: "Worker ID",
      lastName: "Worker Last Name",
      firstName: "Worker First Name",
      date: "Time Entry Date",
      hours: "Total Hours",
      rateCategory: "Rate Category/UOM",
      site: "Site Name",
      clientName: "Buyer Name",
    },
  },
  // Beeline, Coupa and Magnit publish no export layout (docs/research/vms-profiles-gap.md, decision
  // 0043): each profile names its columns in the system's own words, and an agency renames them to
  // match its buyer's report in Settings › Connections.
  {
    kind: "vms",
    key: "beeline-timesheet-export",
    name: "Beeline — Timesheet export",
    version: 1,
    vms: "Beeline",
    dateFormat: "MM/DD/YYYY",
    includeStatuses: ["Approved"],
    columns: {
      timeSheetId: "Timesheet ID",
      status: "Timesheet Status",
      externalId: "Beeline ID",
      lastName: "Resource Last Name",
      firstName: "Resource First Name",
      date: "Work Date",
      hours: "Hours",
      rateCategory: "Pay Code",
      site: "Location",
      clientName: "Client",
    },
  },
  {
    kind: "vms",
    key: "coupa-time-sheet-lines",
    name: "Coupa — Service/Time Sheet Lines export",
    version: 1,
    vms: "Coupa",
    dateFormat: "YYYY-MM-DD",
    includeStatuses: ["approved"],
    columns: {
      timeSheetId: "Time Sheet Number",
      status: "Time Sheet Status",
      externalId: "Worker Number",
      lastName: "Worker Last Name",
      firstName: "Worker First Name",
      date: "Line Date",
      hours: "Hours",
      rateCategory: "Rate Type",
      site: "Work Location",
      clientName: "Customer",
    },
  },
  {
    kind: "vms",
    key: "magnit-timesheet-export",
    name: "Magnit — Timesheet export",
    version: 1,
    vms: "Magnit",
    dateFormat: "MM/DD/YYYY",
    includeStatuses: ["Approved"],
    columns: {
      timeSheetId: "Timesheet Number",
      status: "Timesheet Status",
      externalId: "Contractor ID",
      lastName: "Contractor Last Name",
      firstName: "Contractor First Name",
      date: "Date Worked",
      hours: "Hours Worked",
      rateCategory: "Time Type",
      site: "Work Location",
      clientName: "Client Name",
    },
  },
  {
    kind: "timeclock",
    key: "timeclock-punch-export",
    name: "Time clock punch export",
    version: 1,
    dateFormat: "MM/DD/YYYY",
    columns: {
      externalId: "Employee ID",
      name: "Employee Name",
      date: "Date",
      in: "Clock In",
      out: "Clock Out",
      breakMinutes: "Break (min)",
      totalHours: "Total Hours",
    },
  },
];

/** Header text compared case-insensitively with whitespace collapsed ("Worker  ID" = "worker id"). */
export const normalizeHeader = (h: string) => h.replace(/^﻿/, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The profile whose required columns all appear in the header row, if any. */
export function detectProfile(header: string[], profiles: MappingProfile[] = BUILT_IN_PROFILES): MappingProfile | null {
  const have = new Set(header.map(normalizeHeader));
  for (const p of profiles) {
    const required = Object.values(p.columns).filter((v): v is string => typeof v === "string");
    if (required.every((c) => have.has(normalizeHeader(c)))) return p;
  }
  return null;
}

/** What an agency may change of a built-in profile: its column names, which statuses count, the date format. */
export interface ProfileColumns {
  columns: Record<string, string>;
  includeStatuses?: string[];
  dateFormat?: DateFormat;
}

/** A column name an agency may type: text a header cell can hold, no line breaks or tabs. */
const COLUMN_NAME = /^[^\r\n\t]{1,80}$/;

const OPTIONAL: Record<MappingProfile["kind"], string[]> = { vms: ["site", "clientName"], timeclock: ["externalId", "totalHours"] };
export const isOptional = (p: MappingProfile, field: string) => OPTIONAL[p.kind].includes(field);

export type ColumnProblem = { field: string; rule: "unknown" | "required" | "invalid" | "duplicate" };

/** Why an agency's saved columns cannot be used with a built-in profile (empty when they can). */
export function profileColumnProblems(base: MappingProfile, saved: unknown): ColumnProblem[] {
  if (!saved || typeof saved !== "object") return [{ field: "columns", rule: "invalid" }];
  const s = saved as Partial<ProfileColumns>;
  if (!s.columns || typeof s.columns !== "object") return [{ field: "columns", rule: "invalid" }];
  const problems: ColumnProblem[] = [];
  const fields = Object.keys(base.columns);
  const given = s.columns as Record<string, unknown>;
  for (const k of Object.keys(given)) if (!fields.includes(k)) problems.push({ field: k, rule: "unknown" });
  const seen = new Set<string>();
  for (const f of fields) {
    const v = given[f];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      if (!isOptional(base, f)) problems.push({ field: f, rule: "required" });
      continue;
    }
    if (typeof v !== "string" || !COLUMN_NAME.test(v.trim())) {
      problems.push({ field: f, rule: "invalid" });
      continue;
    }
    const key = normalizeHeader(v);
    if (seen.has(key)) problems.push({ field: f, rule: "duplicate" });
    else seen.add(key);
  }
  if (s.includeStatuses !== undefined) {
    const list = s.includeStatuses as unknown;
    if (base.kind !== "vms" || !Array.isArray(list) || list.some((x) => typeof x !== "string" || (x.trim() !== "" && !COLUMN_NAME.test(x.trim())))) problems.push({ field: "includeStatuses", rule: "invalid" });
    else if (list.filter((x: string) => x.trim()).length === 0) problems.push({ field: "includeStatuses", rule: "required" });
  }
  if (s.dateFormat !== undefined && s.dateFormat !== "MM/DD/YYYY" && s.dateFormat !== "YYYY-MM-DD") problems.push({ field: "dateFormat", rule: "invalid" });
  return problems;
}

/**
 * The agency's own column names laid over a built-in profile (Settings › Connections, decision 0043).
 * A saved definition that does not check out is ignored: the built-in profile is used instead.
 */
export function withAgencyColumns(base: MappingProfile, saved: unknown): MappingProfile {
  if (saved === null || saved === undefined || profileColumnProblems(base, saved).length > 0) return base;
  const s = saved as ProfileColumns;
  const columns: Record<string, string> = {};
  for (const f of Object.keys(base.columns)) {
    const v = s.columns[f];
    if (typeof v === "string" && v.trim()) columns[f] = v.trim();
  }
  const dateFormat = s.dateFormat ?? base.dateFormat;
  if (base.kind === "vms") {
    const includeStatuses = s.includeStatuses ? s.includeStatuses.map((x) => x.trim()).filter(Boolean) : base.includeStatuses;
    return { ...base, dateFormat, includeStatuses, columns: columns as VmsProfile["columns"] };
  }
  return { ...base, dateFormat, columns: columns as TimeclockProfile["columns"] };
}
