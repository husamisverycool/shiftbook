/**
 * Placement import fields and per-source presets (docs/patterns/assignments/import.md). None of the
 * three vendors publishes its export's header text, so presets match the documented UI labels and
 * API field names (Bullhorn REST Placement, JobAdder API v2, Spott placements table); the mapping
 * step lets the person correct anything. No field exists for an SSN or a birth date.
 */
import { normalizeHeader } from "../intake/profiles";

export const SOURCES = ["bullhorn", "jobadder", "spott", "other"] as const;
export type Source = (typeof SOURCES)[number];

export const FIELDS = [
  "externalId",
  "workerName",
  "workerFirstName",
  "workerLastName",
  "client",
  "position",
  "shift",
  "startDate",
  "endDate",
  "status",
  "payRate",
  "billRate",
] as const;
export type Field = (typeof FIELDS)[number];
export type Mapping = Partial<Record<Field, string>>;

const COMMON: Partial<Record<Field, string[]>> = {
  externalId: ["id", "placement id", "placementid"],
  workerName: ["candidate", "candidate name", "worker", "worker name", "employee", "employee name", "name"],
  workerFirstName: ["candidate first name", "first name", "firstname"],
  workerLastName: ["candidate last name", "last name", "lastname"],
  client: ["company", "client", "client name", "customer"],
  position: ["job title", "position", "title", "job"],
  shift: ["shift"],
  startDate: ["start date", "start", "begin date"],
  endDate: ["end date", "end"],
  status: ["status"],
  payRate: ["pay rate", "payrate"],
  billRate: ["bill rate", "billrate"],
};

export const PRESETS: Record<Source, Partial<Record<Field, string[]>>> = {
  // https://bullhorn.github.io/rest-api-docs/entityref.html#placement and the Bullhorn One KB labels.
  bullhorn: {
    ...COMMON,
    workerFirstName: ["candidate first name", "candidate.firstname", "first name"],
    workerLastName: ["candidate last name", "candidate.lastname", "last name"],
    client: ["company", "client corporation", "joborder.clientcorporation", "clientcorporation", "client"],
    position: ["job title", "joborder.title", "title", "job"],
    startDate: ["start date", "datebegin", "date begin"],
    endDate: ["end date", "dateend", "date end"],
    payRate: ["pay rate", "payrate"],
    billRate: ["bill rate", "clientbillrate", "client bill rate"],
  },
  // https://api.jobadder.com/v2/openapi.json (PlacementRepresentation).
  jobadder: {
    ...COMMON,
    externalId: ["placementid", "placement id", "id"],
    workerFirstName: ["candidate.firstname", "candidate first name", "first name"],
    workerLastName: ["candidate.lastname", "candidate last name", "last name"],
    client: ["company.name", "job.company.name", "company"],
    position: ["jobtitle", "job.jobtitle", "job title"],
    startDate: ["startdate", "start date"],
    endDate: ["enddate", "end date"],
    status: ["status.name", "status"],
    payRate: ["contractrate.candidaterate", "candidate rate", "pay rate"],
    billRate: ["contractrate.clientrate", "client rate", "charge rate"],
  },
  // https://docs.spott.io/docs/placements/placements.md (placements table) and timesheets.md (rates).
  spott: {
    ...COMMON,
    workerName: ["candidate"],
    client: ["company"],
    position: ["vacancy"],
    startDate: ["start date"],
    endDate: ["end date"],
    payRate: ["pay rate"],
    billRate: ["charge rate", "base charge rate"],
  },
  other: COMMON,
};

/** Each field mapped to a file column: a remembered mapping first (Flatfile memory), then the preset. */
export function autoMap(header: string[], source: Source, remembered: Mapping = {}): Mapping {
  const byName = new Map(header.map((h) => [normalizeHeader(h), h]));
  const out: Mapping = {};
  const used = new Set<string>();
  for (const field of FIELDS) {
    const kept = remembered[field];
    if (kept && header.includes(kept) && !used.has(kept)) {
      out[field] = kept;
      used.add(kept);
      continue;
    }
    for (const candidate of PRESETS[source][field] ?? []) {
      const h = byName.get(candidate);
      if (h && !used.has(h)) {
        out[field] = h;
        used.add(h);
        break;
      }
    }
  }
  // A full-name column and first/last columns are alternatives: keep first and last when both exist.
  if (out.workerFirstName && out.workerLastName) delete out.workerName;
  else {
    delete out.workerFirstName;
    delete out.workerLastName;
  }
  return out;
}

/** What is still missing before rows can be planned. */
export function missingFields(mapping: Mapping): Field[] {
  const missing: Field[] = [];
  if (!mapping.workerName && !(mapping.workerFirstName && mapping.workerLastName)) missing.push("workerName");
  for (const f of ["client", "position", "startDate"] as const) if (!mapping[f]) missing.push(f);
  return missing;
}
