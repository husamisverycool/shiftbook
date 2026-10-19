/**
 * Timesheets by email (SPEC §6; decision 0042). An email to the agency's forwarding address is
 * recorded once (by the provider's id), its sender checked against the agency's list (Ramp's receipt
 * forwarding), and each file taken through the same intake as an upload (`receiveDocument`) into the
 * week that just ended. A week whose files are already made holds them for a person to file into an
 * open week; files Tabulado does not read are listed with why. Never creates a worker; reading,
 * redaction and review are the upload's own (the body is kept with SSN- and date-shaped text removed).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Weekday } from "@shiftbook/rules";
import { auditBy } from "../audit";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import { classifyUpload, receiveDocument } from "../intake/service";
import { MAX_UPLOAD_BYTES } from "../intake/upload";
import { PeriodLockedError, periodState } from "../run/period-lock";
import { agencyToday, settingOn } from "../settings";
import type { DocumentStore } from "../storage";
import { periodFor } from "../worker-app/service";
import { redactForModel } from "../worker-app/translate";
import { addressOf, emailOf, newInboundToken, tokenFromRecipients } from "./address";
import { MAX_SENDERS, normalizeSender, senderAllowed, type Authentication } from "./senders";
import { forwardedWeek } from "./week";

/** At most this many files are taken from one email, and this many bytes in all. */
export const MAX_FILES = 10;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
/** Inline pictures smaller than this are signature logos, not timesheets: passed over. */
export const INLINE_IMAGE_SKIP_BYTES = 50 * 1024;
export const MAX_BODY_CHARS = 20_000;

export interface IncomingFile {
  filename: string;
  /** As the provider states it; the bytes read are checked again. */
  size: number | null;
  inline: boolean;
  /** The file's bytes, read with the cap; null when it is larger than the cap. */
  read: (cap: number) => Promise<Uint8Array | null>;
}

export interface IncomingEmail {
  providerEmailId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  receivedAt: Date;
  authentication: Authentication;
  files: IncomingFile[];
  demo: boolean;
}

export interface InboundDeps {
  db: Db;
  withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  store: DocumentStore;
  /** The inbound domain (INBOUND_EMAIL_DOMAIN); the address is timesheets+<token>@ it. */
  domain: string;
}

export type InboundResult =
  | { status: "no_address" }
  | { status: "duplicate"; emailId: string }
  | { status: s.InboundStatus; emailId: string; filed: number; held: number; refused: number; payPeriodId: string | null };

/** The agency an address belongs to: the one lookup that crosses agencies (an exact token match). */
export async function agencyOfToken(db: Db, token: string): Promise<string | null> {
  if (!/^[a-z2-7]{20}$/.test(token)) return null;
  const rows = await db.execute<{ agency_id: string }>(sql`select agency_id from inbound_address_lookup(${token})`);
  return rows[0]?.agency_id ?? null;
}

