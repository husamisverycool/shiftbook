/**
 * The onboarding answers (slice t; docs/patterns/w/onboarding.md): Gusto's self-onboarding steps, the
 * 2020-and-later Form W-4 and Form I-9 Section 1. Pure: reading and checking typed answers, nothing
 * stored. Money in integer cents (CLAUDE.md); an SSN follows the roster's rules (src/server/workers/ssn.ts).
 */
import { isIsoDate } from "@shiftbook/rules";
import type { I9Status, OnboardingW4 } from "../db/schema";
import { readSsn, ssnProblem } from "../workers/ssn";

export const STEPS = ["personal", "w4", "i9", "payment", "policies", "sign"] as const;
export type Step = (typeof STEPS)[number];

export type Read<T> = { ok: true; value: T } | { ok: false; field: string };
type Answers = Record<string, string | undefined>;
const text = (v: string | undefined) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const on = (v: string | undefined) => v === "on" || v === "true";

/** The ABA routing number: nine digits whose weighted sum (3, 7, 1 repeating) is a multiple of 10. */
export function routingOk(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = [...routing].map(Number);
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum % 10 === 0;
}

export type Deposit = { kind: "direct_deposit"; routing: string; account: string; accountType: "checking" | "savings" } | { kind: "paper_check" };

/** Gusto's Payment step: direct deposit (routing and account, the account typed twice) or a paper check. */
export function readDeposit(a: Answers): Read<Deposit> {
  if (a.kind === "paper_check") return { ok: true, value: { kind: "paper_check" } };
  if (a.kind !== "direct_deposit") return { ok: false, field: "kind" };
  const routing = (a.routing ?? "").replace(/\s/g, "");
  const account = (a.account ?? "").replace(/\s/g, "");
  if (!routingOk(routing)) return { ok: false, field: "routing" };
  // US account numbers run 4 to 17 digits.
  if (!/^\d{4,17}$/.test(account)) return { ok: false, field: "account" };
  if ((a.confirm ?? "").replace(/\s/g, "") !== account) return { ok: false, field: "confirm" };
  if (a.accountType !== "checking" && a.accountType !== "savings") return { ok: false, field: "accountType" };
  return { ok: true, value: { kind: "direct_deposit", routing, account, accountType: a.accountType } };
}

