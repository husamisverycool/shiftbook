/**
 * Worker sign-in by text message (slice t; docs/patterns/w/sign-in.md): the emailed-code machinery of
 * decision 0033 with a mobile number in place of the email — six digits, an HMAC under a key derived
 * from the app key and bound to the row, 10 minutes, once, five wrong tries end a code (NIST SP
 * 800-63B §5.1.3). The number is found by its keyed digest; the code tables have no agency (a number
 * may be at several agencies) and are visible only in sign-in mode.
 *
 * Throttles, in the agency sign-in's table (keyed digests): codes per number (one a minute, five an
 * hour), requests and wrong codes per address, wrong codes per number. Every answer to a request is
 * the same, on file or not, so the page tells nothing about who works where.
 */
import { hkdfSync, randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { auditBy } from "../audit";
import { appKey, digest, randomToken } from "../auth/crypto";
import { codeMatches, EMAIL_CODE_TTL_MS, emailCodeState, hashEmailCode, newEmailCode } from "../auth/email-code";
import { enterAgency, withAuth, type AuthDeps } from "../auth/service";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import { phoneIndex, readPhone } from "./phone";
import { deliverSms, recordSms, type OutgoingSms, type SmsTransport } from "./sms";

export const WORKER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_MS = 14 * 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const CODES_PER_HOUR = 5;
const REQUESTS_PER_ADDRESS_HOUR = 20;
const WRONG_PER_NUMBER_15MIN = 10;
const WRONG_PER_ADDRESS_15MIN = 50;
const CHOICE_MS = 10 * MINUTE;

export interface WorkerAuthDeps {
  db: Db;
  sms: SmsTransport;
  now?: () => Date;
}
const nowOf = (d: WorkerAuthDeps) => (d.now ? d.now() : new Date());
/** Sign-in mode needs only the database here (the worker app sends no email). */
const authOf = (db: Db): AuthDeps => ({
  db,
  mailTransport: () => {
    throw new Error("The worker app sends no email.");
  },
});

/** The codes' own key (never the app key, nor the emailed codes' key). */
const codeKey = () => Buffer.from(hkdfSync("sha256", appKey(), "shiftbook", "worker sign-in code", 32));

const key = (kind: string, value: string) => digest(`worker-${kind}|${value}`);

async function countSince(tx: Tx, keyHash: string, sinceMs: number, now: Date): Promise<number> {
  const [r] = await tx
    .select({ n: count() })
    .from(s.signInFailures)
    .where(and(eq(s.signInFailures.keyHash, keyHash), gt(s.signInFailures.at, new Date(now.getTime() - sinceMs))));
  return r?.n ?? 0;
}
const note = (tx: Tx, keyHash: string, now: Date) => tx.insert(s.signInFailures).values({ keyHash, at: now });

interface Candidate {
  agencyId: string;
  workerId: string;
  agencyName: string;
}
async function candidatesOf(tx: Tx, index: string): Promise<Candidate[]> {
  const rows = await tx.execute<{ agency_id: string; worker_id: string; agency_name: string }>(sql`select * from worker_sign_in_candidates(${index})`);
  return rows.map((r) => ({ agencyId: r.agency_id, workerId: r.worker_id, agencyName: r.agency_name }));
}

export type CodeText = (code: string) => string;

/**
 * A code for this number, texted when the number belongs to an active worker; the same answer either
 * way ("invalid" only for what is not a US mobile number; "throttled" for too many requests from one
 * place).
 */
export async function requestWorkerCode(deps: WorkerAuthDeps, phoneText: string, text: CodeText, address: string | null): Promise<{ ok: true; phone: string } | { ok: false; error: "invalid" | "throttled" }> {
  const phone = readPhone(phoneText);
  if (!phone) return { ok: false, error: "invalid" };
  const now = nowOf(deps);
  const index = phoneIndex(phone, appKey());
  const pending = await withAuth(authOf(deps.db), async (tx): Promise<{ agencyId: string; sms: OutgoingSms } | "throttled" | null> => {
    if (address) {
      const k = key("request-address", address);
      if ((await countSince(tx, k, HOUR, now)) >= REQUESTS_PER_ADDRESS_HOUR) return "throttled";
      await note(tx, k, now);
    }
    // At most one code a minute and five an hour per number, sent or not (nothing to learn from timing).
    const [recent] = await tx
      .select({
        minute: sql<number>`count(*) filter (where ${s.workerSignInCodes.createdAt} > ${new Date(now.getTime() - MINUTE).toISOString()}::timestamptz)::int`,
        hour: sql<number>`count(*)::int`,
      })
      .from(s.workerSignInCodes)
      .where(and(eq(s.workerSignInCodes.phoneIndex, index), gt(s.workerSignInCodes.createdAt, new Date(now.getTime() - HOUR))));
    if ((recent?.minute ?? 0) > 0 || (recent?.hour ?? 0) >= CODES_PER_HOUR) return null;
    const candidates = await candidatesOf(tx, index);
    if (candidates.length === 0) return null;
    // A new code replaces any open one for the number.
    await tx.update(s.workerSignInCodes).set({ usedAt: now }).where(and(eq(s.workerSignInCodes.phoneIndex, index), isNull(s.workerSignInCodes.usedAt)));
    const id = randomUUID();
    const code = newEmailCode();
    await tx.insert(s.workerSignInCodes).values({ id, phoneIndex: index, codeHash: hashEmailCode(codeKey(), id, code), createdAt: now, expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS) });
    // The text goes out under the first agency's name; its log keeps the text without the code.
    const first = candidates[0]!;
    await enterAgency(tx, first.agencyId);
    const body = text(code);
    const sms = await recordSms(tx, { agencyId: first.agencyId, kind: "sign_in_code", to: phone, workerId: first.workerId, text: body, kept: body.split(code).join("[code hidden]") });
    return { agencyId: first.agencyId, sms };
  });
  if (pending === "throttled") return { ok: false, error: "throttled" };
  if (pending) await deliverSms(deps.db, deps.sms, pending.agencyId, pending.sms);
  return { ok: true, phone };
}

