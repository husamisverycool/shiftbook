/**
 * Where the forwarding address lives (decision 0042). Live: INBOUND_EMAIL_DOMAIN (Resend's receiving
 * domain for the agency's mail), INBOUND_EMAIL_SECRET (the webhook's signing secret) and RESEND_API_KEY
 * (to fetch each email's body and files), all in the hosting settings. The demo receives nothing from
 * outside: its address is on a reserved name and its test email runs the same code in-process.
 */
import { env } from "../env";

export const DEMO_INBOUND_DOMAIN = "in.granite.example";

export function inboundDomain(): string | null {
  const configured = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  if (configured && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(configured)) return configured;
  return env.mode === "demo" ? DEMO_INBOUND_DOMAIN : null;
}

export const inboundSecret = (): string | null => process.env.INBOUND_EMAIL_SECRET || null;
export const resendApiKey = (): string | null => process.env.RESEND_API_KEY || null;
