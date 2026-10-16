/**
 * The compliance duties the agency's data calls for (SPEC §16; slice j, decisions J1–J3). Pure and
 * deterministic: the same facts and day give the same duties. Every number — how long before an
 * expiry, which fixed dates, how many business days, how far back — is a compliance rule row
 * (drizzle/0029) with its citation; the rule in force on the date a duty counts from applies.
 *
 * - Registrations (820 ILCS 175/45, 56 Ill. Adm. Code 260.320; 454 CMR 24.06; N.J.S.A. 34:8D-8): a
 *   renewal before each one expires; a newer one for the same state and office renews it.
 * - Illinois proof of registration (820 ILCS 175/85(a); 260.510): for each client with day and
 *   temporary labor in Illinois, before the contract starts and on each March 1 and September 1 a
 *   placement is running, up to the next one.
 * - Massachusetts job order (M.G.L. c. 149 § 159C(b)): by the end of the placement's first pay period.
 * - New Jersey notice in English and the worker's language (N.J.S.A. 34:8D-3(a)): designated
 *   classifications only (SOC major groups in the rule row), by the start.
 * - Form I-9 (8 C.F.R. § 274a.2(b)(1)): Section 1 by the first day, Section 2 three business days
 *   later (weekends skipped; holidays counted, which gives the earlier, safe date), reverification by
 *   the end of the work authorization. Dates only (decision J4).
 * - Workers' comp: renewal by the day the policy ends; the premium audit on its date.
 * The run records the Illinois equal-pay crossings itself (slice c).
 */
import { addDays, isEffective, weekdayOf } from "@shiftbook/rules";

export type RuleAnchor = "expiry" | "fixed_dates" | "start" | "hire" | "crossing" | "first_pay_period_end" | "date";
export type SubjectKind = "registration" | "policy" | "client" | "assignment" | "worker" | "worker_client";

export interface ComplianceRule {
  code: string;
  jurisdiction: string;
  area: "registrations" | "clients" | "placements" | "workers" | "equal_pay" | "workers_comp" | "aca";
  subjectKind: SubjectKind;
  anchor: RuleAnchor;
  offsetDays: number;
  businessDays: number;
  remindDays: number;
  /** "MM-DD" each year. */
  fixedDates: string[];
  lookbackDays: number;
  socGroups: string[];
  roles: string[];
  citation: string;
  sourceUrl: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface Registration {
  id: string;
  jurisdiction: "IL" | "MA" | "NJ";
  branchId: string | null;
  number: string;
  issuedOn: string | null;
  expiresOn: string;
}

export interface Policy {
  id: string;
  carrier: string;
  policyNumber: string;
  startsOn: string;
  endsOn: string;
  auditDueOn: string | null;
}

export interface Placement {
  id: string;
  workerId: string;
  clientId: string;
  /** The worksite's state. */
  state: string | null;
  dayAndTemporaryLabor: boolean;
  socCode: string | null;
  startDate: string;
  endDate: string | null;
  status: "active" | "ended" | "cancelled";
  /** The last day of the pay period its start falls in. */
  firstPeriodEnd: string;
  workerLanguage: string;
}

export interface WorkerI9 {
  id: string;
  /** Its own hire date, else the start of its first placement (the caller decides). */
  hireDate: string | null;
  i9Section1On: string | null;
  i9Section2On: string | null;
  workAuthExpiresOn: string | null;
}

export interface GenerateInput {
  today: string;
  rules: ComplianceRule[];
  registrations: Registration[];
  policies: Policy[];
  placements: Placement[];
  workers: WorkerI9[];
}

export type Facts = Record<string, string | number | boolean | null>;

export interface Subject {
  kind: string;
  workerId: string | null;
  clientId: string | null;
  assignmentId: string | null;
  registrationId: string | null;
  policyId: string | null;
  occurrence: string;
}

export interface Wanted extends Subject {
  jurisdiction: string;
  subjectKind: SubjectKind;
  dueOn: string;
  remindOn: string;
  facts: Facts;
  /** English: what it was worked out from (the explain string). */
  message: string;
  /** Closed by the data itself (renewed; the date recorded), with the note saying how. */
  done: { note: string } | null;
}

export const keyOf = (s: Subject) => [s.kind, s.workerId ?? "", s.clientId ?? "", s.assignmentId ?? "", s.registrationId ?? "", s.policyId ?? "", s.occurrence].join("|");

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** n business days after a date: Monday to Friday; holidays are not skipped (the earlier date). */
export function addBusinessDays(date: string, n: number): string {
  let d = date;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    const w = weekdayOf(d);
    if (w !== 0 && w !== 6) left -= 1;
  }
  return d;
}