export type VerifyResult =
  | { ok: true; kind: "session"; token: string; agencyId: string; workerId: string }
  | { ok: true; kind: "choose"; choice: string; agencies: { workerId: string; agencyName: string }[] }
  | { ok: false; error: "invalid" | "expired" | "throttled" };

/**
 * The code typed for the number. A number at one agency signs in at once; at several, the agencies
 * are listed to choose from, with a one-time choice token (10 minutes).
 */
export async function verifyWorkerCode(deps: WorkerAuthDeps, phoneText: string, typed: string, userAgent: string | null, address: string | null): Promise<VerifyResult> {
  const phone = readPhone(phoneText);
  if (!phone) return { ok: false, error: "invalid" };
  const now = nowOf(deps);
  const index = phoneIndex(phone, appKey());
  const numberKey = key("wrong-number", index);
  const addressKey = address ? key("wrong-address", address) : null;
  return withAuth(authOf(deps.db), async (tx): Promise<VerifyResult> => {
    if ((await countSince(tx, numberKey, 15 * MINUTE, now)) >= WRONG_PER_NUMBER_15MIN) return { ok: false, error: "throttled" };
    if (addressKey && (await countSince(tx, addressKey, 15 * MINUTE, now)) >= WRONG_PER_ADDRESS_15MIN) return { ok: false, error: "throttled" };
    const [row] = await tx.select().from(s.workerSignInCodes).where(and(eq(s.workerSignInCodes.phoneIndex, index), isNull(s.workerSignInCodes.usedAt))).orderBy(desc(s.workerSignInCodes.createdAt)).limit(1).for("update");
    const state = row ? emailCodeState(row, now) : "expired";
    if (!row || state !== "open" || !codeMatches(codeKey(), row.id, row.codeHash, typed)) {
      if (row && state === "open") await tx.update(s.workerSignInCodes).set({ failures: row.failures + 1 }).where(eq(s.workerSignInCodes.id, row.id));
      await note(tx, numberKey, now);
      if (addressKey) await note(tx, addressKey, now);
      return { ok: false, error: row && state !== "open" ? "expired" : "invalid" };
    }
    const candidates = await candidatesOf(tx, index);
    if (candidates.length === 0) {
      await tx.update(s.workerSignInCodes).set({ usedAt: now }).where(eq(s.workerSignInCodes.id, row.id));
      return { ok: false, error: "invalid" };
    }
    if (candidates.length === 1) {
      await tx.update(s.workerSignInCodes).set({ usedAt: now }).where(eq(s.workerSignInCodes.id, row.id));
      const c = candidates[0]!;
      const token = await startWorkerSession(tx, c, { demo: false, userAgent, now });
      return { ok: true, kind: "session", token, agencyId: c.agencyId, workerId: c.workerId };
    }
    const choice = randomToken();
    await tx.update(s.workerSignInCodes).set({ usedAt: now, choiceHash: digest(choice), choiceExpiresAt: new Date(now.getTime() + CHOICE_MS) }).where(eq(s.workerSignInCodes.id, row.id));
    return { ok: true, kind: "choose", choice, agencies: candidates.map((c) => ({ workerId: c.workerId, agencyName: c.agencyName })) };
  });
}

