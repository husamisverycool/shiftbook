/**
 * Notifications (slice r; docs/patterns/notifications.md and settings/notifications.md — Linear's
 * Inbox and notification settings). A sweep reads the agency's state, decides the notices
 * (`rules.ts`) and records one per person per event; a person's inbox always gets them, and email is
 * a channel each person switches per kind. The sweep runs when someone opens the app (at most once a
 * minute per agency) and on the host's schedule.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { formatCents } from "@shiftbook/rules";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { assemble } from "../approvals/emails";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import type { MailTransport } from "../mail/transport";
import { can, type Role } from "../permissions";
import { invoiceBalances } from "../receivables/balances";
import { agencyToday } from "../settings";
import { noticesFrom, recipientsOf, type NotificationFacts, type Notice } from "./rules";

const DAY_MS = 86_400_000;
/** A client's decision older than this is history, not news (the first sweep never floods the inbox). */
export const DECISIONS_WITHIN_DAYS = 14;
/** Linear keeps up to 2,000 open notifications; the inbox page shows the newest of them. */
export const INBOX_LIMIT = 2_000;

type People = { id: string; role: Role; status: string; email: string; name: string; preferredLocale: string }[];

export async function gatherFacts(tx: Tx, today: string, now: Date): Promise<NotificationFacts> {
  const since = new Date(now.getTime() - DECISIONS_WITHIN_DAYS * DAY_MS);
  const decisions = await tx
    .select({ id: s.approvalDecisions.id, requestId: s.approvalDecisions.requestId, clientName: s.clients.name, periodStart: s.payPeriods.startsOn, periodEnd: s.payPeriods.endsOn, disputed: sql<number>`jsonb_array_length(${s.approvalDecisions.disputed})` })
    .from(s.approvalDecisions)
    .innerJoin(s.approvalRequests, eq(s.approvalRequests.id, s.approvalDecisions.requestId))
    .innerJoin(s.clients, eq(s.clients.id, s.approvalRequests.clientId))
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.approvalRequests.payPeriodId))
    .where(gte(s.approvalDecisions.decidedAt, since));
  const blockedRuns = await tx
    .select({ id: s.payRuns.id, payPeriodId: s.payRuns.payPeriodId, periodStart: s.payPeriods.startsOn, periodEnd: s.payPeriods.endsOn, blockers: sql<number>`jsonb_array_length(${s.payRuns.blockers})` })
    .from(s.payRuns)
    .innerJoin(s.payPeriods, eq(s.payPeriods.id, s.payRuns.payPeriodId))
    .where(eq(s.payRuns.status, "blocked"));
  const obligations = await tx.select({ id: s.obligations.id, kind: s.obligations.kind, dueOn: s.obligations.dueOn, remindOn: s.obligations.remindOn }).from(s.obligations).where(eq(s.obligations.status, "open"));
  const owed = (await invoiceBalances(tx)).filter((b) => b.invoice.status === "issued" && b.balanceCents > 0);
  const overdueInvoices = owed.filter((b) => b.invoice.dueOn < today).map((b) => ({ id: b.invoice.id, number: b.invoice.number, clientName: b.clientName, dueOn: b.invoice.dueOn, balanceCents: b.balanceCents }));
  const byInvoice = new Map(owed.map((b) => [b.invoice.id, b]));
  const promises = byInvoice.size > 0 ? await tx.select().from(s.promisesToPay).where(inArray(s.promisesToPay.invoiceId, [...byInvoice.keys()])).orderBy(desc(s.promisesToPay.createdAt)) : [];
  const latest = new Map<string, s.PromiseToPayRow>();
  for (const p of promises) if (!latest.has(p.invoiceId)) latest.set(p.invoiceId, p);
  const brokenPromises = [...latest.values()]
    .filter((p) => p.promisedOn < today)
    .map((p) => {
      const b = byInvoice.get(p.invoiceId)!;
      return { id: p.id, invoiceId: p.invoiceId, number: b.invoice.number, clientName: b.clientName, promisedOn: p.promisedOn, balanceCents: b.balanceCents };
    });
  return { decisions: decisions.map((d) => ({ ...d, disputed: Number(d.disputed) })), blockedRuns: blockedRuns.map((r) => ({ ...r, blockers: Number(r.blockers) })), obligations, overdueInvoices, brokenPromises };
}

async function peopleOf(tx: Tx): Promise<People> {
  return tx.select({ id: s.users.id, role: s.users.role, status: s.users.status, email: s.users.email, name: s.users.name, preferredLocale: s.users.preferredLocale }).from(s.users);
}

