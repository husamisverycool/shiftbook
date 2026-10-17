/**
 * Settings › Connections (decision 0040; docs/patterns/settings/connections.md — Zapier's App
 * Connections, Stripe's apps catalogue): every system Granite exchanges files with, what uses it, when
 * it was last used and whether it is ready. Read from what the agency already has: the payroll system
 * and its codes, saved placement mappings and imports, time-file profiles and the files read with them,
 * clients' invoice uploads. Partners (slice w) come from a typed registry.
 */
import { and, desc, eq, inArray, isNotNull, like, max, sql } from "drizzle-orm";
import { codeMapProblems, EXPORT_FORMATS, SYSTEM_OF, targetProblems, type ExportFormat } from "../../exports/targets";
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { BUILT_IN_PROFILES } from "../intake/profiles";
import { FIELDS, missingFields, SOURCES, type Mapping, type Source } from "../placements/fields";
import { payrollCodes, payrollTarget } from "../payroll/settings";

export type ConnectionKind = "payroll" | "recruiting" | "time_file" | "invoice_upload" | "partner";

export interface Connection {
  key: string;
  kind: ConnectionKind;
  /** The system's name key under `connections.systems` (a format, a source or a profile key). */
  system: string;
  /** For an invoice upload: the client it is for. */
  detail?: string;
  lastUsedAt: string | null;
  uses: number;
  status: "ready" | "attention";
  /** Why it needs attention, as a key under `connections.attention`, with values. */
  attention?: { key: string; values?: Record<string, string | number> };
  href: string;
  /** Recruiting systems: a saved mapping that can be forgotten. */
  forgettable?: boolean;
  /** A VMS time-file profile whose column names the agency can edit (decision 0043). */
  editable?: boolean;
}

/** Partner handoffs (SPEC §27 item 9): filled by slice w; listed here so the page names them now. */
export const PARTNER_HANDOFFS = ["embedded_payroll", "wage_access", "invoice_funding", "insurance"] as const;
export type PartnerHandoff = (typeof PARTNER_HANDOFFS)[number];

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Every active worker without an id in the payroll system: the run would refuse them. */
async function workersWithoutId(tx: Tx, format: ExportFormat): Promise<number> {
  const system = SYSTEM_OF[format];
  const people = await tx.select({ ids: s.workers.payrollIds }).from(s.workers).where(eq(s.workers.status, "active"));
  return people.filter((p) => !p.ids[system]?.id).length;
}

/** The payroll system's check (Zapier's Test): settings, codes and every active worker's id. */
export async function testPayroll(tx: Tx): Promise<Pick<Connection, "status" | "attention">> {
  const target = await payrollTarget(tx);
  if (!target) return { status: "attention", attention: { key: "noPayroll" } };
  if (targetProblems(target).length > 0) return { status: "attention", attention: { key: "payrollSettings" } };
  const codes = await payrollCodes(tx, target.format);
  if (codeMapProblems(target.format, codes.stored).length > 0 || codes.problems.length > 0) return { status: "attention", attention: { key: "payrollCodes" } };
  const missing = await workersWithoutId(tx, target.format);
  if (missing > 0) return { status: "attention", attention: { key: "payrollIds", values: { count: missing } } };
  return { status: "ready" };
}

/** A recruiting system's check: its saved mapping still names every required field. */
export function testMapping(mapping: Mapping | null): Pick<Connection, "status" | "attention"> {
  if (!mapping) return { status: "attention", attention: { key: "noMapping" } };
  const clean = Object.fromEntries(Object.entries(mapping).filter(([f]) => (FIELDS as readonly string[]).includes(f))) as Mapping;
  return missingFields(clean).length === 0 ? { status: "ready" } : { status: "attention", attention: { key: "mappingIncomplete" } };
}

