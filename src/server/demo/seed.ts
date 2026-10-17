/**
 * Loads the fictional demo agency (SPEC §18). Runs inside withAgency(DEMO_AGENCY.id), so row-level
 * security keeps every write inside the demo agency — the same code path as any real agency.
 */
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { addDays, workweekStart } from "@shiftbook/rules";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { syncObligations } from "../compliance/sync";
import { BUILT_IN_PROFILES } from "../intake/profiles";
import { agencyToday } from "../settings";
import {
  AGENCY_SETTINGS,
  BRANCHES,
  BURDEN_TAX_RATES,
  CLIENTS,
  DEMO_AGENCY,
  DEMO_OWNER,
  demoSsnDigits,
  demoUuid,
  demoPayrollIds,
  JOB_ORDERS,
  NICKNAMES,
  PERIODS,
  RECRUITERS,
  STAFF,
  I9_DATES,
  MA_DEPARTMENT_CONTACT,
  MA_JOB_ORDER_OPEN,
  MA_NOTICE_DETAILS,
  OPENING_BALANCES,
  REGISTRATIONS,
  WC_POLICY,
  NJ_JOB,
  NJ_NOTICE_DETAILS,
  NJ_PLACED,
  NJ_SITE,
  NJ_STARTS_IN_DAYS,
  WC_RATES,
  WORK_AUTH_ENDS,
  WORKERS,
  type ClientKey,
  type JobKey,
} from "./dataset";
import { scenario } from "./scenario";
import { appKey, seal } from "../auth/crypto";
import { DEMO_SSO_ISSUER, demoClientId, demoClientSecret } from "../auth/demo-idp-config";
import { last4Of, sealSsn, ssnIndex } from "../workers/ssn";
import { DEMO_PHONES } from "../worker-app/demo";
import { phoneIndex } from "../worker-app/phone";

const agencyId = DEMO_AGENCY.id;
const SINCE = "2026-01-01";

/** Tenant tables in delete-safe order. audit_events is append-only and is never cleared. */
const CLEAR_ORDER = [
  // The forwarding address (slice y): its emails name documents and periods.
  "inbound_attachments",
  "inbound_emails",
  "inbound_addresses",
  "shift_offers",
  "shifts",
  // The worker app (slice t): a reset signs demo workers out of it (their sessions name the worker rows).
  "worker_clock_punches",
  "worker_messages",
  "worker_sessions",
  "worker_onboarding",
  "sms_messages",
  "onboarding_policies",
  "partner_handoffs",
  "jobs",
  "staff_requests",
  "burden_tax_rates",
  "wc_rates",
  "notifications",
  "notification_settings",
  "promises_to_pay",
  "credit_applications",
  "reminders",
  "short_pays",
  "write_offs",
  "payment_matches",
  "payments",
  "bank_lines",
  "bank_imports",
  "demo_mailbox",
  "email_messages",
  "client_disputes",
  "approval_decisions",
  "approval_links",
  "approval_requests",
  // After approval_links: a link made from the portal names its portal contact (drizzle/0057).
  "portal_links",
  "portal_contacts",
  "placement_imports",
  "premium_confirmations",
  "bonuses",
  "holiday_policies",
  "obligation_notes",
  "hours_opening_balances",
  "equal_pay_rates",
  "aca_monthly_hours",
  "obligation_documents",
  "worker_documents",
  "obligations",
  "agency_registrations",
  "wc_policies",
  "compliance_documents",
  "correction_decisions",
  "exports",
  "invoices",
  "bill_lines",
  "pay_lines",
  "pay_runs",
  "extraction_passes",
  "document_pages",
  "time_entries",
  "source_documents",
  "mapping_profiles",
  "rate_cards",
  "assignments",
  "job_orders",
  "nicknames",
  "workers",
  "client_billing_profiles",
  "worksites",
  "clients",
  "agency_settings",
  "pay_periods",
  "agency_sso",
  "email_sign_in_codes",
  "user_identities",
  "auth_tokens",
  "user_logins",
  // Sessions are kept: the demo people are seeded again with the same ids, so a reset signs no one out.
  "users",
  "branches",
] as const;

export async function clearDemoAgency(tx: Tx): Promise<void> {
  for (const table of CLEAR_ORDER) {
    await tx.execute(sql.raw(`delete from ${table} where agency_id = '${agencyId}'`));
  }
  // The demo numbers' text-message codes have no agency (sign-in mode only): a reset spends them too.
  const indexes = Object.values(DEMO_PHONES).map((p) => phoneIndex(p, appKey()));
  await tx.execute(sql`select set_config('app.auth', 'on', true)`);
  await tx.delete(s.workerSignInCodes).where(inArray(s.workerSignInCodes.phoneIndex, indexes));
  await tx.execute(sql`select set_config('app.auth', '', true)`);
}

