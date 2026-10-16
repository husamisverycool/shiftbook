/**
 * The fictional demo agency (SPEC §18). Every name, address, phone number and id here is invented:
 * phone numbers use the 555-01xx fiction range and emails use the reserved example.com domain.
 * Ids are derived from stable keys so recordings and goldens stay valid across demo resets.
 */
import { createHash } from "node:crypto";
import type { PayrollIds } from "../db/schema";

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

/** The demo's offices (slice i): the California warehouse work is run from Ontario. Invented names. */
export const BRANCHES = [
  { key: "main", name: "Main office" },
  { key: "ontario", name: "Ontario office" },
] as const;

/** Recruiters whose placements the margin groups by (slice i). Invented people. */
export const RECRUITERS = [
  { key: "lena", name: "Lena Ortiz (demo)", email: "lena@cedarrow.example.com", role: "coordinator" as const },
  { key: "sam", name: "Sam Whitfield (demo)", email: "sam@cedarrow.example.com", role: "coordinator" as const },
] as const;

/** The demo's billing clerk and outside accountant (slice k): with the Owner and Lena, the "Continue as" choices. Invented people. */
export const STAFF = [
  { key: "billing", name: "Rosa Delgado (demo)", email: "billing@cedarrow.example.com", role: "billing" as const },
  { key: "accountant", name: "Morgan Ellis (demo)", email: "accountant@cedarrow.example.com", role: "accountant" as const },
] as const;

/**
 * Estimated burden for the margin (slice i, decision I12). Employer taxes: FICA 7.65% (Social
 * Security 6.2% + Medicare 1.45%) and FUTA 0.6% (IRS Publication 15, 2026) plus each state's
 * new-employer unemployment rate (California 3.4% + ETT 0.1%, EDD; Illinois 3.45% for temporary
 * help, IDES 2026; Massachusetts 2.42%, an estimate). A flat rate overstates FUTA and SUTA once the
 * wage bases are reached (TempWorks and Bullhorn estimate the same way).
 */
export const BURDEN_TAX_RATES: { state: string | null; ratePpm: number; includes: string }[] = [
  { state: null, ratePpm: 82_500, includes: "FICA 7.65% + FUTA 0.6%" },
  { state: "CA", ratePpm: 117_500, includes: "FICA 7.65% + FUTA 0.6% + CA UI 3.4% + ETT 0.1% (new employer)" },
  { state: "IL", ratePpm: 117_000, includes: "FICA 7.65% + FUTA 0.6% + IL UI 3.45% (temporary help, new employer)" },
  { state: "MA", ratePpm: 106_700, includes: "FICA 7.65% + FUTA 0.6% + MA UI 2.42% (new employer, estimate)" },
];

/** Workers' comp per $100 of pay for the demo's class codes: EXAMPLES, not real rates (decision I12). */
export const WC_RATES: { state: string; classCode: string; description: string; ratePpm: number }[] = [
  { state: "CA", classCode: "8292", description: "Warehouse (example rate)", ratePpm: 40_000 },
  { state: "IL", classCode: "3632", description: "Machine shop (example rate)", ratePpm: 30_000 },
  { state: "MA", classCode: "9079", description: "Restaurant and events (example rate)", ratePpm: 25_000 },
];

/**
 * Slice j (decision J11): the agency's state registrations and workers' comp policy, every number
 * invented. The Illinois registration's renewal (60 days before it expires) and the Massachusetts
 * one (30 days before) are due soon in October 2026.
 */