export async function connectionsView(tx: Tx) {
  const connected: Connection[] = [];

  // The payroll system (one at a time, decision F1) and the last file made for it.
  const target = await payrollTarget(tx);
  if (target) {
    const [last] = await tx.select({ at: max(s.exports.createdAt), n: sql<number>`count(*)::int` }).from(s.exports).where(eq(s.exports.format, target.format));
    connected.push({ key: `payroll:${target.format}`, kind: "payroll", system: target.format, lastUsedAt: iso(last?.at), uses: last?.n ?? 0, ...(await testPayroll(tx)), href: "/settings/payroll" });
  }

  // Recruiting systems: a saved mapping, or imports made from them.
  const profiles = await tx.select().from(s.mappingProfiles).where(like(s.mappingProfiles.source, "placements:%"));
  const imports = await tx
    .select({ source: s.placementImports.source, at: max(s.placementImports.createdAt), n: sql<number>`count(*)::int` })
    .from(s.placementImports)
    .groupBy(s.placementImports.source);
  for (const source of SOURCES) {
    const profile = profiles.find((p) => p.source === `placements:${source}`);
    const used = imports.find((i) => i.source === source);
    if (!profile && !used) continue;
    const mapping = ((profile?.definition as { mapping?: Mapping } | undefined)?.mapping ?? null) as Mapping | null;
    connected.push({ key: `recruiting:${source}`, kind: "recruiting", system: source, lastUsedAt: iso(used?.at ?? profile?.createdAt), uses: used?.n ?? 0, ...testMapping(mapping), href: "/assignments/import", forgettable: !!profile });
  }

  // Time files: each saved profile (every version of its columns, decision 0043) and the files read with it.
  const timeProfiles = await tx.select().from(s.mappingProfiles).where(inArray(s.mappingProfiles.source, BUILT_IN_PROFILES.map((p) => p.key)));
  const timeSources = [...new Set(timeProfiles.map((p) => p.source))];
  if (timeSources.length > 0) {
    const reads = await tx
      .select({ profile: s.sourceDocuments.mappingProfileId, at: max(s.sourceDocuments.createdAt), n: sql<number>`count(*)::int` })
      .from(s.sourceDocuments)
      .where(isNotNull(s.sourceDocuments.mappingProfileId))
      .groupBy(s.sourceDocuments.mappingProfileId);
    for (const source of timeSources) {
      const ids = new Set(timeProfiles.filter((p) => p.source === source).map((p) => p.id));
      const mine = reads.filter((x) => x.profile && ids.has(x.profile));
      const at = mine.reduce<Date | null>((a, x) => (x.at && (!a || new Date(x.at) > a) ? new Date(x.at) : a), null);
      const profile = BUILT_IN_PROFILES.find((p) => p.key === source)!;
      connected.push({ key: `time:${source}`, kind: "time_file", system: source, lastUsedAt: iso(at), uses: mine.reduce((n, x) => n + x.n, 0), status: "ready", href: "/convert", editable: profile.kind === "vms" });
    }
  }

  // Invoice uploads a client's VMS takes (decision G9), from each client's billing settings in force.
  const uploads = await tx
    .select({ clientId: s.clients.id, name: s.clients.name, vms: s.clientBillingProfiles.vmsFormat, from: s.clientBillingProfiles.effectiveFrom })
    .from(s.clientBillingProfiles)
    .innerJoin(s.clients, eq(s.clients.id, s.clientBillingProfiles.clientId))
    .orderBy(desc(s.clientBillingProfiles.effectiveFrom));
  const seen = new Set<string>();
  for (const u of uploads) {
    if (seen.has(u.clientId)) continue;
    seen.add(u.clientId);
    if (!u.vms) continue;
    const [last] = await tx.select({ at: max(s.invoices.createdAt), n: sql<number>`count(*)::int` }).from(s.invoices).where(and(eq(s.invoices.clientId, u.clientId), isNotNull(s.invoices.vmsStorageKey)));
    connected.push({ key: `upload:${u.clientId}`, kind: "invoice_upload", system: u.vms, detail: u.name, lastUsedAt: iso(last?.at), uses: last?.n ?? 0, status: "ready", href: `/clients/${u.clientId}` });
  }

  const inUse = {
    payroll: target?.format ?? null,
    recruiting: connected.filter((c) => c.kind === "recruiting").map((c) => c.system as Source),
    time: timeSources,
  };
  // The partner packages (slice w): each opens its Money page, with when one was last recorded.
  const lastHandoff = await tx.select({ kind: s.partnerHandoffs.kind, at: max(s.partnerHandoffs.createdAt), n: sql<number>`count(*)::int` }).from(s.partnerHandoffs).groupBy(s.partnerHandoffs.kind);
  const partners = PARTNER_HANDOFFS.map((key) => {
    const r = lastHandoff.find((x) => x.kind === HANDOFF_OF[key]);
    return { key, href: MONEY_PAGE[key], lastUsedAt: iso(r?.at), uses: r?.n ?? 0 };
  });
  return { connected, inUse, payrollFormats: [...EXPORT_FORMATS], sources: [...SOURCES], timeProfiles: BUILT_IN_PROFILES.map((p) => ({ key: p.key, vms: p.kind === "vms" })), partners };
}

const HANDOFF_OF: Record<PartnerHandoff, s.HandoffKind> = { embedded_payroll: "payroll", wage_access: "wage_access", invoice_funding: "funding", insurance: "insurance" };
const MONEY_PAGE: Record<PartnerHandoff, string> = { embedded_payroll: "/money/payroll", wage_access: "/money/wage-access", invoice_funding: "/money/funding", insurance: "/money/insurance" };
export type ConnectionsView = Awaited<ReturnType<typeof connectionsView>>;