export const clientId = (k: ClientKey) => demoUuid(`client:${k}`);
export const worksiteId = (k: ClientKey) => demoUuid(`worksite:${k}`);
export const jobOrderId = (k: JobKey) => demoUuid(`job:${k}`);
export const workerId = (key: string) => demoUuid(`worker:${key}`);
export const assignmentId = (key: string) => demoUuid(`assignment:${key}`);
export const periodId = (key: string) => demoUuid(`period:${key}`);

export async function seedDemoAgency(tx: Tx): Promise<void> {
  await tx.insert(s.users).values({ ...DEMO_OWNER, agencyId });
  await tx.insert(s.users).values(RECRUITERS.map((r) => ({ id: demoUuid(`user:${r.key}`), agencyId, name: r.name, email: r.email, role: r.role })));
  await tx.insert(s.users).values(STAFF.map((r) => ({ id: demoUuid(`user:${r.key}`), agencyId, name: r.name, email: r.email, role: r.role })));
  await tx.insert(s.branches).values(BRANCHES.map((b) => ({ id: demoUuid(`branch:${b.key}`), agencyId, name: b.name })));
  // Single sign-on on, through the demo's stand-in provider (decision 0033); its secret derived at run time.
  const ssoSecret = demoClientSecret("sso");
  await tx.insert(s.agencySso).values({ agencyId, enabled: true, issuer: DEMO_SSO_ISSUER, clientId: demoClientId("sso"), clientSecret: seal(Buffer.from(ssoSecret, "utf8"), appKey(), `sso:${agencyId}`), secretLast4: ssoSecret.slice(-4), updatedByLabel: "Demo setup" });
  await tx.insert(s.burdenTaxRates).values(BURDEN_TAX_RATES.map((r) => ({ agencyId, ...r, effectiveFrom: SINCE, createdByLabel: "Demo setup" })));
  await tx.insert(s.wcRates).values(WC_RATES.map((r) => ({ agencyId, ...r, effectiveFrom: SINCE, createdByLabel: "Demo setup" })));
  await tx.insert(s.agencySettings).values(
    AGENCY_SETTINGS.map((setting) => ({ agencyId, key: setting.key, value: setting.value, effectiveFrom: SINCE })),
  );
  await tx.insert(s.payPeriods).values(PERIODS.map((p) => ({ id: periodId(p.key), agencyId, startsOn: p.startsOn, endsOn: p.endsOn })));

  for (const [key, c] of Object.entries(CLIENTS) as [ClientKey, (typeof CLIENTS)[ClientKey]][]) {
    await tx.insert(s.clients).values({ id: clientId(key), agencyId, name: c.name, code: c.code, addressLines: c.addressLines, billingEmail: c.billingEmail });
    await tx.insert(s.worksites).values({ id: worksiteId(key), agencyId, clientId: clientId(key), ...c.worksite });
    await tx.insert(s.clientBillingProfiles).values({
      agencyId,
      clientId: clientId(key),
      overtimeBillingRule: c.billing.overtimeBillingRule,
      poRequired: c.billing.poNumber !== null,
      poNumber: c.billing.poNumber,
      vmsName: c.billing.vmsName,
      paymentTermsDays: c.billing.paymentTermsDays,
      invoiceTemplate: c.invoices.template,
      backupDetail: c.invoices.backupDetail,
      backupImages: c.invoices.backupImages,
      vmsFormat: c.invoices.vmsFormat,
      effectiveFrom: SINCE,
    });
  }

  for (const [key, j] of Object.entries(JOB_ORDERS) as [JobKey, (typeof JOB_ORDERS)[JobKey]][]) {
    await tx.insert(s.jobOrders).values({
      id: jobOrderId(key),
      agencyId,
      clientId: clientId(j.client),
      worksiteId: worksiteId(j.client),
      position: j.position,
      socCode: j.socCode,
      shift: j.shift,
      headcount: j.headcount,
      payMinCents: j.payRateCents,
      payMaxCents: j.payRateCents,
      branchId: demoUuid(`branch:${j.client === "ca" ? "ontario" : "main"}`),
    });
    await tx.insert(s.rateCards).values({
      agencyId,
      jobOrderId: jobOrderId(key),
      effectiveFrom: SINCE,
      payRateCents: j.payRateCents,
      billRateCents: j.billRateCents,
      otMultiplierNum: 3,
      otMultiplierDen: 2,
      dtMultiplierNum: 2,
      dtMultiplierDen: 1,
      wcClassCode: j.wcClassCode,
    });
  }

  for (const [index, w] of WORKERS.entries()) {
    const job = JOB_ORDERS[w.job];
    const ssn = demoSsnDigits(w.key);
    await tx.insert(s.workers).values({
      id: workerId(w.key),
      agencyId,
      ...(ssn ? { ssnSealed: sealSsn(ssn, appKey(), workerId(w.key)), ssnLast4: last4Of(ssn), ssnIndex: ssnIndex(ssn, appKey(), agencyId) } : {}),
      firstName: w.firstName,
      lastName: w.lastName,
      preferredLanguage: w.preferredLanguage,
      payrollIds: demoPayrollIds(w.key, `${job.position} (Primary)`),
      wcState: CLIENTS[job.client].worksite.state,
      hireDate: I9_DATES.hireDate,
      i9Section1On: I9_DATES.section1On,
      i9Section2On: I9_DATES.section2On,
      workAuthExpiresOn: WORK_AUTH_ENDS[w.key] ?? null,
    });
    await tx.insert(s.assignments).values({
      id: assignmentId(w.key),
      agencyId,
      workerId: workerId(w.key),
      jobOrderId: jobOrderId(w.job),
      startDate: "2026-08-03",
      status: "active",
      // Every other placement is each recruiter's (slice i).
      recruiterUserId: demoUuid(`user:${RECRUITERS[index % 2]!.key}`),
    });
  }

  await tx.insert(s.nicknames).values(NICKNAMES.map(([nickname, givenName]) => ({ agencyId, nickname, givenName })));
  await tx.insert(s.mappingProfiles).values(
    BUILT_IN_PROFILES.map((p) => ({ id: demoUuid(`profile:${p.key}`), agencyId, name: p.name, source: p.key, version: p.version, definition: p })),
  );

  // The prior week is already processed history: locked entries entered by hand.
  const history = scenario("w1");
  if (history.length > 0) {
    await tx.insert(s.timeEntries).values(
      history.map((d, i) => ({
        agencyId,
        payPeriodId: periodId("w1"),
        rowIndex: i,
        workerNameRaw: WORKERS.find((w) => w.key === d.workerKey)!.lastName,
        workerId: workerId(d.workerKey),
        assignmentId: assignmentId(d.workerKey),
        workDate: d.date,
        inMinute: d.inMinute,
        outMinute: d.outMinute,
        breakMinutes: d.breakMinutes,
        minutes: d.minutes,
        confidence: "high" as const,
        status: "locked" as const,
      })),
    );
  }

  // Compliance (slice j): registrations, the workers' comp policy, then the duties they call for; the
  // proof pages and Massachusetts job orders already done, except one job order (an overdue duty).
  await tx.insert(s.agencyRegistrations).values(REGISTRATIONS.map((r) => ({ id: demoUuid(`registration:${r.key}`), agencyId, jurisdiction: r.jurisdiction, number: r.number, issuedOn: r.issuedOn, expiresOn: r.expiresOn, createdByLabel: SETUP })));
  await tx.insert(s.wcPolicies).values({ id: demoUuid("policy:2026"), agencyId, ...WC_POLICY, createdByLabel: SETUP });
  await tx.update(s.jobOrders).set({ noticeDetails: MA_NOTICE_DETAILS }).where(eq(s.jobOrders.id, jobOrderId("ma-server")));
  await tx.insert(s.agencySettings).values({ agencyId, key: "compliance.ma_department_contact", value: MA_DEPARTMENT_CONTACT, effectiveFrom: SINCE });
  // Slice r: the demo agency emails reminders 3 days before the due date, 7 days after and a final
  // notice at 30 (Stripe's automatic reminders); its notices arrive from its own duties and invoices.
  await tx.insert(s.agencySettings).values({ agencyId, key: "collection_reminders", value: { enabled: true, beforeDueDays: 3, overdueDays: 7, finalDays: 30 }, effectiveFrom: SINCE });
  await tx.insert(s.hoursOpeningBalances).values(OPENING_BALANCES.map((b) => ({ agencyId, workerId: workerId(b.worker), clientId: clientId(b.client), minutes: b.minutes, throughOn: b.throughOn, note: b.note, createdByLabel: SETUP })));
  await seedNewJersey(tx, await agencyToday(tx));
  await syncObligations(tx, agencyId, await agencyToday(tx));
  const done = { status: "done" as const, doneAt: new Date(), doneByLabel: SETUP };
  await tx
    .update(s.obligations)
    .set({ ...done, statusNote: "Proof of registration given to the client (demo)." })
    .where(and(eq(s.obligations.clientId, clientId("il")), inArray(s.obligations.kind, ["il_client_proof_contract", "il_client_proof"]), lte(s.obligations.dueOn, "2026-09-01")));
  const sent = WORKERS.filter((w) => JOB_ORDERS[w.job].client === "ma" && !MA_JOB_ORDER_OPEN.includes(w.key)).map((w) => assignmentId(w.key));
  await tx.update(s.obligations).set({ ...done, statusNote: "Job order sent by email the day the placement started (demo)." }).where(and(eq(s.obligations.kind, "ma_job_order"), inArray(s.obligations.assignmentId, sent)));
  await seedWorkerApp(tx);
  const today = await agencyToday(tx);
  await seedSchedule(tx, today);
  await seedPortal(tx, today);
}