/** After a right code for a number at several agencies: the agency chosen (once, within 10 minutes). */
export async function chooseWorkerAgency(deps: WorkerAuthDeps, choice: string, workerId: string, userAgent: string | null): Promise<{ ok: true; token: string; agencyId: string; workerId: string } | { ok: false }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(choice)) return { ok: false };
  const now = nowOf(deps);
  return withAuth(authOf(deps.db), async (tx) => {
    const [row] = await tx.select().from(s.workerSignInCodes).where(eq(s.workerSignInCodes.choiceHash, digest(choice))).for("update");
    if (!row || !row.choiceExpiresAt || row.choiceExpiresAt <= now) return { ok: false as const };
    const c = (await candidatesOf(tx, row.phoneIndex)).find((x) => x.workerId === workerId);
    if (!c) return { ok: false as const };
    await tx.update(s.workerSignInCodes).set({ choiceHash: null, choiceExpiresAt: null }).where(eq(s.workerSignInCodes.id, row.id));
    const token = await startWorkerSession(tx, c, { demo: false, userAgent, now });
    return { ok: true as const, token, agencyId: c.agencyId, workerId: c.workerId };
  });
}

async function startWorkerSession(tx: Tx, c: { agencyId: string; workerId: string }, opts: { demo: boolean; userAgent: string | null; now: Date }): Promise<string> {
  await enterAgency(tx, c.agencyId);
  const token = randomToken();
  await tx.insert(s.workerSessions).values({ agencyId: c.agencyId, workerId: c.workerId, tokenHash: digest(token), demo: opts.demo, createdAt: opts.now, lastSeenAt: opts.now, expiresAt: new Date(opts.now.getTime() + WORKER_SESSION_MS), userAgent: opts.userAgent?.slice(0, 400) ?? null });
  const [w] = await tx.select({ firstName: s.workers.firstName, lastName: s.workers.lastName }).from(s.workers).where(eq(s.workers.id, c.workerId));
  await auditBy(tx, { agencyId: c.agencyId, userId: null, label: workerLabel(w, opts.demo) }, [{ action: "sign_in", entityType: "worker", entityId: c.workerId, after: { app: "worker", method: opts.demo ? "demo" : "text_code" } }]);
  return token;
}

/** How a worker appears in the activity log: their name, marked as the worker app (and the demo). */
export const workerLabel = (w: { firstName: string; lastName: string } | undefined, demo: boolean) => `${w ? `${w.firstName} ${w.lastName}` : "Worker"} (worker app${demo ? ", demo" : ""})`;

export interface WorkerSession {
  sessionId: string;
  agencyId: string;
  workerId: string;
  demo: boolean;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  label: string;
}