/** Records the notices the agency's state calls for; returns the ones that are new. */
export async function syncNotifications(tx: Tx, agencyId: string, now: Date = new Date()): Promise<s.NotificationRow[]> {
  const today = await agencyToday(tx, now);
  const notices = noticesFrom(await gatherFacts(tx, today, now), today);
  if (notices.length === 0) return [];
  const people = await peopleOf(tx);
  const rows = notices.flatMap((n: Notice) => recipientsOf(n.ability, people).map((userId) => ({ agencyId, userId, kind: n.kind, dedupeKey: n.dedupeKey, href: n.href, params: n.params, createdAt: now })));
  if (rows.length === 0) return [];
  const made: s.NotificationRow[] = [];
  for (let i = 0; i < rows.length; i += 500) made.push(...(await tx.insert(s.notifications).values(rows.slice(i, i + 500)).onConflictDoNothing().returning()));
  return made;
}

// ---------- the inbox ----------

export interface InboxItem {
  id: string;
  kind: s.NotificationKind;
  href: string;
  params: Record<string, string | number>;
  createdAt: Date;
  read: boolean;
}

export async function inboxOf(tx: Tx, userId: string, opts: { unreadOnly?: boolean } = {}): Promise<InboxItem[]> {
  const rows = await tx
    .select()
    .from(s.notifications)
    .where(and(eq(s.notifications.userId, userId), isNull(s.notifications.deletedAt), ...(opts.unreadOnly ? [isNull(s.notifications.readAt)] : [])))
    .orderBy(desc(s.notifications.createdAt), desc(s.notifications.id))
    .limit(INBOX_LIMIT);
  return rows.map((r) => ({ id: r.id, kind: r.kind, href: r.href, params: r.params, createdAt: r.createdAt, read: r.readAt !== null }));
}

export async function unreadCount(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt), isNull(s.notifications.deletedAt)));
  return row?.n ?? 0;
}

/** Linear's U, Alt+U, Backspace, Shift+Backspace — always one person's own notices. */
export async function markRead(tx: Tx, userId: string, ids: string[], read: boolean, now: Date = new Date()): Promise<void> {
  if (ids.length === 0) return;
  await tx.update(s.notifications).set({ readAt: read ? now : null }).where(and(eq(s.notifications.userId, userId), inArray(s.notifications.id, ids)));
}

export async function markAllRead(tx: Tx, userId: string, now: Date = new Date()): Promise<void> {
  await tx.update(s.notifications).set({ readAt: now }).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt), isNull(s.notifications.deletedAt)));
}

/** Deleted notices stay as rows (marked), so the same event never comes back as new. */
export async function deleteNotices(tx: Tx, userId: string, ids: string[], now: Date = new Date()): Promise<void> {
  if (ids.length === 0) return;
  await tx.update(s.notifications).set({ deletedAt: now }).where(and(eq(s.notifications.userId, userId), inArray(s.notifications.id, ids)));
}

export async function deleteRead(tx: Tx, userId: string, now: Date = new Date()): Promise<void> {
  await tx.update(s.notifications).set({ deletedAt: now }).where(and(eq(s.notifications.userId, userId), isNotNull(s.notifications.readAt), isNull(s.notifications.deletedAt)));
}

// ---------- settings ----------

/** The kinds a role receives (only those are listed on the settings page). */
export function kindsFor(role: Role): s.NotificationKind[] {
  const ability: Record<s.NotificationKind, Parameters<typeof can>[1]> = {
    approval_returned: "hours",
    approval_disputed: "hours",
    run_blocked: "run",
    obligation_due_soon: "compliance",
    obligation_overdue: "compliance",
    invoice_overdue: "cash",
    promise_broken: "cash",
    shift_confirmed: "hours",
  };
  return s.NOTIFICATION_KINDS.filter((k) => can({ role }, ability[k]));
}

/** Email per kind: on unless the person switched it off (Linear sends email notifications by default). */
export async function emailSettingsOf(tx: Tx, userId: string, role: Role): Promise<Record<s.NotificationKind, boolean>> {
  const rows = await tx.select().from(s.notificationSettings).where(eq(s.notificationSettings.userId, userId));
  const off = new Map(rows.map((r) => [r.kind, r.email]));
  return Object.fromEntries(kindsFor(role).map((k) => [k, off.get(k) ?? true])) as Record<s.NotificationKind, boolean>;
}