/**
 * The client portal in the demo (slice v): Harborview's events contact (Massachusetts) has portal access
 * and has asked for four event servers for a weekend next week (a pending request on Job orders). No
 * link is kept: the agency sends one from the client's Portal access.
 */
async function seedPortal(tx: Tx, today: string): Promise<void> {
  const [contact] = await tx
    .insert(s.portalContacts)
    .values({ agencyId, clientId: clientId("ma"), name: "Robin Okafor (demo)", email: "robin.okafor@harborview.example.com", locale: "en", createdByLabel: SETUP })
    .returning({ id: s.portalContacts.id });
  await tx.insert(s.staffRequests).values({
    agencyId,
    clientId: clientId("ma"),
    contactId: contact!.id,
    position: "Event server",
    worksiteId: worksiteId("ma"),
    startsOn: addDays(today, 7),
    endsOn: addDays(today, 8),
    shiftStartMinute: 960,
    shiftEndMinute: 1380,
    headcount: 4,
    notes: "A conference dinner for 300; black pants and shoes (demo).",
  });
}

/**
 * The worker app in the demo (slice t): mobile numbers for a few workers, clock-in at the Illinois
 * client, Daniel Ruiz (who prefers Spanish) onboarded with a translated message thread, Maribel Torres
 * part-way through onboarding, two more invited. The answers are sealed as the app seals them.
 */
