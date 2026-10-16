/**
 * Loads the fictional demo agency (SPEC §18). Runs inside withAgency(DEMO_AGENCY.id), so row-level
 * security keeps every write inside the demo agency — the same code path as any real agency.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { BUILT_IN_PROFILES } from "../intake/profiles";
import {
  AGENCY_SETTINGS,
  CLIENTS,
  DEMO_AGENCY,
  DEMO_OWNER,
  demoUuid,
  demoPayrollIds,
  JOB_ORDERS,
  NICKNAMES,
  PERIODS,
  WORKERS,
  type ClientKey,
  type JobKey,
} from "./dataset";
import { scenario } from "./scenario";

const agencyId = DEMO_AGENCY.id;
const SINCE = "2026-01-01";

/** Tenant tables in delete-safe order. audit_events is append-only and is never cleared. */
const CLEAR_ORDER = [
  "jobs",
  "demo_mailbox",
  "email_messages",
  "client_disputes",
  "approval_decisions",
  "approval_links",
  "approval_requests",
  "placement_imports",
  "premium_confirmations",
  "bonuses",
  "holiday_policies",
  "obligations",
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
  "users",
  "branches",
] as const;

export async function clearDemoAgency(tx: Tx): Promise<void> {
  for (const table of CLEAR_ORDER) {
    await tx.execute(sql.raw(`delete from ${table} where agency_id = '${agencyId}'`));
  }
}

export const clientId = (k: ClientKey) => demoUuid(`client:${k}`);
export const worksiteId = (k: ClientKey) => demoUuid(`worksite:${k}`);
export const jobOrderId = (k: JobKey) => demoUuid(`job:${k}`);
export const workerId = (key: string) => demoUuid(`worker:${key}`);
export const assignmentId = (key: string) => demoUuid(`assignment:${key}`);
export const periodId = (key: string) => demoUuid(`period:${key}`);

export async function seedDemoAgency(tx: Tx): Promise<void> {
  await tx.insert(s.users).values({ ...DEMO_OWNER, agencyId });
  await tx.insert(s.branches).values({ id: demoUuid("branch:main"), agencyId, name: "Main office" });
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

  for (const w of WORKERS) {
    const job = JOB_ORDERS[w.job];
    await tx.insert(s.workers).values({
      id: workerId(w.key),
      agencyId,
      firstName: w.firstName,
      lastName: w.lastName,
      preferredLanguage: w.preferredLanguage,
      payrollIds: demoPayrollIds(w.key, `${job.position} (Primary)`),
      wcState: CLIENTS[job.client].worksite.state,
    });
    await tx.insert(s.assignments).values({
      id: assignmentId(w.key),
      agencyId,
      workerId: workerId(w.key),
      jobOrderId: jobOrderId(w.job),
      startDate: "2026-08-03",
      status: "active",
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
}