export const REGISTRATIONS: { key: string; jurisdiction: "IL" | "MA"; number: string; issuedOn: string; expiresOn: string }[] = [
  { key: "il", jurisdiction: "IL", number: "IL-DTLSA-0000-DEMO", issuedOn: "2026-01-01", expiresOn: "2026-12-31" },
  { key: "ma", jurisdiction: "MA", number: "MA-PA-0000-DEMO", issuedOn: "2025-11-21", expiresOn: "2026-11-20" },
];
export const WC_POLICY = { carrier: "Example Mutual Insurance (demo)", carrierContact: "100 Example Plaza, Springfield, IL 62701\n(217) 555-0188", policyNumber: "WC-0000-DEMO", states: ["CA", "IL", "MA"], startsOn: "2026-01-01", endsOn: "2026-12-31", auditDueOn: "2027-02-15" };
/** Everyone was hired when their placement started, and their I-9 was done on time (dates only). */
export const I9_DATES = { hireDate: "2026-08-03", section1On: "2026-08-03", section2On: "2026-08-05" };
/** One worker's work authorization ends within 90 days: reverification is due soon. */
export const WORK_AUTH_ENDS: Record<string, string> = { "kateryna-bondarenko": "2026-12-20" };
/** What the Massachusetts job orders state (slice j step 2), and the Department's contact as the agency keeps it. */
/** Hours one Illinois worker did at Prairie Line before Shiftbook: with the demo's weeks, near 720 (slice j, J11). */
export const OPENING_BALANCES = [{ worker: "fatima-haddad", client: "il" as const, minutes: 35_400, throughOn: "2026-07-31", note: "Prairie Line hours from the old timekeeping system, August 2025 to July 2026 (demo)" }];
export const MA_NOTICE_DETAILS = { employerPhone: "(617) 555-0123", startTime: "16:00", endTime: "23:00", overtime: "possible" as const, requirements: "Black pants and black non-slip shoes (the worker's own); no cost", meals: "One staff meal each shift, no charge", transport: "Not provided", strike: false };
export const MA_DEPARTMENT_CONTACT = "Massachusetts Department of Labor Standards\n100 Cambridge Street, Suite 500, Boston, MA 02114\n(Demo: check the current phone number on mass.gov.)";
/** Massachusetts placements whose job order is not on file as sent: one overdue duty to show. */
export const MA_JOB_ORDER_OPEN = ["kwame-boateng"];

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
    billing: { overtimeBillingRule: "multiplier" | "straight_time" | "not_billable" | "own_sites_only"; poNumber: string | null; vmsName: string | null; paymentTermsDays: number };
    /** Invoice settings (slice g): each client shows a different part of what invoices can carry. */
    invoices: { template: "standard" | "per_worker_detail" | "po_header"; backupDetail: boolean; backupImages: boolean; vmsFormat: "fieldglass_time_sheet_invoice" | null };
  }