async function seedWorkerApp(tx: Tx): Promise<void> {
  const kek = appKey();
  for (const [key, phone] of Object.entries(DEMO_PHONES)) await tx.update(s.workers).set({ phone, phoneIndex: phoneIndex(phone, kek) }).where(eq(s.workers.id, workerId(key)));
  await tx.update(s.clients).set({ workerClock: "on" }).where(eq(s.clients.id, clientId("il")));
  const at = (iso: string) => new Date(iso);
  const daniel = workerId("daniel-ruiz");
  const sealed = (value: string, aad: string) => seal(Buffer.from(value, "utf8"), kek, aad);
  await tx.insert(s.workerOnboarding).values([
    {
      workerId: daniel,
      agencyId,
      invitedAt: at("2026-09-21T15:00:00Z"),
      invitedByLabel: "Lena Ortiz (demo)",
      personal: { legalFirstName: "Daniel", legalLastName: "Ruiz", addressLine: "418 Cass St", city: "Joliet", state: "IL", zip: "60432", email: null },
      personalAt: at("2026-09-21T23:10:00Z"),
      birthSealed: sealed("1991-06-14", `birth:${daniel}`),
      w4: { filingStatus: "married_jointly", multipleJobs: false, dependentsCents: 200000, otherIncomeCents: 0, deductionsCents: 0, extraWithholdingCents: 0, exempt: false },
      w4At: at("2026-09-21T23:14:00Z"),
      i9Sealed: sealed(JSON.stringify({ status: "citizen" }), `i9:${daniel}`),
      i9Status: "citizen",
      i9At: at("2026-09-21T23:15:00Z"),
      paymentKind: "direct_deposit",
      depositSealed: sealed(JSON.stringify({ kind: "direct_deposit", routing: "021000021", account: "000400142", accountType: "checking" }), `deposit:${daniel}`),
      depositLast4: "0142",
      paymentAt: at("2026-09-21T23:18:00Z"),
      policies: ["safety", "harassment", "timekeeping"].map((key) => ({ key, at: "2026-09-21T23:19:00.000Z" })),
      policiesAt: at("2026-09-21T23:19:00Z"),
      signedName: "Daniel Ruiz",
      signedAt: at("2026-09-21T23:20:00Z"),
    },
    {
      workerId: workerId("maribel-torres"),
      agencyId,
      invitedAt: at("2026-10-12T16:00:00Z"),
      invitedByLabel: "Sam Whitfield (demo)",
      personal: { legalFirstName: "Maribel", legalLastName: "Torres", addressLine: "77 Olive Ave", city: "Stockton", state: "CA", zip: "95202", email: null },
      personalAt: at("2026-10-12T20:05:00Z"),
      birthSealed: sealed("1998-11-03", `birth:${workerId("maribel-torres")}`),
      w4: { filingStatus: "single", multipleJobs: false, dependentsCents: 0, otherIncomeCents: 0, deductionsCents: 0, extraWithholdingCents: 0, exempt: false },
      w4At: at("2026-10-12T20:09:00Z"),
    },
    { workerId: workerId("luis-hernandez"), agencyId, invitedAt: at("2026-10-14T15:30:00Z"), invitedByLabel: "Sam Whitfield (demo)" },
    { workerId: workerId("pedro-alcantara"), agencyId, invitedAt: at("2026-10-15T14:00:00Z"), invitedByLabel: "Lena Ortiz (demo)" },
  ]);
  const thread: { sender: "agency" | "worker"; body: string; bodyLocale: "en" | "es"; translation: string; at: string }[] = [
    { sender: "agency", body: "Hi Daniel, can you work Saturday 7 AM to 3:30 PM at Prairie Line?", bodyLocale: "en", translation: "Hola Daniel, ¿puede trabajar el sábado de 7 a. m. a 3:30 p. m. en Prairie Line?", at: "2026-10-08T14:02:00Z" },
    { sender: "worker", body: "Sí, puedo trabajar el sábado. ¿Necesito llevar botas de seguridad?", bodyLocale: "es", translation: "Yes, I can work Saturday. Do I need to bring safety boots?", at: "2026-10-08T14:20:00Z" },
    { sender: "agency", body: "Yes, steel-toe boots please. Thank you!", bodyLocale: "en", translation: "Sí, botas con punta de acero, por favor. ¡Gracias!", at: "2026-10-08T14:31:00Z" },
    { sender: "worker", body: "Gracias. ¿Cuándo recibo mi pago de esta semana?", bodyLocale: "es", translation: "Thank you. When do I get paid for this week?", at: "2026-10-15T22:45:00Z" },
  ];
  await tx.insert(s.workerMessages).values(
    thread.map((m) => ({
      agencyId,
      workerId: daniel,
      sender: m.sender,
      authorLabel: m.sender === "agency" ? "Lena Ortiz (demo)" : "Daniel Ruiz",
      authorUserId: m.sender === "agency" ? demoUuid("user:lena") : null,
      body: m.body,
      bodyLocale: m.bodyLocale,
      translation: m.translation,
      translationLocale: m.bodyLocale === "en" ? "es" : "en",
      createdAt: at(m.at),
      readByWorkerAt: m.sender === "agency" ? at(m.at) : null,
      readByAgencyAt: m.sender === "worker" && m.at < "2026-10-10" ? at(m.at) : null,
    })),
  );
}