const isImage = (name: string) => classifyUpload(name)?.kind === "image";
/** A file name kept as text only: no path, no control characters, at most 200 characters. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const plain = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(-200);
  return plain.replace(/^\.+/, "") || "attachment";
}

export async function receiveInboundEmail(deps: InboundDeps, mail: IncomingEmail): Promise<InboundResult> {
  const token = tokenFromRecipients(mail.to, deps.domain);
  const agencyId = token ? await agencyOfToken(deps.db, token) : null;
  if (!agencyId) return { status: "no_address" };

  const before = await deps.withAgency(agencyId, async (tx) => {
    const [seen] = await tx.select({ id: s.inboundEmails.id }).from(s.inboundEmails).where(eq(s.inboundEmails.providerEmailId, mail.providerEmailId));
    const [address] = await tx.select().from(s.inboundAddresses);
    return { seen: seen?.id ?? null, senders: address?.token === token ? address.allowedSenders : null };
  });
  if (before.seen) return { status: "duplicate", emailId: before.seen };
  // The address was changed since the email was sent: as if it had none.
  if (before.senders === null) return { status: "no_address" };

  const from = emailOf(mail.from) ?? mail.from.slice(0, 254);
  const allowed = senderAllowed(before.senders, mail.from, mail.authentication);

  // The files, read before any transaction opens (no download holds a database connection).
  type Taken = { filename: string; size: number; outcome: s.InboundOutcome; bytes?: Uint8Array };
  const taken: Taken[] = [];
  if (allowed) {
    let total = 0;
    let count = 0;
    for (const f of mail.files) {
      const filename = cleanFilename(f.filename);
      if (f.inline && isImage(filename) && (f.size ?? 0) < INLINE_IMAGE_SKIP_BYTES) continue;
      const size = f.size ?? 0;
      if (!classifyUpload(filename)) taken.push({ filename, size, outcome: "unsupported" });
      else if (count >= MAX_FILES) taken.push({ filename, size, outcome: "too_many" });
      else if (size > MAX_UPLOAD_BYTES || total + size > MAX_TOTAL_BYTES) taken.push({ filename, size, outcome: "too_large" });
      else {
        const bytes = await f.read(Math.min(MAX_UPLOAD_BYTES, MAX_TOTAL_BYTES - total));
        if (!bytes) taken.push({ filename, size, outcome: "too_large" });
        else {
          total += bytes.byteLength;
          count += 1;
          taken.push({ filename, size: bytes.byteLength, outcome: "filed", bytes });
        }
      }
    }
  }
  const files = taken.filter((t) => t.bytes);
  const refusedCount = taken.length - files.length;

  return deps.withAgency(agencyId, async (tx) => {
    const status: s.InboundStatus = !allowed || files.length === 0 ? "refused" : "filed";
    const [email] = await tx
      .insert(s.inboundEmails)
      .values({
        agencyId,
        providerEmailId: mail.providerEmailId,
        fromAddress: from,
        subject: mail.subject.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300),
        bodyText: redactForModel(mail.text.slice(0, MAX_BODY_CHARS * 2)).slice(0, MAX_BODY_CHARS),
        receivedAt: mail.receivedAt,
        status,
        refusedReason: !allowed ? "sender_not_allowed" : files.length === 0 ? "no_files" : null,
        demo: mail.demo,
      })
      .onConflictDoNothing()
      .returning({ id: s.inboundEmails.id });
    if (!email) {
      const [seen] = await tx.select({ id: s.inboundEmails.id }).from(s.inboundEmails).where(eq(s.inboundEmails.providerEmailId, mail.providerEmailId));
      return { status: "duplicate" as const, emailId: seen?.id ?? "" };
    }
    const who = { agencyId, userId: null, label: `${from} (email)` };

    let payPeriodId: string | null = null;
    let open = false;
    if (files.length > 0) {
      const arrivedOn = await agencyToday(tx, mail.receivedAt);
      const startsOn = await settingOn<number>(tx, "workweek_starts_on", arrivedOn);
      const period = await periodFor(tx, agencyId, forwardedWeek(arrivedOn, (typeof startsOn === "number" ? startsOn : 1) as Weekday));
      payPeriodId = period?.id ?? null;
      open = payPeriodId !== null && (await periodState(tx, payPeriodId)) === "open";
    }
    const rows: (typeof s.inboundAttachments.$inferInsert)[] = [];
    let n = 0;
    for (const t of taken) {
      n += 1;
      if (!t.bytes) {
        rows.push({ agencyId, emailId: email.id, filename: t.filename, byteSize: t.size, outcome: t.outcome });
        continue;
      }
      if (open && payPeriodId) {
        try {
          const r = await receiveDocument(tx, who, deps.store, { payPeriodId, filename: t.filename, bytes: t.bytes, receivedVia: "email" });
          rows.push({ agencyId, emailId: email.id, filename: t.filename, byteSize: t.size, outcome: r.duplicate ? "duplicate" : "filed", documentId: r.documentId, filedAt: new Date() });
          continue;
        } catch (error) {
          if (!(error instanceof PeriodLockedError)) throw error;
          open = false;
        }
      }
      const storageKey = `${agencyId}/inbound/${email.id}/${n}`;
      await deps.store.put(storageKey, t.bytes);
      rows.push({ agencyId, emailId: email.id, filename: t.filename, byteSize: t.size, storageKey, outcome: "held" });
    }
    if (rows.length > 0) await tx.insert(s.inboundAttachments).values(rows);
    const held = rows.filter((r) => r.outcome === "held").length;
    const filed = rows.filter((r) => r.outcome === "filed" || r.outcome === "duplicate").length;
    const finalStatus: s.InboundStatus = status === "refused" ? "refused" : held > 0 ? "held" : "filed";
    await tx
      .update(s.inboundEmails)
      .set({ status: finalStatus, payPeriodId: finalStatus === "filed" ? payPeriodId : null })
      .where(eq(s.inboundEmails.id, email.id));
    await auditBy(tx, who, [
      { action: "create", entityType: "inbound_email", entityId: email.id, after: { from, subject: mail.subject.slice(0, 300), status: finalStatus, files: rows.map((r) => ({ name: r.filename, outcome: r.outcome })) } },
    ]);
    return { status: finalStatus, emailId: email.id, filed, held, refused: refusedCount, payPeriodId: finalStatus === "filed" ? payPeriodId : null };
  });
}

/** A held email's files, filed by a person into an open week (the upload's own rules apply). */
export async function fileHeldEmail(
  tx: Tx,
  actor: { agencyId: string; userId: string; label: string },
  store: DocumentStore,
  emailId: string,
  payPeriodId: string,
): Promise<{ ok: true; filed: number } | { ok: false; error: "not_found" | "not_held" }> {
  const [email] = await tx.select().from(s.inboundEmails).where(eq(s.inboundEmails.id, emailId)).for("update");
  if (!email) return { ok: false, error: "not_found" };
  if (email.status !== "held") return { ok: false, error: "not_held" };
  const held = await tx.select().from(s.inboundAttachments).where(and(eq(s.inboundAttachments.emailId, emailId), eq(s.inboundAttachments.outcome, "held")));
  let filed = 0;
  for (const a of held) {
    const bytes = await store.get(a.storageKey!);
    const r = await receiveDocument(tx, actor, store, { payPeriodId, filename: a.filename, bytes, receivedVia: "email" });
    await tx.update(s.inboundAttachments).set({ outcome: r.duplicate ? "duplicate" : "filed", documentId: r.documentId, filedAt: new Date() }).where(eq(s.inboundAttachments.id, a.id));
    filed += 1;
  }
  await tx.update(s.inboundEmails).set({ status: "filed", payPeriodId }).where(eq(s.inboundEmails.id, emailId));
  await auditBy(tx, actor, [{ action: "update", entityType: "inbound_email", entityId: emailId, before: { status: "held" }, after: { status: "filed", payPeriodId, files: filed } }]);
  return { ok: true, filed };
}

