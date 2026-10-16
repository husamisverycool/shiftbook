/**
 * The compliance duties the agency's data calls for (SPEC §16; slice j, decisions J1–J3). Pure and
 * deterministic: the same facts and day give the same duties. Every number — how long before an
 * expiry, which fixed dates, how many business days, how far back — is a compliance rule row
 * (drizzle/0029) with its citation; the rule in force on the date a duty counts from applies.
 *
 * - Registrations (820 ILCS 175/45, 56 Ill. Adm. Code 260.320; 454 CMR 24.06; N.J.S.A. 34:8D-8): a
 *   renewal before each one expires; a newer one for the same state and office renews it.
 * - Illinois proof of registration (820 ILCS 175/85(a); 260.510): for each client with day and
 *   temporary labor in Illinois, before each contract starts (a placement after a gap longer than
 *   the rule's window), and on each March 1 and September 1 the client has covered work running or
 *   within the window before, up to the next one.
 * - Massachusetts job order (M.G.L. c. 149 § 159C(b)): by the end of the placement's first pay period.
 * - New Jersey notice in English and the worker's language (N.J.S.A. 34:8D-3(a)): designated
 *   classifications only (SOC major groups in the rule row), by the start.
 * - Form I-9 (8 C.F.R. § 274a.2(b)(1)): one per hire date. Section 1 by the first day, Section 2
 *   three business days later (Monday to Friday and the weekend days the agency is open; holidays
 *   counted, which gives the earlier, safe date), or by the first day for a job shorter than that;
 *   a date recorded more than the rule's window before the hire belongs to an earlier hire.
 *   Reverification by the end of the work authorization. Dates only (decision J4).
 * - Workers' comp: renewal by the day the policy ends (a following policy covering at least the same
 *   states renews it); the premium audit on its date.
 * - ACA (26 C.F.R. § 54.4980H-3(d)): for each measurement period a worker was measured full-time in,
 *   coverage offered by the day before its stability period begins (the end of the administrative
 *   period), so it is in place from the first day (aca.ts works out the periods).
 * A duty further back than its rule's look-back is marked too old: not created, but one already on
 * file is kept (an overdue duty never closes because it is old). The run records the Illinois
 * equal-pay crossings itself (slice c).
 */
import { citationCodeOf } from "./explain-keys";
import { addDays, formatDuration, isEffective, weekdayOf } from "@shiftbook/rules";
import type { Explain, ExplainPart } from "../../lib/explain";

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
  /** How far back related facts count: covered work before an Illinois date or contract; an I-9 date before the hire. */
  windowDays: number;
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
  /** The states it covers; none listed: all. */
  states: string[];
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
  /** When the job that starts on the hire date ends (the latest such placement); null: open-ended or unknown. */
  firstJobEndsOn: string | null;
}