/**
 * This week's schedule (slice u): the first workers confirmed Monday to Friday; on the weekend an open
 * shift offered to two workers on its order, a declined shift and a draft (so they are always in this
 * week's view); one shift two days ahead awaiting an answer; a no-show on a day that has passed.
 */
async function seedSchedule(tx: Tx, today: string): Promise<void> {
  const monday = workweekStart(today, 1);
  const day = (n: number) => addDays(monday, n);
  const published = sql`now()`;
  const base = { agencyId, startMinute: 420, endMinute: 930, breakMinutes: 30, publishedAt: published, changedAt: sql`now() - interval '1 minute'` };
  const crew = WORKERS.slice(0, 6);
  for (const w of crew)
    await tx.insert(s.shifts).values(
      [0, 1, 2, 3, 4].map((n) => ({ ...base, jobOrderId: jobOrderId(w.job), workDate: day(n), workerId: workerId(w.key), assignmentId: assignmentId(w.key), state: "confirmed" as const })),
    );
  // A no-show on the first of those days that has passed.
  const past = [0, 1, 2, 3, 4].map(day).find((d) => d < today);
  if (past) await tx.update(s.shifts).set({ noShow: true }).where(and(eq(s.shifts.workerId, workerId(crew[0]!.key)), eq(s.shifts.workDate, past)));
  const [asker, decliner, drafted] = [WORKERS[6]!, WORKERS[7]!, WORKERS[8]!];
  const ahead = addDays(today, 2);
  await tx.insert(s.shifts).values({
    ...base,
    jobOrderId: jobOrderId(asker.job),
    workDate: ahead,
    workerId: workerId(asker.key),
    state: "awaiting",
    confirmBy: sql`((${ahead}::date + make_interval(mins => 420)) AT TIME ZONE 'UTC') - interval '16 hours'`,
  });
  // The worker app's demo people (one in English, one in Spanish) each have a shift waiting for an
  // answer, so "Continue as" shows the Shifts tab with something to do.
  for (const key of ["marcus-bell", "daniel-ruiz"] as const) {
    const w = WORKERS.find((x) => x.key === key)!;
    await tx.insert(s.shifts).values({
      ...base,
      jobOrderId: jobOrderId(w.job),
      workDate: ahead,
      workerId: workerId(w.key),
      state: "awaiting",
      confirmBy: sql`((${ahead}::date + make_interval(mins => 420)) AT TIME ZONE 'UTC') - interval '16 hours'`,
    });
  }
  const [open] = await tx.insert(s.shifts).values({ ...base, jobOrderId: jobOrderId(crew[1]!.job), workDate: day(6), workerId: null, state: "open" }).returning({ id: s.shifts.id });
  const mates = WORKERS.filter((w) => w.job === crew[1]!.job && w.key !== crew[1]!.key).slice(0, 2);
  if (mates.length > 0) await tx.insert(s.shiftOffers).values(mates.map((w) => ({ agencyId, shiftId: open!.id, workerId: workerId(w.key) })));
  await tx.insert(s.shifts).values({
    ...base,
    jobOrderId: jobOrderId(decliner.job),
    workDate: day(6),
    workerId: null,
    state: "open",
    warning: "declined",
    warningWorkerId: workerId(decliner.key),
    warningReason: "A medical appointment that morning (demo).",
    changedAt: sql`now() + interval '1 second'`,
  });
  await tx.insert(s.shifts).values({ agencyId, jobOrderId: jobOrderId(drafted.job), workDate: day(5), startMinute: 840, endMinute: 1350, breakMinutes: 30, workerId: workerId(drafted.key), state: "assigned" });
}