/** Dollars and cents as typed ("2,000", "150.50", "") → integer cents; null when not a non-negative amount. */
export function readCents(v: string | undefined): number | null {
  const t = (v ?? "").trim().replace(/[$,\s]/g, "");
  if (t === "") return 0;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const FILING = ["single", "married_jointly", "head_of_household"] as const;

/** Form W-4 Steps 1(c), 2(c), 3 and 4(a)–(c), and "exempt". */
export function readW4(a: Answers): Read<OnboardingW4> {
  const filingStatus = a.filingStatus as OnboardingW4["filingStatus"];
  if (!(FILING as readonly string[]).includes(filingStatus)) return { ok: false, field: "filingStatus" };
  const amounts: [keyof OnboardingW4, string][] = [
    ["dependentsCents", "dependents"],
    ["otherIncomeCents", "otherIncome"],
    ["deductionsCents", "deductions"],
    ["extraWithholdingCents", "extraWithholding"],
  ];
  const value: OnboardingW4 = { filingStatus, multipleJobs: on(a.multipleJobs), dependentsCents: 0, otherIncomeCents: 0, deductionsCents: 0, extraWithholdingCents: 0, exempt: on(a.exempt) };
  for (const [key, field] of amounts) {
    const cents = readCents(a[field]);
    if (cents === null) return { ok: false, field };
    (value as unknown as Record<string, number>)[key] = cents;
  }
  return { ok: true, value };
}

export interface I9Answers {
  status: I9Status;
  uscisNumber?: string;
  expiresOn?: string;
  i94Number?: string;
  passportNumber?: string;
  passportCountry?: string;
}

const I9_STATUSES: I9Status[] = ["citizen", "noncitizen_national", "permanent_resident", "authorized_alien"];

/**
 * Form I-9 Section 1: the attestation and, by status, the numbers it asks — a lawful permanent
 * resident gives the USCIS or A-number; a noncitizen authorized to work gives the expiration date and
 * one of the A-number/USCIS number, the I-94 number, or a foreign passport number with its country.
 */
export function readI9(a: Answers): Read<I9Answers> {
  const status = a.status as I9Status;
  if (!I9_STATUSES.includes(status)) return { ok: false, field: "status" };
  if (status === "citizen" || status === "noncitizen_national") return { ok: true, value: { status } };
  const uscis = (a.uscisNumber ?? "").replace(/^A-?/i, "").replace(/\s|-/g, "");
  if (uscis && !/^\d{7,9}$/.test(uscis)) return { ok: false, field: "uscisNumber" };
  if (status === "permanent_resident") return uscis ? { ok: true, value: { status, uscisNumber: uscis } } : { ok: false, field: "uscisNumber" };
  const expiresOn = (a.expiresOn ?? "").trim();
  if (expiresOn && !isIsoDate(expiresOn)) return { ok: false, field: "expiresOn" };
  const value: I9Answers = { status };
  if (expiresOn) value.expiresOn = expiresOn;
  if (uscis) return { ok: true, value: { ...value, uscisNumber: uscis } };
  const i94 = (a.i94Number ?? "").replace(/\s/g, "");
  if (i94) return /^[0-9A-Z]{11}$/i.test(i94) ? { ok: true, value: { ...value, i94Number: i94.toUpperCase() } } : { ok: false, field: "i94Number" };
  const passport = (a.passportNumber ?? "").replace(/\s/g, "");
  if (passport) {
    if (!/^[0-9A-Z]{5,20}$/i.test(passport)) return { ok: false, field: "passportNumber" };
    const country = text(a.passportCountry);
    if (!country || country.length > 60) return { ok: false, field: "passportCountry" };
    return { ok: true, value: { ...value, passportNumber: passport.toUpperCase(), passportCountry: country } };
  }
  return { ok: false, field: "i94Number" };
}

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

export interface PersonalAnswers {
  legalFirstName: string;
  legalLastName: string;
  ssn: string;
  birthDate: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  email: string | null;
}

/** Gusto's Personal information step: legal name, SSN, birthday, home address (email optional). */
export function readPersonal(a: Answers, today: string): Read<PersonalAnswers> {
  const legalFirstName = text(a.legalFirstName);
  const legalLastName = text(a.legalLastName);
  if (!legalFirstName || legalFirstName.length > 100) return { ok: false, field: "legalFirstName" };
  if (!legalLastName || legalLastName.length > 100) return { ok: false, field: "legalLastName" };
  if (ssnProblem(a.ssn ?? "")) return { ok: false, field: "ssn" };
  const birthDate = (a.birthDate ?? "").trim();
  // At least 14 (the youngest a person may work in most non-farm jobs, 29 CFR 570.2).
  const latest = `${Number(today.slice(0, 4)) - 14}${today.slice(4)}`;
  if (!isIsoDate(birthDate) || birthDate > latest || birthDate < "1900-01-01") return { ok: false, field: "birthDate" };
  const addressLine = text(a.addressLine);
  const city = text(a.city);
  const state = text(a.state).toUpperCase();
  const zip = text(a.zip);
  if (!addressLine || addressLine.length > 200) return { ok: false, field: "addressLine" };
  if (!city || city.length > 100) return { ok: false, field: "city" };
  if (!STATES.has(state)) return { ok: false, field: "state" };
  if (!/^\d{5}(-\d{4})?$/.test(zip)) return { ok: false, field: "zip" };
  const email = text(a.email).toLowerCase();
  if (email && (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return { ok: false, field: "email" };
  return { ok: true, value: { legalFirstName, legalLastName, ssn: readSsn(a.ssn!)!, birthDate, addressLine, city, state, zip, email: email || null } };
}

/** Gusto's signing: "Type your full name and check the box to sign electronically". */
export function readSignature(a: Answers, legal: { legalFirstName: string; legalLastName: string }): Read<string> {
  const typed = text(a.name);
  const want = `${legal.legalFirstName} ${legal.legalLastName}`.toLowerCase().replace(/\s+/g, " ");
  if (typed.toLowerCase() !== want) return { ok: false, field: "name" };
  if (!on(a.agree)) return { ok: false, field: "agree" };
  return { ok: true, value: typed };
}

export interface StepTimes {
  personalAt: Date | null;
  w4At: Date | null;
  i9At: Date | null;
  paymentAt: Date | null;
  policiesAt: Date | null;
  signedAt: Date | null;
}

export interface Progress {
  done: number;
  total: number;
  /** The first step not done, or null when all are. */
  next: Step | null;
  complete: boolean;
  steps: Record<Step, Date | null>;
}

/** Rippling's checklist: each step's date, how many are done, the first left. */
export function onboardingProgress(row: StepTimes | null): Progress {
  const steps: Record<Step, Date | null> = {
    personal: row?.personalAt ?? null,
    w4: row?.w4At ?? null,
    i9: row?.i9At ?? null,
    payment: row?.paymentAt ?? null,
    policies: row?.policiesAt ?? null,
    sign: row?.signedAt ?? null,
  };
  const done = STEPS.filter((s) => steps[s] !== null).length;
  const next = STEPS.find((s) => steps[s] === null) ?? null;
  return { done, total: STEPS.length, next, complete: next === null, steps };
}