/** The weekdays (0 Sunday … 6 Saturday) the agency is open, from a date (an agency setting). */
export interface OpenDays {
  weekdays: number[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** A measurement period a worker was measured full-time in (aca.ts). */
export interface AcaOffer {
  workerId: string;
  cycle: "standard" | "initial";
  measurementStart: string;
  measurementEnd: string;
  minutes: number;
  days: number;
  averageMinutesPerWeek: number;
  /** The weekly average the limits row asks for (1,800 minutes: 30 hours). */
  fullTimeMinutesPerWeek: number;
  stabilityStart: string;
  stabilityEnd: string;
}

export interface GenerateInput {
  today: string;
  rules: ComplianceRule[];
  registrations: Registration[];
  policies: Policy[];
  placements: Placement[];
  workers: WorkerI9[];
  openDays: OpenDays[];
  /** None until the agency enters its measurement settings. */
  aca?: AcaOffer[];
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
  /** The same, as message keys and values, for the reader's language (decision 0028). */
  explain: Explain;
  /** Closed by the data itself (renewed; the date recorded), with the note saying how (and in keys). */
  done: { note: string; key: Explain } | null;
  /** Due further back than the rule's look-back: not created, but kept if already on file. */
  tooOld: boolean;
}

export const keyOf = (s: Subject) => [s.kind, s.workerId ?? "", s.clientId ?? "", s.assignmentId ?? "", s.registrationId ?? "", s.policyId ?? "", s.occurrence].join("|");

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** 657000 → "657,000". */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Monday to Friday always count as business days; holidays are not skipped (the earlier date). */
export const WEEKDAYS_OPEN = [1, 2, 3, 4, 5];

/** n business days after a date: Monday to Friday, and the weekend days in `open`; holidays are not skipped (the earlier date). */
export function addBusinessDays(date: string, n: number, open: number[] = WEEKDAYS_OPEN): string {
  let d = date;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    const w = weekdayOf(d);
    if (WEEKDAYS_OPEN.includes(w) || open.includes(w)) left -= 1;
  }
  return d;
}

const REGISTRATION_RULE: Record<Registration["jurisdiction"], string> = { IL: "il_registration_renewal", MA: "ma_registration_renewal", NJ: "nj_certification_renewal" };

export function wantedObligations(input: GenerateInput): Wanted[] {
  const out: Wanted[] = [];
  const ruleOn = (code: string, date: string) => input.rules.find((r) => r.code === code && isEffective(date, r.effectiveFrom, r.effectiveTo)) ?? null;
  /** Too old when its due date is further back than the rule's look-back. */
  const tooOld = (r: ComplianceRule, dueOn: string) => dueOn < addDays(input.today, -r.lookbackDays);
  const none = { workerId: null, clientId: null, assignmentId: null, registrationId: null, policyId: null };
  const push = (r: ComplianceRule, w: Omit<Wanted, "kind" | "jurisdiction" | "subjectKind" | "remindOn" | "message" | "explain" | "tooOld"> & { anchorText: string; parts: ExplainPart[] }) => {
    const { anchorText, parts, ...rest } = w;
    out.push({ ...rest, kind: r.code, jurisdiction: r.jurisdiction, subjectKind: r.subjectKind, remindOn: addDays(w.dueOn, -r.remindDays), message: `${anchorText} (${r.citation}).`, explain: { parts, citation: r.citation, citationCode: citationCodeOf(r.code, r.citation) }, tooOld: tooOld(r, w.dueOn) });
  };
  const openOn = (date: string) => input.openDays.find((o) => isEffective(date, o.effectiveFrom, o.effectiveTo))?.weekdays ?? WEEKDAYS_OPEN;
  const dueAfter = (r: ComplianceRule, anchor: string) => (r.businessDays > 0 ? addBusinessDays(anchor, r.businessDays, openOn(anchor)) : addDays(anchor, r.offsetDays));
  const expiryText = (what: string, anchor: string, r: ComplianceRule, due: string) =>
    r.offsetDays < 0 ? `${what} expires ${anchor}; due ${-r.offsetDays} days before, on ${due}` : r.offsetDays === 0 ? `${what} ends ${anchor}; due that day` : `${what} expires ${anchor}; due ${r.offsetDays} days after, on ${due}`;
  const expiryParts = (subject: "registration" | "policy", number: string, anchor: string, r: ComplianceRule, due: string): ExplainPart[] => [
    r.offsetDays < 0
      ? { key: "expiryBefore", values: { subject, number, anchor: { date: anchor }, days: String(-r.offsetDays), dueOn: { date: due } } }
      : r.offsetDays === 0
        ? { key: "expiryOn", values: { subject, number, anchor: { date: anchor } } }
        : { key: "expiryAfter", values: { subject, number, anchor: { date: anchor }, days: String(r.offsetDays), dueOn: { date: due } } },
  ];

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
      done: next ? { note: `Renewed: ${next.number}, expires ${next.expiresOn}.`, key: { parts: [{ key: "noteRenewed", values: { number: next.number, expires: { date: next.expiresOn } } }], citation: null } } : null,
      anchorText: expiryText(`Registration ${g.number}`, g.expiresOn, r, dueOn),
      parts: expiryParts("registration", g.number, g.expiresOn, r, dueOn),
    });
  }

  // Illinois clients with day and temporary labor: proof before each contract starts, and on the fixed dates.
  const live = input.placements.filter((p) => p.status !== "cancelled");
  const covered = live.filter((p) => p.state === "IL" && p.dayAndTemporaryLabor);
  const proofRules = input.rules.filter((r) => r.code === "il_client_proof");
  const fromYear = Number(addDays(input.today, -Math.max(0, ...proofRules.map((r) => r.lookbackDays))).slice(0, 4));
  const toYear = Number(input.today.slice(0, 4)) + 1;
  const dates = [...new Set(Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i).flatMap((y) => proofRules.flatMap((r) => r.fixedDates).map((md) => `${y}-${md}`)))].sort(cmp);
  const nextDate = dates.find((d) => d >= input.today);
  for (const clientId of [...new Set(covered.map((p) => p.clientId))]) {
    const mine = covered.filter((p) => p.clientId === clientId).sort((a, b) => cmp(a.startDate, b.startDate) || cmp(a.id, b.id));
    // A contract starts with a placement when no covered work for the client ran within the window before it.
    let lastEnd: string | null = null;
    for (const p of mine) {
      const r = ruleOn("il_client_proof_contract", p.startDate);
      const ongoing = lastEnd !== null && (lastEnd === "open" || lastEnd >= addDays(p.startDate, -(r?.windowDays ?? 0)));
      if (!ongoing && r) {
        const since = lastEnd === null ? "" : `, more than ${r.windowDays} days after the client's last covered work (${lastEnd})`;
        const parts: ExplainPart[] = [lastEnd === null ? { key: "contractStarts", values: { startDate: { date: p.startDate } } } : { key: "contractStartsAfterGap", values: { startDate: { date: p.startDate }, windowDays: String(r.windowDays), lastEnd: { date: lastEnd } } }];
        push(r, { ...none, clientId, occurrence: `contract:${p.startDate}`, dueOn: p.startDate, facts: { contractStarts: p.startDate }, done: null, anchorText: `A placement starts ${p.startDate}${since}; proof of registration due by then`, parts });
      }
      const end = p.endDate ?? "open";
      if (lastEnd !== "open" && (end === "open" || lastEnd === null || end > lastEnd)) lastEnd = end;
    }
    for (const d of dates) {
      if (nextDate === undefined || d > nextDate) continue;
      const r = ruleOn("il_client_proof", d);
      if (!r || !r.fixedDates.includes(d.slice(5))) continue;
      const from = addDays(d, -r.windowDays);
      const running = mine.some((p) => p.startDate <= d && (p.endDate === null || p.endDate >= d));
      const recently = !running && mine.some((p) => p.startDate <= d && p.endDate !== null && p.endDate >= from);
      if (!running && !recently) continue;
      const why = running ? `A placement is running on ${d}` : `The client had covered work within ${r.windowDays} days before ${d}`;
      const parts: ExplainPart[] = [running ? { key: "proofRunning", values: { date: { date: d }, dates: { monthDays: r.fixedDates } } } : { key: "proofRecent", values: { windowDays: String(r.windowDays), date: { date: d }, dates: { monthDays: r.fixedDates } } }];
      push(r, { ...none, clientId, occurrence: d, dueOn: addDays(d, r.offsetDays), facts: { date: d }, done: null, anchorText: `${why}, one of the dates (${r.fixedDates.join(", ")}) the client checks the agency's registration`, parts });
    }
  }

  // Placements: the Massachusetts job order; the New Jersey notice in the worker's language.
  for (const p of live) {
    if (p.state === "MA") {
      const r = ruleOn("ma_job_order", p.startDate);
      if (r) {
        const dueOn = addDays(p.firstPeriodEnd, r.offsetDays);
        push(r, { ...none, workerId: p.workerId, clientId: p.clientId, assignmentId: p.id, occurrence: "", dueOn, facts: { startDate: p.startDate, firstPeriodEnd: p.firstPeriodEnd }, done: null, anchorText: `The placement starts ${p.startDate}; due by the end of its first pay period, ${dueOn}`, parts: [{ key: "maJobOrder", values: { startDate: { date: p.startDate }, dueOn: { date: dueOn } } }] });
      }
    }
    if (p.state === "NJ" && p.workerLanguage !== "en" && p.socCode) {
      const r = ruleOn("nj_language_notice", p.startDate);
      if (r && r.socGroups.includes(p.socCode.slice(0, 2))) {
        const dueOn = addDays(p.startDate, r.offsetDays);
        push(r, {
          ...none,
          workerId: p.workerId,
          clientId: p.clientId,
          assignmentId: p.id,
          occurrence: "",
          dueOn,
          facts: { startDate: p.startDate, language: p.workerLanguage, socCode: p.socCode },
          done: null,
          anchorText: `The placement (SOC ${p.socCode}, a designated classification) starts ${p.startDate}; the worker's language is "${p.workerLanguage}"; due by then`,
          parts: [{ key: "njNotice", values: { socCode: p.socCode, startDate: { date: p.startDate }, language: { language: p.workerLanguage } } }],
        });
      }
    }
  }

  // Form I-9, as dates: one per hire date.
  for (const w of input.workers) {
    if (w.hireDate) {
      const hire = w.hireDate;
      for (const [code, doneOn, part] of [
        ["i9_section1", w.i9Section1On, "Section 1"],
        ["i9_section2", w.i9Section2On, "Section 2"],
      ] as const) {
        const r = ruleOn(code, hire);
        if (!r) continue;
        // A job shorter than the business days: Section 2 by the first day (M-274 4.0).
        const open = openOn(hire);
        const short = r.businessDays > 0 && w.firstJobEndsOn !== null && w.firstJobEndsOn < addBusinessDays(addDays(hire, -1), r.businessDays, open);
        const dueOn = short ? hire : dueAfter(r, hire);
        const weekend = open.filter((d) => !WEEKDAYS_OPEN.includes(d));
        const counted = weekend.length === 0 ? "weekends skipped" : `Monday to Friday and ${weekend.map((d) => (d === 6 ? "Saturday" : "Sunday")).join(" and ")} counted`;
        const countedKey = weekend.length === 0 ? "skipped" : weekend.length === 2 ? (weekend[0] === 6 ? "saturdaySunday" : "sundaySaturday") : weekend[0] === 6 ? "saturday" : "sunday";
        const howPart: ExplainPart = short
          ? { key: "i9Short", values: { jobEnds: { date: w.firstJobEndsOn! }, days: String(r.businessDays) } }
          : r.businessDays > 0
            ? { key: "i9BusinessDays", values: { days: String(r.businessDays), counted: countedKey, dueOn: { date: dueOn } } }
            : dueOn === hire
              ? { key: "i9FirstDay" }
              : { key: "i9DueOn", values: { dueOn: { date: dueOn } } };
        const how = short
          ? `the job ends ${w.firstJobEndsOn}, less than ${r.businessDays} business days: due by the first day`
          : r.businessDays > 0
            ? `due ${r.businessDays} business days later (${counted}), on ${dueOn}`
            : dueOn === hire
              ? "due by the first day"
              : `due on ${dueOn}`;
        // A date recorded long before this hire belongs to an earlier one.
        const counts = doneOn !== null && doneOn >= addDays(hire, -r.windowDays);
        const earlier = doneOn !== null && !counts ? `; ${part} on file is dated ${doneOn}, more than ${r.windowDays} days before this hire` : "";
        const parts: ExplainPart[] = [{ key: "i9Hired", values: { hire: { date: hire } } }, howPart, ...(doneOn !== null && !counts ? [{ key: "i9Earlier", values: { part: code === "i9_section1" ? "section1" : "section2", doneOn: { date: doneOn }, windowDays: String(r.windowDays) } }] : [])];
        push(r, { ...none, workerId: w.id, occurrence: hire, dueOn, facts: { hireDate: hire, completedOn: counts ? doneOn : null }, done: counts ? { note: `${part} completed on ${doneOn}.`, key: { parts: [{ key: "noteCompleted", values: { part: code === "i9_section1" ? "section1" : "section2", date: { date: doneOn! } } }], citation: null } } : null, anchorText: `Hired ${hire}; ${how}${earlier}`, parts });
      }
    }
    if (w.workAuthExpiresOn) {
      const r = ruleOn("i9_reverify", w.workAuthExpiresOn);
      if (r) {
        const dueOn = addDays(w.workAuthExpiresOn, r.offsetDays);
        push(r, { ...none, workerId: w.id, occurrence: w.workAuthExpiresOn, dueOn, facts: { expiresOn: w.workAuthExpiresOn }, done: null, anchorText: `The work authorization ends ${w.workAuthExpiresOn}; reverify by ${dueOn}`, parts: [{ key: "reverify", values: { expiresOn: { date: w.workAuthExpiresOn }, dueOn: { date: dueOn } } }] });
      }
    }
  }

  // Workers' comp: renewal by the day the policy ends (a following policy renews it); the audit.
  for (const p of input.policies) {
    const r = ruleOn("wc_policy_renewal", p.endsOn);
    if (r) {
      const dueOn = dueAfter(r, p.endsOn);
      // A following policy renews it when it starts by the next day and covers at least the same states.
      const covers = (o: Policy) => o.states.length === 0 || (p.states.length > 0 && p.states.every((x) => o.states.includes(x)));
      const next = input.policies.filter((o) => o.id !== p.id && o.startsOn <= addDays(p.endsOn, 1) && o.endsOn > p.endsOn && covers(o)).sort((a, b) => cmp(a.startsOn, b.startsOn))[0];
      push(r, { ...none, policyId: p.id, occurrence: "", dueOn, facts: { carrier: p.carrier, policyNumber: p.policyNumber, endsOn: p.endsOn, renewedBy: next?.policyNumber ?? null, renewedUntil: next?.endsOn ?? null }, done: next ? { note: `Renewed: ${next.policyNumber}, from ${next.startsOn} to ${next.endsOn}.`, key: { parts: [{ key: "notePolicyRenewed", values: { number: next.policyNumber, from: { date: next.startsOn }, to: { date: next.endsOn } } }], citation: null } } : null, anchorText: expiryText(`Policy ${p.policyNumber}`, p.endsOn, r, dueOn), parts: expiryParts("policy", p.policyNumber, p.endsOn, r, dueOn) });
    }
    if (p.auditDueOn) {
      const a = ruleOn("wc_audit", p.auditDueOn);
      if (a) push(a, { ...none, policyId: p.id, occurrence: "", dueOn: addDays(p.auditDueOn, a.offsetDays), facts: { carrier: p.carrier, policyNumber: p.policyNumber, auditDueOn: p.auditDueOn }, done: null, anchorText: `The premium audit of policy ${p.policyNumber} is due ${p.auditDueOn}`, parts: [{ key: "wcAudit", values: { number: p.policyNumber, auditDueOn: { date: p.auditDueOn } } }] });
    }
  }

  // ACA: coverage offered by the day before the stability period of each period measured full-time.
  for (const c of input.aca ?? []) {
    const r = ruleOn("aca_offer", c.stabilityStart);
    if (!r) continue;
    const dueOn = addDays(c.stabilityStart, r.offsetDays - 1);
    push(r, {
      ...none,
      workerId: c.workerId,
      occurrence: `${c.cycle}:${c.measurementStart}`,
      dueOn,
      facts: { cycle: c.cycle, measurementStart: c.measurementStart, measurementEnd: c.measurementEnd, minutes: c.minutes, days: c.days, averageMinutesPerWeek: c.averageMinutesPerWeek, stabilityStart: c.stabilityStart, stabilityEnd: c.stabilityEnd },
      done: null,
      anchorText: `Measured full-time in the ${c.cycle} measurement period ${c.measurementStart} to ${c.measurementEnd}: ${formatDuration(c.minutes)} of service over ${c.days} days, ${formatDuration(c.averageMinutesPerWeek)} a week on average (${thousands(c.minutes)} minutes × 7 = ${thousands(c.minutes * 7)} ≥ ${thousands(c.fullTimeMinutesPerWeek)} × ${c.days} = ${thousands(c.fullTimeMinutesPerWeek * c.days)}); coverage for the stability period ${c.stabilityStart} to ${c.stabilityEnd} is offered by ${dueOn}`,
      parts: [
        {
          key: "acaOffer",
          values: {
            cycle: c.cycle,
            from: { date: c.measurementStart },
            to: { date: c.measurementEnd },
            minutes: { duration: c.minutes },
            days: String(c.days),
            average: { duration: c.averageMinutesPerWeek },
            minutesCount: { count: c.minutes },
            minutes7: { count: c.minutes * 7 },
            fullTime: { count: c.fullTimeMinutesPerWeek },
            fullTimeDays: { count: c.fullTimeMinutesPerWeek * c.days },
            stabilityFrom: { date: c.stabilityStart },
            stabilityTo: { date: c.stabilityEnd },
            dueOn: { date: dueOn },
          },
        },
      ],
    });
  }
  return out;
}