// ---------- the address ----------

/** The agency's address row, made the first time it is asked for. */
export async function ensureAddress(tx: Tx, agencyId: string): Promise<s.InboundAddressRow> {
  const [row] = await tx.select().from(s.inboundAddresses);
  if (row) return row;
  await tx.insert(s.inboundAddresses).values({ agencyId, token: newInboundToken() }).onConflictDoNothing();
  const [made] = await tx.select().from(s.inboundAddresses);
  return made!;
}

/** A new address; the old one stops working at once (Expensify/Ramp: one address at a time). */
export async function rotateAddress(tx: Tx, actor: { agencyId: string; userId: string; label: string }): Promise<void> {
  await ensureAddress(tx, actor.agencyId);
  await tx.update(s.inboundAddresses).set({ token: newInboundToken(), rotatedAt: new Date(), updatedByLabel: actor.label }).where(eq(s.inboundAddresses.agencyId, actor.agencyId));
  await auditBy(tx, actor, [{ action: "update", entityType: "inbound_address", entityId: actor.agencyId, after: { address: "replaced" } }]);
}

/** The senders the address accepts; an empty list accepts anyone who has it. */
export async function setAllowedSenders(
  tx: Tx,
  actor: { agencyId: string; userId: string; label: string },
  input: string[],
): Promise<{ ok: true; senders: string[] } | { ok: false; error: "invalid"; value: string } | { ok: false; error: "too_many" }> {
  const senders: string[] = [];
  for (const raw of input) {
    if (raw.trim() === "") continue;
    const v = normalizeSender(raw);
    if (!v) return { ok: false, error: "invalid", value: raw.slice(0, 254) };
    if (!senders.includes(v)) senders.push(v);
  }
  if (senders.length > MAX_SENDERS) return { ok: false, error: "too_many" };
  const before = await ensureAddress(tx, actor.agencyId);
  await tx.update(s.inboundAddresses).set({ allowedSenders: senders, updatedByLabel: actor.label }).where(eq(s.inboundAddresses.agencyId, actor.agencyId));
  await auditBy(tx, actor, [{ action: "update", entityType: "inbound_address", entityId: actor.agencyId, before: { senders: before.allowedSenders }, after: { senders } }]);
  return { ok: true, senders };
}

// ---------- the screens ----------

export interface ForwardingView {
  /** Null when the inbound domain is not set (live without INBOUND_EMAIL_DOMAIN). */
  address: string | null;
  senders: string[];
  emails: {
    id: string;
    from: string;
    subject: string;
    receivedAt: string;
    status: s.InboundStatus;
    refusedReason: s.InboundRefusal | null;
    payPeriodId: string | null;
    files: { filename: string; outcome: s.InboundOutcome }[];
  }[];
}

export async function forwardingView(tx: Tx, agencyId: string, domain: string | null): Promise<ForwardingView> {
  const row = await ensureAddress(tx, agencyId);
  const emails = await tx.select().from(s.inboundEmails).orderBy(desc(s.inboundEmails.receivedAt)).limit(20);
  const files = emails.length > 0 ? await tx.select().from(s.inboundAttachments).where(inArray(s.inboundAttachments.emailId, emails.map((e) => e.id))) : [];
  return {
    address: domain ? addressOf(row.token, domain) : null,
    senders: row.allowedSenders,
    emails: emails.map((e) => ({
      id: e.id,
      from: e.fromAddress,
      subject: e.subject,
      receivedAt: e.receivedAt.toISOString(),
      status: e.status,
      refusedReason: e.refusedReason,
      payPeriodId: e.payPeriodId,
      files: files.filter((f) => f.emailId === e.id).map((f) => ({ filename: f.filename, outcome: f.outcome })),
    })),
  };
}
