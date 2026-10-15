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
