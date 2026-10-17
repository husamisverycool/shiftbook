/**
 * Live only: an `email.received` event names the email; its body and files come from Resend's
 * Receiving API (docs/research/forwarding-email-slice-y.md §1: the webhook carries metadata only).
 * Plain fetch, as decision 0012 sends. Files download from the signed URLs Resend returns — only from
 * Resend's own hosts over https (no request goes anywhere a payload names) — with a hard size cap.
 */
import { readCapped } from "../billing/body";
import type { IncomingEmail, IncomingFile } from "./service";

const API = "https://api.resend.com";
const TIMEOUT_MS = 20_000;

export interface ReceivedEvent {
  type: string;
  data?: { email_id?: unknown; to?: unknown; received_for?: unknown };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : []);

/** The recipients an event names (to, and the addresses it was forwarded for). */
export const recipientsOf = (event: ReceivedEvent): string[] => [...strings(event.data?.to), ...strings(event.data?.received_for)];

/** A download from Resend's own hosts, https only. */
export function resendHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "resend.com" || u.hostname.endsWith(".resend.com") || u.hostname.endsWith(".resend.app"));
  } catch {
    return false;
  }
}

async function getJson(path: string, apiKey: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Resend answered ${res.status} for a received email.`);
  return (await res.json()) as Record<string, unknown>;
}

/** The received email, ready for `receiveInboundEmail`. */
export async function fetchReceivedEmail(emailId: string, apiKey: string): Promise<IncomingEmail> {
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) throw new Error("Not a received email id.");
  const email = await getJson(`/emails/receiving/${emailId}`, apiKey);
  const list = await getJson(`/emails/receiving/${emailId}/attachments`, apiKey);
  const items = Array.isArray(list.data) ? (list.data as Record<string, unknown>[]) : [];
  const files: IncomingFile[] = items.slice(0, 50).map((a) => ({
    filename: typeof a.filename === "string" ? a.filename : "attachment",
    size: typeof a.size === "number" ? a.size : null,
    inline: a.content_disposition === "inline",
    read: async (cap: number) => {
      const url = typeof a.download_url === "string" ? a.download_url : "";
      if (!resendHost(url)) return null;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
      if (!res.ok) throw new Error(`An attachment could not be downloaded (${res.status}).`);
      const body = await readCapped(res.body, cap);
      return body.ok ? body.bytes : null;
    },
  }));
  const auth = (email.authentication ?? null) as { dmarc?: string } | null;
  return {
    providerEmailId: emailId,
    from: typeof email.from === "string" ? email.from : "",
    to: [...strings(email.to), ...strings(email.received_for)],
    subject: typeof email.subject === "string" ? email.subject : "",
    text: typeof email.text === "string" ? email.text : "",
    receivedAt: typeof email.created_at === "string" && !Number.isNaN(Date.parse(email.created_at)) ? new Date(email.created_at) : new Date(),
    authentication: auth && typeof auth === "object" ? { dmarc: typeof auth.dmarc === "string" ? auth.dmarc : null } : null,
    files,
    demo: false,
  };
}
