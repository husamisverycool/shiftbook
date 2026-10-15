/**
 * The fictional demo agency (SPEC §18). Every name, address, phone number and id here is invented:
 * phone numbers use the 555-01xx fiction range and emails use the reserved example.com domain.
 * Ids are derived from stable keys so recordings and goldens stay valid across demo resets.
 */
import { createHash } from "node:crypto";

export function demoUuid(key: string): string {
  const h = createHash("sha256").update(`shiftbook-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const DEMO_AGENCY = {
  id: demoUuid("agency"),
  name: "Cedar Row Staffing (demo)",
  addressLines: ["410 Example Avenue, Suite 2", "Naperville, IL 60540"],
  phone: "(630) 555-0142",
  email: "payroll@cedarrow.example.com",
};

export const DEMO_OWNER = {
  id: demoUuid("user:owner"),
  name: "Demo Owner",
  email: "owner@cedarrow.example.com",
  role: "owner" as const,
};

export const PERIODS = [
  { key: "w1", startsOn: "2026-09-28", endsOn: "2026-10-04" },
  { key: "w2", startsOn: "2026-10-05", endsOn: "2026-10-11" },
] as const;
export const CURRENT_PERIOD = PERIODS[1];

export type ClientKey = "ca" | "il" | "ma";

export const CLIENTS: Record<
  ClientKey,
  {
    name: string;
    code: string;
    addressLines: string[];
    billingEmail: string;
    worksite: { name: string; addressLine: string; city: string; county: string; state: string; postalCode: string; countyFips: string; placeFips: string | null };
    billing: { overtimeBillingRule: "multiplier" | "straight_time" | "not_billable"; poNumber: string | null; vmsName: string | null; paymentTermsDays: number };
  }
> = {
  ca: {
    name: "Pacific Crest Distribution (demo)",
    code: "PCD",
    addressLines: ["2200 Example Logistics Way", "Ontario, CA 91761"],
    billingEmail: "ap@pacificcrest.example.com",
    worksite: { name: "Ontario DC", addressLine: "2200 Example Logistics Way", city: "Ontario", county: "San Bernardino", state: "CA", postalCode: "91761", countyFips: "06071", placeFips: "0653896" },
    billing: { overtimeBillingRule: "multiplier", poNumber: null, vmsName: "SAP Fieldglass", paymentTermsDays: 45 },
  },
  il: {
    name: "Prairie Line Manufacturing (demo)",
    code: "PLM",
    addressLines: ["75 Example Industrial Drive", "Joliet, IL 60431"],
    billingEmail: "payables@prairieline.example.com",
    worksite: { name: "Joliet Plant 2", addressLine: "75 Example Industrial Drive", city: "Joliet", county: "Will", state: "IL", postalCode: "60431", countyFips: "17197", placeFips: "1738570" },
    billing: { overtimeBillingRule: "multiplier", poNumber: "PO-48213", vmsName: null, paymentTermsDays: 30 },
  },
  ma: {
    name: "Harborview Events & Hospitality (demo)",
    code: "HEH",
    addressLines: ["18 Example Harbor Street", "Worcester, MA 01608"],
    billingEmail: "accounts@harborview.example.com",
    worksite: { name: "Harborview Hall", addressLine: "18 Example Harbor Street", city: "Worcester", county: "Worcester", state: "MA", postalCode: "01608", countyFips: "25027", placeFips: "2582000" },
    billing: { overtimeBillingRule: "straight_time", poNumber: null, vmsName: null, paymentTermsDays: 30 },
  },
};

export type JobKey = "ca-warehouse" | "il-operator" | "il-assembler-day" | "il-assembler-second" | "ma-server";

export const JOB_ORDERS: Record<
  JobKey,
  { client: ClientKey; position: string; socCode: string; shift: string; headcount: number; payRateCents: number; billRateCents: number; wcClassCode: string }
> = {
  "ca-warehouse": { client: "ca", position: "Warehouse Associate", socCode: "53-7062", shift: "Day", headcount: 12, payRateCents: 1950, billRateCents: 2875, wcClassCode: "8292" },
  "il-operator": { client: "il", position: "Machine Operator", socCode: "51-9199", shift: "Day", headcount: 6, payRateCents: 1825, billRateCents: 2650, wcClassCode: "3632" },
  "il-assembler-day": { client: "il", position: "Assembler", socCode: "51-2090", shift: "Day", headcount: 4, payRateCents: 1750, billRateCents: 2575, wcClassCode: "3632" },
  "il-assembler-second": { client: "il", position: "Assembler", socCode: "51-2090", shift: "Second", headcount: 6, payRateCents: 1750, billRateCents: 2575, wcClassCode: "3632" },
  "ma-server": { client: "ma", position: "Event Server", socCode: "35-3031", shift: "Events", headcount: 12, payRateCents: 1700, billRateCents: 2500, wcClassCode: "9079" },
};

export interface DemoWorker {
  key: string;
  firstName: string;
  lastName: string;
  job: JobKey;
  preferredLanguage: "en" | "es";
  /** How the worker writes their own name on a sign-in sheet, when it differs from the roster. */
  writesAs?: string;
}

export const WORKERS: DemoWorker[] = [
  // California — reported through a Fieldglass-style VMS export.
  { key: "luis-hernandez", firstName: "Luis", lastName: "Hernández", job: "ca-warehouse", preferredLanguage: "es" },
  { key: "maribel-torres", firstName: "Maribel", lastName: "Torres", job: "ca-warehouse", preferredLanguage: "es" },
  { key: "kevin-tran", firstName: "Kevin", lastName: "Tran", job: "ca-warehouse", preferredLanguage: "en" },
  { key: "jasmine-carter", firstName: "Jasmine", lastName: "Carter", job: "ca-warehouse", preferredLanguage: "en" },
  { key: "rafael-gutierrez", firstName: "Rafael", lastName: "Gutiérrez", job: "ca-warehouse", preferredLanguage: "es" },
  { key: "ngoc-anh-pham", firstName: "Ngoc Anh", lastName: "Pham", job: "ca-warehouse", preferredLanguage: "en" },
  { key: "brianna-lewis", firstName: "Brianna", lastName: "Lewis", job: "ca-warehouse", preferredLanguage: "en" },
  { key: "oscar-medina", firstName: "Óscar", lastName: "Medina", job: "ca-warehouse", preferredLanguage: "es" },
  { key: "samuel-okafor", firstName: "Samuel", lastName: "Okafor", job: "ca-warehouse", preferredLanguage: "en" },
  { key: "leticia-ramos-vega", firstName: "Leticia", lastName: "Ramos Vega", job: "ca-warehouse", preferredLanguage: "es" },
  { key: "tyler-brooks", firstName: "Tyler", lastName: "Brooks", job: "ca-warehouse", preferredLanguage: "en" },
  { key: "hui-min-chen", firstName: "Hui Min", lastName: "Chen", job: "ca-warehouse", preferredLanguage: "en" },
  // Illinois day shift — reported through the plant's time clock (CSV).
  { key: "marcus-bell", firstName: "Marcus", lastName: "Bell", job: "il-operator", preferredLanguage: "en" },
  { key: "anita-patel", firstName: "Anita", lastName: "Patel", job: "il-operator", preferredLanguage: "en" },
  { key: "jerome-washington", firstName: "Jerome", lastName: "Washington", job: "il-operator", preferredLanguage: "en" },
  { key: "katarzyna-nowak", firstName: "Katarzyna", lastName: "Nowak", job: "il-operator", preferredLanguage: "en" },
  { key: "daniel-ruiz", firstName: "Daniel", lastName: "Ruiz", job: "il-operator", preferredLanguage: "es" },
  { key: "fatima-haddad", firstName: "Fatima", lastName: "Haddad", job: "il-operator", preferredLanguage: "en" },
  { key: "trevor-lindqvist", firstName: "Trevor", lastName: "Lindqvist", job: "il-assembler-day", preferredLanguage: "en" },
  { key: "grace-mensah", firstName: "Grace", lastName: "Mensah", job: "il-assembler-day", preferredLanguage: "en" },
  { key: "pedro-alcantara", firstName: "Pedro", lastName: "Alcántara", job: "il-assembler-day", preferredLanguage: "es" },
  { key: "olivia-hart", firstName: "Olivia", lastName: "Hart", job: "il-assembler-day", preferredLanguage: "en" },
  // Illinois second shift — reported on handwritten sign-in sheets (phone photos).
  { key: "robert-jones", firstName: "Robert", lastName: "Jones", job: "il-assembler-second", preferredLanguage: "en", writesAs: "Bob Jones" },
  { key: "maria-jose-fernandez-ruiz", firstName: "María José", lastName: "Fernández Ruiz", job: "il-assembler-second", preferredLanguage: "es", writesAs: "Maria Fernandez" },
  { key: "jesus-delgado", firstName: "Jesús", lastName: "Delgado", job: "il-assembler-second", preferredLanguage: "es", writesAs: "Chuy Delgado" },
  { key: "andre-lewis", firstName: "Andre", lastName: "Lewis", job: "il-assembler-second", preferredLanguage: "en" },
  { key: "tran-nguyen", firstName: "Tran", lastName: "Nguyen", job: "il-assembler-second", preferredLanguage: "en" },
  { key: "kateryna-bondarenko", firstName: "Kateryna", lastName: "Bondarenko", job: "il-assembler-second", preferredLanguage: "en", writesAs: "K. Bondarenko" },
  // Massachusetts — reported on a client-signed weekly PDF.
  { key: "elizabeth-sullivan", firstName: "Elizabeth", lastName: "Sullivan", job: "ma-server", preferredLanguage: "en", writesAs: "Liz Sullivan" },
  { key: "conor-byrne", firstName: "Conor", lastName: "Byrne", job: "ma-server", preferredLanguage: "en" },
  { key: "isabela-souza", firstName: "Isabela", lastName: "Souza", job: "ma-server", preferredLanguage: "en" },
  { key: "mohammed-al-amin", firstName: "Mohammed", lastName: "Al-Amin", job: "ma-server", preferredLanguage: "en" },
  { key: "patrick-oneil", firstName: "Patrick", lastName: "O'Neil", job: "ma-server", preferredLanguage: "en" },
  { key: "rosa-de-la-cruz", firstName: "Rosa", lastName: "de la Cruz", job: "ma-server", preferredLanguage: "es" },
  { key: "jean-baptiste-pierre", firstName: "Jean-Baptiste", lastName: "Pierre", job: "ma-server", preferredLanguage: "en" },
  { key: "hannah-goldberg", firstName: "Hannah", lastName: "Goldberg", job: "ma-server", preferredLanguage: "en" },
  { key: "victor-santos", firstName: "Victor", lastName: "Santos", job: "ma-server", preferredLanguage: "es" },
  { key: "mei-lin-zhou", firstName: "Mei Lin", lastName: "Zhou", job: "ma-server", preferredLanguage: "en" },
  { key: "kwame-boateng", firstName: "Kwame", lastName: "Boateng", job: "ma-server", preferredLanguage: "en" },
  { key: "ashley-nguyen", firstName: "Ashley", lastName: "Nguyen", job: "ma-server", preferredLanguage: "en" },
];

/** A made-up six-character Gusto employee id per worker (Gusto uses short hex ids). */
export function gustoIdFor(workerKey: string): string {
  return createHash("sha256").update(`gusto:${workerKey}`).digest("hex").slice(0, 6);
}

export const NICKNAMES: [string, string][] = [
  ["Bob", "Robert"],
  ["Rob", "Robert"],
  ["Bill", "William"],
  ["Liz", "Elizabeth"],
  ["Beth", "Elizabeth"],
  ["Kate", "Katherine"],
  ["Mike", "Michael"],
  ["Tony", "Antonio"],
  ["Chuy", "Jesús"],
  ["Pepe", "José"],
  ["Lupe", "Guadalupe"],
  ["Nacho", "Ignacio"],
  ["Paco", "Francisco"],
];

export const AGENCY_SETTINGS: { key: string; value: unknown }[] = [
  { key: "workweek_starts_on", value: 1 }, // Monday
  { key: "rounding_mode", value: "half_up" },
  { key: "earning_code_map.gusto_hours_csv", value: { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours" } },
  // A cell is accepted without review only when both passes agree, every check passes, and — for
  // handwriting — the agreement is exact. Printed values may be accepted at the same bar.
  { key: "extraction.auto_accept", value: { handwritten: "never_without_exact_agreement", printed: "exact_agreement" } },
];