const SETUP = "Demo setup";

/**
 * New Jersey (SPEC §27.10): Prairie Line's Newark site, its packer job order with the details form
 * MW-23 asks for, and three placements starting after the demo's pay weeks — one worker who prefers
 * Spanish, so the notice in the worker's language and the pay-statement flag show too.
 */
async function seedNewJersey(tx: Tx, today: string): Promise<void> {
  const site = demoUuid("worksite:nj-newark");
  const job = demoUuid("job:nj-packer");
  await tx.insert(s.worksites).values({ id: site, agencyId, clientId: clientId("il"), ...NJ_SITE });
  await tx.insert(s.jobOrders).values({
    id: job,
    agencyId,
    clientId: clientId("il"),
    worksiteId: site,
    position: NJ_JOB.position,
    socCode: NJ_JOB.socCode,
    shift: NJ_JOB.shift,
    headcount: NJ_JOB.headcount,
    payMinCents: NJ_JOB.payRateCents,
    payMaxCents: NJ_JOB.payRateCents,
    branchId: demoUuid("branch:main"),
    noticeDetails: NJ_NOTICE_DETAILS,
  });
  await tx.insert(s.rateCards).values({
    agencyId,
    jobOrderId: job,
    effectiveFrom: SINCE,
    payRateCents: NJ_JOB.payRateCents,
    billRateCents: NJ_JOB.billRateCents,
    otMultiplierNum: 3,
    otMultiplierDen: 2,
    dtMultiplierNum: 2,
    dtMultiplierDen: 1,
    wcClassCode: NJ_JOB.wcClassCode,
  });
  const startDate = addDays(today, NJ_STARTS_IN_DAYS);
  await tx.insert(s.assignments).values(
    NJ_PLACED.map((key) => ({ id: demoUuid(`assignment:nj:${key}`), agencyId, workerId: workerId(key), jobOrderId: job, startDate, status: "active" as const, recruiterUserId: demoUuid(`user:${RECRUITERS[0]!.key}`) })),
  );
}
