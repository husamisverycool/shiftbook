/**
 * Resend's `email.received` webhook: timesheets emailed to an agency's forwarding address (decision
 * 0042). No session: the Svix signature over the raw body is the only way in (INBOUND_EMAIL_SECRET;
 * none set, nothing is taken). Each email is recorded once; an unknown address is answered like any
 * other, so the route tells nothing about which addresses exist. A failure answers 5xx so Resend
 * retries. The demo receives nothing from outside (its test email runs in-process). Nothing about the
 * request is logged.
 */
import { readCapped } from "@/server/billing/body";
import { db, withAgency } from "@/server/db";
import { env } from "@/server/env";
import { tokenFromRecipients } from "@/server/inbound/address";
import { inboundDomain, inboundSecret, resendApiKey } from "@/server/inbound/config";
import { fetchReceivedEmail, recipientsOf, type ReceivedEvent } from "@/server/inbound/resend";
import { agencyOfToken, receiveInboundEmail } from "@/server/inbound/service";
import { verifyWebhook } from "@/server/inbound/signature";
import { documentStore } from "@/server/storage";

export const dynamic = "force-dynamic";

/** The event is metadata only (the body and files are fetched), so it is small. */
const MAX_EVENT_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (env.mode !== "live") return new Response(null, { status: 404 });
  const secret = inboundSecret();
  const domain = inboundDomain();
  const apiKey = resendApiKey();
  if (!secret || !domain || !apiKey) return Response.json({ received: false }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? "0") > MAX_EVENT_BYTES) return Response.json({ received: false }, { status: 413 });
  const body = await readCapped(request.body, MAX_EVENT_BYTES);
  if (!body.ok) return Response.json({ received: false }, { status: 413 });
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body.bytes);
  } catch {
    return Response.json({ received: false }, { status: 400 });
  }
  const header = (name: string) => request.headers.get(`svix-${name}`) ?? request.headers.get(`webhook-${name}`);
  if (!verifyWebhook(secret, { id: header("id"), timestamp: header("timestamp"), signature: header("signature") }, text)) {
    return Response.json({ received: false }, { status: 401 });
  }
  let event: ReceivedEvent;
  try {
    event = JSON.parse(text) as ReceivedEvent;
  } catch {
    return Response.json({ received: false }, { status: 400 });
  }
  if (event?.type !== "email.received" || typeof event.data?.email_id !== "string") return Response.json({ received: true });
  const token = tokenFromRecipients(recipientsOf(event), domain);
  if (!token || !(await agencyOfToken(db, token))) return Response.json({ received: true });
  try {
    const mail = await fetchReceivedEmail(event.data.email_id, apiKey);
    await receiveInboundEmail({ db, withAgency, store: documentStore, domain }, mail);
    return Response.json({ received: true });
  } catch {
    return Response.json({ received: false }, { status: 500 });
  }
}