const REGISTRATION_RULE: Record<Registration["jurisdiction"], string> = { IL: "il_registration_renewal", MA: "ma_registration_renewal", NJ: "nj_certification_renewal" };

export function wantedObligations(input: GenerateInput): Wanted[] {
  const out: Wanted[] = [];
  const ruleOn = (code: string, date: string) => input.rules.find((r) => r.code === code && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;
  /** Not created when its due date is further back than the rule's look-back. */
  const recent = (r: ComplianceRule, dueOn: string) => dueOn >= addDays(input.today, -r.lookbackDays);
  const none = { workerId: null, clientId: null, assignmentId: null, registrationId: null, policyId: null };
  const push = (r: ComplianceRule, w: Omit<Wanted, "kind" | "jurisdiction" | "subjectKind" | "remindOn" | "message"> & { anchorText: string }) => {
    if (!recent(r, w.dueOn)) return;
    const { anchorText, ...rest } = w;
    out.push({ ...rest, kind: r.code, jurisdiction: r.jurisdiction, subjectKind: r.subjectKind, remindOn: addDays(w.dueOn, -r.remindDays), message: `${anchorText} (${r.citation}).` });
  };
  const dueAfter = (r: ComplianceRule, anchor: string) => (r.businessDays > 0 ? addBusinessDays(anchor, r.businessDays) : addDays(anchor, r.offsetDays));
  const expiryText = (what: string, anchor: string, r: ComplianceRule, due: string) =>
    r.offsetDays < 0 ? `${what} expires ${anchor}; due ${-r.offsetDays} days before, on ${due}` : r.offsetDays === 0 ? `${what} ends ${anchor}; due that day` : `${what} expires ${anchor}; due ${r.offsetDays} days after, on ${due}`;

  // Registrations: a renewal before each expires; a newer one for the same state and office renews it.
  for (const g of input.registrations) {
    const r = ruleOn(REGISTRATION_RULE[g.jurisdiction], g.expiresOn);
    if (!r) continue;
    const dueOn = dueAfter(r, g.expiresOn);
    const next = input.registrations.filter((o) => o.jurisdiction === g.jurisdiction && o.branchId === g.branchId && o.expiresOn > g.expiresOn).sort((a, b) => cmp(a.expiresOn, b.expiresOn))[0];
    push(r, {
      ...none,
      registrationId: g.id,
      occurrence: "",
      dueOn,
      facts: { number: g.number, expiresOn: g.expiresOn, branchId: g.branchId, renewedBy: next?.number ?? null, renewedUntil: next?.expiresOn ?? null },
      done: next ? { note: `Renewed: ${next.number}, expires ${next.expiresOn}.` } : null,
      anchorText: expiryText(`Registration ${g.number}`, g.expiresOn, r, dueOn),
    });
  }

  // Illinois clients with day and temporary labor: proof before the contract starts, and on the fixed dates.
  const live = input.placements.filter((p) => p.status !== "cancelled");
  const covered = live.filter((p) => p.state === "IL" && p.dayAndTemporaryLabor);
  for (const clientId of [...new Set(covered.map((p) => p.clientId))]) {
    const mine = covered.filter((p) => p.clientId === clientId).sort((a, b) => cmp(a.startDate, b.startDate) || cmp(a.id, b.id));
    const first = mine[0]!.startDate;
    const contract = ruleOn("il_client_proof_contract", first);
    if (contract) push(contract, { ...none, clientId, occurrence: "contract", dueOn: first, facts: { contractStarts: first }, done: null, anchorText: `The first placement starts ${first}; proof of registration due by then` });
    const runningOn = (d: string) => mine.some((p) => p.startDate <= d && (p.endDate === null || p.endDate >= d));
    const years = Number(input.today.slice(0, 4));
    const fixed = (code: string) => input.rules.filter((r) => r.code === code).flatMap((r) => r.fixedDates);
    const dates = [...new Set([years - 2, years - 1, years, years + 1].flatMap((y) => fixed("il_client_proof").map((md) => `${y}-${md}`)))].sort(cmp);
    const nextDate = dates.find((d) => d >= input.today);
    for (const d of dates) {
      if (nextDate === undefined || d > nextDate || !runningOn(d)) continue;
      const r = ruleOn("il_client_proof", d);
      if (!r || !r.fixedDates.includes(d.slice(5))) continue;
      push(r, { ...none, clientId, occurrence: d, dueOn: addDays(d, r.offsetDays), facts: { date: d }, done: null, anchorText: `A placement is running on ${d}, one of the dates (${r.fixedDates.join(", ")}) the client checks the agency's registration` });
    }
  }

  // Placements: the Massachusetts job order; the New Jersey notice in the worker's language.
  for (const p of live) {
    if (p.state === "MA") {
      const r = ruleOn("ma_job_order", p.startDate);
      if (r) push(r, { ...none, workerId: p.workerId, clientId: p.clientId, assignmentId: p.id, occurrence: "", dueOn: addDays(p.firstPeriodEnd, r.offsetDays), facts: { startDate: p.startDate, firstPeriodEnd: p.firstPeriodEnd }, done: null, anchorText: `The placement starts ${p.startDate}; due by the end of its first pay period, ${addDays(p.firstPeriodEnd, r.offsetDays)}` });
    }
    if (p.state === "NJ" && p.workerLanguage !== "en" && p.socCode) {
      const r = ruleOn("nj_language_notice", p.startDate);
      if (r && r.socGroups.includes(p.socCode.slice(0, 2))) {
        const dueOn = addDays(p.startDate, r.offsetDays);
        push(r, { ...none, workerId: p.workerId, clientId: p.clientId, assignmentId: p.id, occurrence: "", dueOn, facts: { startDate: p.startDate, language: p.workerLanguage, socCode: p.socCode }, done: null, anchorText: `The placement (SOC ${p.socCode}, a designated classification) starts ${p.startDate}; the worker's language is "${p.workerLanguage}"; due by then` });
      }
    }
  }

  // Form I-9, as dates.
  for (const w of input.workers) {
    if (w.hireDate) {
      for (const [code, doneOn, part] of [
        ["i9_section1", w.i9Section1On, "Section 1"],
        ["i9_section2", w.i9Section2On, "Section 2"],
      ] as const) {
        const r = ruleOn(code, w.hireDate);
        if (!r) continue;
        const dueOn = dueAfter(r, w.hireDate);
        const how = r.businessDays > 0 ? `due ${r.businessDays} business days later (weekends skipped), on ${dueOn}` : dueOn === w.hireDate ? "due by the first day" : `due on ${dueOn}`;
        push(r, { ...none, workerId: w.id, occurrence: "", dueOn, facts: { hireDate: w.hireDate, completedOn: doneOn }, done: doneOn ? { note: `${part} completed on ${doneOn}.` } : null, anchorText: `Hired ${w.hireDate}; ${how}` });
      }
    }
    if (w.workAuthExpiresOn) {
      const r = ruleOn("i9_reverify", w.workAuthExpiresOn);
      if (r) {
        const dueOn = addDays(w.workAuthExpiresOn, r.offsetDays);
        push(r, { ...none, workerId: w.id, occurrence: w.workAuthExpiresOn, dueOn, facts: { expiresOn: w.workAuthExpiresOn }, done: null, anchorText: `The work authorization ends ${w.workAuthExpiresOn}; reverify by ${dueOn}` });
      }
    }
  }

  // Workers' comp: renewal by the day the policy ends (a following policy renews it); the audit.
  for (const p of input.policies) {
    const r = ruleOn("wc_policy_renewal", p.endsOn);
    if (r) {
      const dueOn = dueAfter(r, p.endsOn);
      const next = input.policies.filter((o) => o.id !== p.id && o.startsOn <= addDays(p.endsOn, 1) && o.endsOn > p.endsOn).sort((a, b) => cmp(a.startsOn, b.startsOn))[0];
      push(r, { ...none, policyId: p.id, occurrence: "", dueOn, facts: { carrier: p.carrier, policyNumber: p.policyNumber, endsOn: p.endsOn, renewedBy: next?.policyNumber ?? null, renewedUntil: next?.endsOn ?? null }, done: next ? { note: `Renewed: ${next.policyNumber}, from ${next.startsOn} to ${next.endsOn}.` } : null, anchorText: expiryText(`Policy ${p.policyNumber}`, p.endsOn, r, dueOn) });
    }
    if (p.auditDueOn) {
      const a = ruleOn("wc_audit", p.auditDueOn);
      if (a) push(a, { ...none, policyId: p.id, occurrence: "", dueOn: addDays(p.auditDueOn, a.offsetDays), facts: { carrier: p.carrier, policyNumber: p.policyNumber, auditDueOn: p.auditDueOn }, done: null, anchorText: `The premium audit of policy ${p.policyNumber} is due ${p.auditDueOn}` });
    }
  }
  return out;
}