export async function setEmailSetting(tx: Tx, agencyId: string, userId: string, role: Role, kind: unknown, email: unknown): Promise<{ ok: true } | { ok: false; error: "invalid" }> {
  if (typeof email !== "boolean" || !kindsFor(role).includes(kind as s.NotificationKind)) return { ok: false, error: "invalid" };
  await tx
    .insert(s.notificationSettings)
    .values({ agencyId, userId, kind: kind as s.NotificationKind, email, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [s.notificationSettings.agencyId, s.notificationSettings.userId, s.notificationSettings.kind], set: { email, updatedAt: new Date() } });
  return { ok: true };
}

// ---------- email ----------

const MESSAGES = { en, es } as const;
const localeOf = (v: string): "en" | "es" => (v === "es" ? "es" : "en");
const day = (iso: string, locale: "en" | "es") => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** A notice's sentence in a language: the params turned into words (dates, money, a duty's name). */
export function noticeText(kind: s.NotificationKind, params: Record<string, string | number>, locale: "en" | "es"): { title: string; line: string } {
  const t = createTranslator({ locale, messages: MESSAGES[locale] });
  const str = (k: string) => String(params[k] ?? "");
  const values: Record<string, string | number> = { ...params };
  if (params.start && params.end) values.period = `${day(str("start"), locale)} – ${day(str("end"), locale)}`;
  if (params.dueOn) values.due = day(str("dueOn"), locale);
  if (params.promisedOn) values.promised = day(str("promisedOn"), locale);
  if (typeof params.balanceCents === "number") values.balance = formatCents(params.balanceCents);
  const dutyKey = `compliance.kinds.${str("kind")}` as never;
  if (params.kind) values.duty = t.has(dutyKey) ? t(dutyKey) : str("kind");
  return { title: t(`notify.kinds.${kind}.title` as never), line: t(`notify.kinds.${kind}.line` as never, values as never) };
}

export interface NotifyMailDeps {
  mailTransport: (agencyId: string) => MailTransport;
  baseUrl: string | null;
}

/**
 * Emails the new notices to the people who keep email on for their kind (Linear: "immediate
 * delivery"). Recorded like every email (email_messages); a failure leaves the notice in the inbox.
 */
export async function emailNotices(deps: NotifyMailDeps, withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>, agencyId: string, made: s.NotificationRow[]): Promise<number> {
  if (made.length === 0 || !deps.baseUrl) return 0;
  const prepared = await withAgency(agencyId, async (tx) => {
    const people = new Map((await peopleOf(tx)).map((p) => [p.id, p]));
    const out: { row: s.NotificationRow; mailId: string; to: { email: string; name: string }; rendered: { subject: string; text: string; html: string } }[] = [];
    const settings = new Map<string, Record<string, boolean>>();
    for (const row of made) {
      const person = people.get(row.userId);
      if (!person || person.status !== "active") continue;
      if (!settings.has(person.id)) settings.set(person.id, await emailSettingsOf(tx, person.id, person.role));
      if (!settings.get(person.id)![row.kind]) continue;
      const locale = localeOf(person.preferredLocale);
      const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "notify.email" });
      const text = noticeText(row.kind, row.params, locale);
      const rendered = assemble(text.title, [{ text: text.line }, { link: `${deps.baseUrl}/${locale}${row.href}`, label: t("open") }, { text: t("footer") }]);
      const [mail] = await tx.insert(s.emailMessages).values({ agencyId, kind: "notification", toEmail: person.email, toName: person.name, subject: rendered.subject, textBody: rendered.text, status: "sending" }).returning({ id: s.emailMessages.id });
      await tx.update(s.notifications).set({ emailedAt: new Date() }).where(eq(s.notifications.id, row.id));
      out.push({ row, mailId: mail!.id, to: { email: person.email, name: person.name }, rendered });
    }
    return out;
  });
  let sent = 0;
  for (const p of prepared) {
    try {
      const { providerId } = await deps.mailTransport(agencyId).send({ id: p.mailId, fromName: "Granite", replyTo: null, to: p.to, ...p.rendered });
      await withAgency(agencyId, (tx) => tx.update(s.emailMessages).set({ status: "sent", providerId, sentAt: new Date() }).where(eq(s.emailMessages.id, p.mailId)));
      sent += 1;
    } catch (error) {
      await withAgency(agencyId, (tx) => tx.update(s.emailMessages).set({ status: "failed", error: error instanceof Error ? error.message : String(error) }).where(eq(s.emailMessages.id, p.mailId)));
    }
  }
  return sent;
}

/** Every agency's id (the host's schedule sweeps each; a security-definer function, like decision 0013's). */
export async function agenciesToSweep(db: Db): Promise<string[]> {
  return (await db.execute<{ agency_id: string }>(sql`select agency_id from agencies_to_sweep()`)).map((r) => r.agency_id);
}