> = {
  ca: {
    name: "Pacific Crest Distribution (demo)",
    code: "PCD",
    addressLines: ["2200 Example Logistics Way", "Ontario, CA 91761"],
    billingEmail: "ap@pacificcrest.example.com",
    worksite: { name: "Ontario DC", addressLine: "2200 Example Logistics Way", city: "Ontario", county: "San Bernardino", state: "CA", postalCode: "91761", countyFips: "06071", placeFips: "0653896" },
    billing: { overtimeBillingRule: "multiplier", poNumber: null, vmsName: "SAP Fieldglass", paymentTermsDays: 45 },
    invoices: { template: "standard", backupDetail: false, backupImages: false, vmsFormat: "fieldglass_time_sheet_invoice" },
  },
  il: {
    name: "Prairie Line Manufacturing (demo)",
    code: "PLM",
    addressLines: ["75 Example Industrial Drive", "Joliet, IL 60431"],
    billingEmail: "payables@prairieline.example.com",
    worksite: { name: "Joliet Plant 2", addressLine: "75 Example Industrial Drive", city: "Joliet", county: "Will", state: "IL", postalCode: "60431", countyFips: "17197", placeFips: "1738570" },
    billing: { overtimeBillingRule: "multiplier", poNumber: "PO-48213", vmsName: null, paymentTermsDays: 30 },
    invoices: { template: "standard", backupDetail: true, backupImages: true, vmsFormat: null },
  },
  ma: {
    name: "Harborview Events & Hospitality (demo)",
    code: "HEH",
    addressLines: ["18 Example Harbor Street", "Worcester, MA 01608"],
    billingEmail: "accounts@harborview.example.com",
    worksite: { name: "Harborview Hall", addressLine: "18 Example Harbor Street", city: "Worcester", county: "Worcester", state: "MA", postalCode: "01608", countyFips: "25027", placeFips: "2582000" },
    billing: { overtimeBillingRule: "straight_time", poNumber: null, vmsName: null, paymentTermsDays: 30 },
    invoices: { template: "per_worker_detail", backupDetail: true, backupImages: false, vmsFormat: null },
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

/**
 * A demo worker's invented SSN, as nine digits. Always in the 900 area, which the SSA never issues,
 * with a middle group of 10–49, which ITINs never use, so it can be no one's number. One worker has
 * none on file, so the demo shows that state too.
 */
export function demoSsnDigits(workerKey: string): string | null {
  if (workerKey === "ashley-nguyen") return null;
  const h = createHash("sha256").update(`ssn:${workerKey}`).digest();
  const area = 900 + (h[0]! % 100);
  const group = 10 + (h[1]! % 40);
  const serial = 1000 + (h.readUInt16BE(2) % 9000);
  return `${area}${group}${serial}`;
}

/** A made-up six-character Gusto employee id per worker (Gusto uses short hex ids). */
export function gustoIdFor(workerKey: string): string {
  return createHash("sha256").update(`gusto:${workerKey}`).digest("hex").slice(0, 6);
}

/**
 * A demo worker's id in every payroll system (slice f), so switching systems in the demo works at
 * once: QuickBooks names as "Last, First" in plain letters, ADP file numbers and RUN employee ids by
 * roster order. One worker (Anita Patel) has no ADP Workforce Now file number yet, so the demo shows
 * a partly set-up system and the run's "no id" fix.
 */
export function demoPayrollIds(workerKey: string, title: string): PayrollIds {
  const at = WORKERS.findIndex((w) => w.key === workerKey);
  const w = WORKERS[at]!;
  const plain = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "");
  return {
    gusto: { id: gustoIdFor(workerKey), title },
    qbd: { id: `${plain(w.lastName)}, ${plain(w.firstName)}` },
    qbo: { id: `${w.firstName} ${w.lastName}` },
    ...(workerKey === "anita-patel" ? {} : { adp_wfn: { id: String(100_101 + at) } }),
    adp_run: { id: String(101 + at) },
    spreadsheet: { id: `SB-${String(at + 1).padStart(4, "0")}` },
  };
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
  { key: "time_zone", value: "America/Chicago" }, // where "today" is for the agency
  // Slice h: a deposit matched on its amount alone looks at invoices issued from 90 days before to
  // 20 days after it (QuickBooks Online's documented window).
  { key: "receivables.match_window", value: { daysBefore: 90, daysAfter: 20 } },
  { key: "rounding_mode", value: "half_up" },
  // Slice i (decisions I2, I8): workers' comp leaves out the overtime premium (most states); workers
  // are paid 5 days after the period ends (the Friday after a Sunday).
  { key: "margin.wc_excludes_ot_premium", value: true },
  { key: "payroll.pay_day_after_period_end", value: 5 },
  // The payroll file (slice f, decision F1): Gusto in the demo; every system's codes ready to switch to.
  { key: "payroll.target", value: { format: "gusto_hours_csv" } },
  { key: "earning_code_map.gusto_hours_csv", value: { REG: "regular_hours", OT: "overtime_hours", DT: "double_overtime_hours", BONUS: "bonus" } },
  {
    key: "earning_code_map.qbd_iif",
    value: { REG: { code: "Hourly Rate", as: "hours" }, OT: { code: "Overtime Rate", as: "hours" }, DT: { code: "Double-time Rate", as: "hours" }, HOL_NOT_WORKED: { code: "Holiday Hourly", as: "hours" } },
  },
  { key: "earning_code_map.qbo_time_csv", value: { REG: { code: "Hours", as: "hours" } } },
  {
    key: "earning_code_map.adp_wfn_paydata",
    value: {
      REG: { code: "Reg Hours", as: "hours" },
      OT: { code: "O/T Hours", as: "hours", factor: { num: 3, den: 2 } },
      DT: { code: "D", as: "hours", factor: { num: 2, den: 1 } },
      HOL_NOT_WORKED: { code: "H", as: "hours", factor: { num: 1, den: 1 } },
      BONUS: { code: "B", as: "dollars" },
      MEAL_PREMIUM: { code: "MP", as: "dollars" },
      REST_PREMIUM: { code: "RP", as: "dollars" },
    },
  },
  {
    key: "earning_code_map.adp_run_csv",
    value: { REG: { code: "REG", as: "hours" }, OT: { code: "OT", as: "hours" }, DT: { code: "DT", as: "hours" }, HOL_NOT_WORKED: { code: "HOL", as: "hours" }, BONUS: { code: "BONUS", as: "dollars" } },
  },
  // Bill multipliers a new rate card starts with (imported placements, a job order's first card).
  { key: "rate_card.default_bill_multipliers", value: { ot: { num: 3, den: 2 }, dt: { num: 2, den: 1 } } },
  // A cell is accepted without review only when both passes agree, every check passes, and — for
  // handwriting — the agreement is exact. Printed values may be accepted at the same bar.
  { key: "extraction.auto_accept", value: { handwritten: "never_without_exact_agreement", printed: "exact_agreement" } },
  // Client approval (slice d, decisions D3 and D4): links last 14 days; reminders 24 and 48 hours
  // after a request while the client has not acted.
  { key: "approval_link_days", value: 14 },
  { key: "approval_reminder_hours", value: [24, 48] },
  // The weekly run's warning (slice e, decision E5): overtime at least 4 hours and 50% above the
  // previous period's exported run (PowerPay compares with the previous regular run).
  { key: "warnings.overtime_spike", value: { minutes: 240, percent: 50 } },
];