/** The session a worker's cookie names, still valid, its worker active (and a demo session only in a demo agency). */
export async function readWorkerSession(deps: Pick<WorkerAuthDeps, "db" | "now">, token: string | undefined): Promise<WorkerSession | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = nowOf(deps as WorkerAuthDeps);
  return withAuth(authOf(deps.db), async (tx) => {
    const [row] = await tx
      .select()
      .from(s.workerSessions)
      .where(and(eq(s.workerSessions.tokenHash, digest(token)), isNull(s.workerSessions.endedAt), gt(s.workerSessions.expiresAt, now), gt(s.workerSessions.lastSeenAt, new Date(now.getTime() - IDLE_MS))));
    if (!row) return null;
    await enterAgency(tx, row.agencyId);
    if (row.demo) {
      const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, row.agencyId));
      if (!agency?.isDemo) return null;
    }
    const [w] = await tx.select().from(s.workers).where(eq(s.workers.id, row.workerId));
    if (!w || w.status !== "active") return null;
    if (now.getTime() - row.lastSeenAt.getTime() > 5 * MINUTE) await tx.update(s.workerSessions).set({ lastSeenAt: now }).where(eq(s.workerSessions.id, row.id));
    return { sessionId: row.id, agencyId: row.agencyId, workerId: w.id, demo: row.demo, firstName: w.firstName, lastName: w.lastName, preferredLanguage: w.preferredLanguage, label: workerLabel(w, row.demo) };
  });
}

export async function endWorkerSession(deps: Pick<WorkerAuthDeps, "db" | "now">, token: string | undefined): Promise<void> {
  if (!token) return;
  const now = nowOf(deps as WorkerAuthDeps);
  await withAuth(authOf(deps.db), async (tx) => {
    const [row] = await tx.update(s.workerSessions).set({ endedAt: now }).where(and(eq(s.workerSessions.tokenHash, digest(token)), isNull(s.workerSessions.endedAt))).returning();
    if (!row) return;
    await enterAgency(tx, row.agencyId);
    await auditBy(tx, { agencyId: row.agencyId, userId: null, label: workerLabel(undefined, row.demo) }, [{ action: "sign_out", entityType: "worker", entityId: row.workerId, after: { app: "worker" } }]);
  });
}

/** Demo mode's "Continue as" for a demo worker (the demo has no phones). */
export async function demoWorkerSignIn(deps: Pick<WorkerAuthDeps, "db" | "now">, agencyId: string, workerId: string, userAgent: string | null): Promise<{ ok: true; token: string } | { ok: false }> {
  const now = nowOf(deps as WorkerAuthDeps);
  return withAuth(authOf(deps.db), async (tx) => {
    await enterAgency(tx, agencyId);
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, agencyId));
    const [w] = await tx.select({ id: s.workers.id, status: s.workers.status }).from(s.workers).where(eq(s.workers.id, workerId));
    if (!agency?.isDemo || !w || w.status !== "active") return { ok: false as const };
    return { ok: true as const, token: await startWorkerSession(tx, { agencyId, workerId }, { demo: true, userAgent, now }) };
  });
}

/** Demo only: the latest sign-in text the demo kept for this number (the sign-in page shows it, as the demo mailbox does). */
export async function demoCodeText(deps: Pick<WorkerAuthDeps, "db">, agencyId: string, phoneText: string): Promise<string | null> {
  const phone = readPhone(phoneText);
  if (!phone) return null;
  return withAuth(authOf(deps.db), async (tx) => {
    await enterAgency(tx, agencyId);
    const [agency] = await tx.select({ isDemo: s.agencies.isDemo }).from(s.agencies).where(eq(s.agencies.id, agencyId));
    if (!agency?.isDemo) return null;
    const [row] = await tx.select({ demoBody: s.smsMessages.demoBody }).from(s.smsMessages).where(and(eq(s.smsMessages.kind, "sign_in_code"), eq(s.smsMessages.toPhone, phone))).orderBy(desc(s.smsMessages.createdAt)).limit(1);
    return row?.demoBody ?? null;
  });
}
