/**
 * How Granite sends text messages (slice t), as email is sent (decision 0012): one interface, two
 * implementations. The demo keeps the whole text in sms_messages.demo_body (its outbox; no outside
 * calls). The live app sends through Twilio's Messages API with plain fetch, when the environment
 * names the account (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM) — set in the cloud
 * environment settings, never in the database. The kept copy of a sign-in text never holds the code.
 */
import { eq, sql } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import * as s from "../db/schema";
import { env } from "../env";

export interface OutgoingSms {
  /** The sms_messages row. */
  id: string;
  to: string;
  text: string;
}

export interface SmsTransport {
  send(sms: OutgoingSms): Promise<{ providerId: string | null }>;
}

export class SmsSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsSendError";
  }
}

export class TwilioTransport implements SmsTransport {
  private readonly sid: string;
  private readonly token: string;
  private readonly from: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { sid: string | undefined; token: string | undefined; from: string | undefined; fetch?: typeof fetch }) {
    if (!options.sid || !/^AC[0-9a-f]{32}$/.test(options.sid)) throw new SmsSendError("Text messages cannot be sent: TWILIO_ACCOUNT_SID is not set in the environment settings.");
    if (!options.token) throw new SmsSendError("Text messages cannot be sent: TWILIO_AUTH_TOKEN is not set in the environment settings.");
    if (!options.from) throw new SmsSendError("Text messages cannot be sent: TWILIO_FROM (the sending number) is not set in the environment settings.");
    this.sid = options.sid;
    this.token = options.token;
    this.from = options.from;
    this.fetchFn = options.fetch ?? fetch;
  }

  async send(sms: OutgoingSms): Promise<{ providerId: string | null }> {
    const body = new URLSearchParams({ To: sms.to, From: this.from, Body: sms.text });
    let response: Response;
    try {
      response = await this.fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (error) {
      throw new SmsSendError(`Granite could not reach the text message service (${error instanceof Error ? error.message : String(error)}).`);
    }
    const answer = (await response.json().catch(() => ({}))) as { sid?: unknown; code?: unknown; message?: unknown };
    if (!response.ok) throw new SmsSendError(`The text message service refused the message (${response.status} ${String(answer.code ?? "")}: ${String(answer.message ?? "no details")}).`);
    return { providerId: typeof answer.sid === "string" ? answer.sid : null };
  }
}

/** The demo's delivery: nothing leaves; the text is already kept in demo_body. */
export class DemoSmsTransport implements SmsTransport {
  async send(): Promise<{ providerId: string | null }> {
    return { providerId: null };
  }
}

export const smsTransport = (): SmsTransport =>
  env.mode === "demo" ? new DemoSmsTransport() : new TwilioTransport({ sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, from: process.env.TWILIO_FROM });

/**
 * Records a text to send: `kept` is what the log keeps (the code hidden); the whole text is kept only
 * in demo mode, for the demo outbox.
 */
export async function recordSms(tx: Tx, row: { agencyId: string; kind: "sign_in_code" | "onboarding_invite" | "phone_changed"; to: string; workerId: string | null; text: string; kept: string }): Promise<OutgoingSms> {
  const [r] = await tx
    .insert(s.smsMessages)
    .values({ agencyId: row.agencyId, kind: row.kind, toPhone: row.to, workerId: row.workerId, body: row.kept, demoBody: env.mode === "demo" ? row.text : null })
    .returning({ id: s.smsMessages.id });
  return { id: r!.id, to: row.to, text: row.text };
}

/** Sends after commit and records the outcome; never throws (the caller answers the same either way). */
export async function deliverSms(db: Db, transport: SmsTransport, agencyId: string, sms: OutgoingSms): Promise<boolean> {
  const mark = (values: Partial<typeof s.smsMessages.$inferInsert>) =>
    db.transaction(async (tx) => {
      await tx.execute(sqlAgency(agencyId));
      await tx.update(s.smsMessages).set(values).where(eq(s.smsMessages.id, sms.id));
    });
  try {
    const { providerId } = await transport.send(sms);
    await mark({ status: "sent", providerId, sentAt: new Date() });
    return true;
  } catch (error) {
    await mark({ status: "failed", error: (error instanceof Error ? error.message : String(error)).replace(/\d{6}/g, "[code hidden]").slice(0, 500) });
    return false;
  }
}

const sqlAgency = (agencyId: string) => sql`select set_config('app.agency_id', ${agencyId}, true)`;
