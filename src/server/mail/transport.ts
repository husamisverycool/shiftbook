/**
 * How Tabulado sends email (decision 0012). One interface, two implementations:
 * - DemoMailboxTransport: demo mode and tests — the message lands in the agency's demo mailbox
 *   table (no outside calls), the same code path otherwise.
 * - ResendTransport: the live app — Resend's HTTP API with plain fetch.
 */
import type { Tx } from "../db/client";
import * as s from "../db/schema";
import { redactApprovalLinks } from "../approvals/token";

export interface OutgoingMail {
  /** The email_messages row; Resend's idempotency key, so a retried send goes out once. */
  id: string;
  /** The agency's name; sent as "{name} via Tabulado". */
  fromName: string;
  replyTo: string | null;
  to: { email: string; name?: string | null };
  subject: string;
  text: string;
  html: string;
  /** Files carried with the email (slice r: an invoice's PDF, as Stripe's invoice emails carry it). */
  attachments?: { filename: string; content: Uint8Array }[];
}

export interface MailTransport {
  send(mail: OutgoingMail): Promise<{ providerId: string | null }>;
}

export class MailSendError extends Error {
  constructor(message: string) {
    super(redactApprovalLinks(message));
    this.name = "MailSendError";
  }
}

/** A display name that cannot break out of the address (no quotes, backslashes, brackets or line breaks). */
const displayName = (name: string) => name.replace(/["\\<>\r\n]+/g, " ").replace(/\s+/g, " ").trim();
/** "Name" <email>: quoted, so a comma ("Acme Staffing, LLC") or parentheses stay part of the name (RFC 5322). */
const address = (email: string, name?: string | null) => (name && displayName(name) ? `"${displayName(name)}" <${email}>` : email);

export class ResendTransport implements MailTransport {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: { apiKey: string | undefined; fromAddress: string | undefined; fetch?: typeof fetch }) {
    if (!options.apiKey) throw new Error("Email cannot be sent: RESEND_API_KEY is not set in the environment settings.");
    if (!options.fromAddress) throw new Error("Email cannot be sent: MAIL_FROM (Tabulado's sending address) is not set in the environment settings.");
    // The guide writes the setting as `Tabulado <hello@…>`; the agency's name goes in front of the bare address.
    const bare = (/<([^<>\s]+@[^<>\s]+)>/.exec(options.fromAddress)?.[1] ?? options.fromAddress).trim();
    if (!/^[^\s@<>"]+@[^\s@<>"]+$/.test(bare)) throw new Error("Email cannot be sent: MAIL_FROM (Tabulado's sending address) in the environment settings is not an email address.");
    this.apiKey = options.apiKey;
    this.fromAddress = bare;
    this.fetchFn = options.fetch ?? fetch;
  }

  async send(mail: OutgoingMail): Promise<{ providerId: string | null }> {
    const body: Record<string, unknown> = {
      from: address(this.fromAddress, mail.fromName === "Tabulado" ? "Tabulado" : `${mail.fromName} via Tabulado`),
      to: [address(mail.to.email, mail.to.name)],
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) } : {}),
    };
    let response: Response;
    try {
      response = await this.fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": mail.id },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new MailSendError(`Tabulado could not reach the email service (${error instanceof Error ? error.message : String(error)}). Try again in a moment.`);
    }
    const answer = (await response.json().catch(() => ({}))) as { id?: unknown; name?: unknown; message?: unknown };
    if (!response.ok) {
      throw new MailSendError(`The email service refused the message (${response.status} ${String(answer.name ?? "")}: ${String(answer.message ?? "no details")}).`);
    }
    return { providerId: typeof answer.id === "string" ? answer.id : null };
  }
}

/** Demo mode's delivery: the fictional recipient's inbox is a table (decision 0012). */
export class DemoMailboxTransport implements MailTransport {
  constructor(private readonly withAgency: <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>, private readonly agencyId: string) {}

  async send(mail: OutgoingMail): Promise<{ providerId: string | null }> {
    await this.withAgency(this.agencyId, (tx) =>
      tx.insert(s.demoMailbox).values({
        agencyId: this.agencyId,
        emailMessageId: mail.id,
        toEmail: mail.to.email,
        subject: mail.subject,
        textBody: mail.text,
        htmlBody: mail.html,
        attachments: (mail.attachments ?? []).map((a) => ({ filename: a.filename, bytes: a.content.byteLength })),
      }),
    );
    return { providerId: null };
  }
}
