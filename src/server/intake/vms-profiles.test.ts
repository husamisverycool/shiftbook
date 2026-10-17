/**
 * Decision 0043: Beeline, Coupa and Magnit exports through their saved profiles, and an agency's own
 * column names laid over a profile. The samples are invented (scripts/generate-vms-samples.ts): three
 * workers, Renata's Wednesday split 8 h regular + 1 h overtime, and a fourth worker's sheet in a status
 * that does not count. By hand: Renata 8 + 8 + 9 + 8 + 8 = 41 h, Tomás 4 × 8 = 32 h, Grace 7.5 + 4 × 8
 * = 39.5 h; 14 days, 112.5 h = 6,750 minutes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VMS_SAMPLES, VMS_SAMPLES_DIR } from "../../../scripts/generate-vms-samples";
import { BUILT_IN_PROFILES, profileColumnProblems, withAgencyColumns, type MappingProfile, type VmsProfile } from "./profiles";
import { parseStructuredFile } from "./structured";

const read = (file: string, profiles?: MappingProfile[]) => parseStructuredFile(file, readFileSync(`${VMS_SAMPLES_DIR}/${file}`), profiles);
const minutes = (p: ReturnType<typeof read>) => p.entries.reduce((s, e) => s + (e.total!.value as number), 0);

describe.each([
  ["beeline", "beeline-timesheet-export", "Harborview Events (demo)", "Submitted"],
  ["coupa", "coupa-time-sheet-lines", "Prairie Line Manufacturing (demo)", "pending_approval"],
  ["magnit", "magnit-timesheet-export", "Pacific Crest Distribution (demo)", "Rejected"],
] as const)("%s export through its saved profile", (system, key, client, skippedStatus) => {
  const sample = VMS_SAMPLES[system];
  const parsed = read(sample.file);

  it("is the file the generator writes", () => {
    expect(readFileSync(`${VMS_SAMPLES_DIR}/${sample.file}`, "utf8")).toBe(sample.build());
  });

  it("recognises the profile and reads it as a VMS export", () => {
    expect(parsed.profileKey).toBe(key);
    expect(parsed.kind).toBe("vms_export");
    expect(parsed.clientHint).toBe(client);
  });

  it("adds regular and overtime rows into one daily total per worker: 14 days, 6,750 minutes", () => {
    expect(parsed.entries).toHaveLength(14);
    expect(minutes(parsed)).toBe(6750);
    const renataWednesday = parsed.entries.find((e) => e.externalId === "DEMO-V-1001" && e.date!.value === "2026-10-07");
    expect(renataWednesday!.total!.value).toBe(540);
    expect(renataWednesday!.worker!.value).toBe("Duarte, Renata");
  });

  it("skips the sheet whose status does not count, and says so", () => {
    expect(parsed.entries.some((e) => e.externalId === "DEMO-V-1004")).toBe(false);
    expect(parsed.notes.some((n) => n.includes("TS-2619") && n.includes(skippedStatus))).toBe(true);
  });
});

describe("an agency's own column names (decision 0043)", () => {
  const beeline = BUILT_IN_PROFILES.find((p): p is VmsProfile => p.key === "beeline-timesheet-export")!;
  const renamed = { columns: { ...beeline.columns, hours: "Total Hrs", externalId: "Worker Code" }, includeStatuses: ["Approved", "Invoiced"] };

  it("reads a buyer's layout once its columns are renamed, and only then", () => {
    const sample = VMS_SAMPLES.beeline.build().replace("Beeline ID", "Worker Code").replace(",Hours\r\n", ",Total Hrs\r\n");
    const file = "buyer-layout.csv";
    expect(() => parseStructuredFile(file, new TextEncoder().encode(sample))).toThrow(/do not match any saved mapping profile/);
    const profiles = BUILT_IN_PROFILES.map((p) => (p.key === beeline.key ? withAgencyColumns(p, renamed) : p));
    const parsed = parseStructuredFile(file, new TextEncoder().encode(sample), profiles);
    expect(parsed.profileKey).toBe(beeline.key);
    expect(minutes(parsed)).toBe(6750);
  });

  it("refuses a missing required column, a duplicate, an unknown field and a bad date format", () => {
    expect(profileColumnProblems(beeline, { columns: { ...beeline.columns, hours: "  " } })).toEqual([{ field: "hours", rule: "required" }]);
    expect(profileColumnProblems(beeline, { columns: { ...beeline.columns, hours: "work date" } })).toEqual([{ field: "hours", rule: "duplicate" }]);
    expect(profileColumnProblems(beeline, { columns: { ...beeline.columns, payRate: "Rate" } })).toEqual([{ field: "payRate", rule: "unknown" }]);
    expect(profileColumnProblems(beeline, { columns: beeline.columns, dateFormat: "DD/MM/YYYY" })).toEqual([{ field: "dateFormat", rule: "invalid" }]);
    expect(profileColumnProblems(beeline, { columns: beeline.columns, includeStatuses: [" "] })).toEqual([{ field: "includeStatuses", rule: "required" }]);
    expect(profileColumnProblems(beeline, { columns: { ...beeline.columns, hours: "Hours\nNext" } })).toEqual([{ field: "hours", rule: "invalid" }]);
  });

  it("lets an optional column go, and ignores a saved definition that does not check out", () => {
    const required = Object.fromEntries(Object.entries(beeline.columns).filter(([k]) => k !== "site" && k !== "clientName"));
    expect(profileColumnProblems(beeline, { columns: required })).toEqual([]);
    expect(withAgencyColumns(beeline, { columns: required }).columns).toEqual(required);
    expect(withAgencyColumns(beeline, { columns: { hours: "" } })).toBe(beeline);
    expect(withAgencyColumns(beeline, "nonsense")).toBe(beeline);
    expect(withAgencyColumns(beeline, null)).toBe(beeline);
  });
});
