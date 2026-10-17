/**
 * Who may send to the address (Ramp's "Receipt forwarding": the addresses it accepts). No list: anyone
 * who has the address. A list: an exact address or a whole domain ("@domain"); and because a From line
 * can be forged, a listed sender counts only when the receiving server proved it (DMARC pass, from
 * Resend's authentication results, which the sender cannot set).
 */
import { emailOf } from "./address";

export const MAX_SENDERS = 50;

export function normalizeSender(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (v.length === 0 || v.length > 254) return null;
  const domain = /^@?([a-z0-9-]+(\.[a-z0-9-]+)+)$/.exec(v);
  if (domain && !v.includes(" ")) return `@${domain[1]}`;
  const email = emailOf(v);
  return email && /^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email) ? email : null;
}

export type Authentication = { dmarc?: string | null } | null;

export function senderAllowed(list: string[], from: string, authentication: Authentication): boolean {
  if (list.length === 0) return true;
  const email = emailOf(from);
  if (!email || authentication?.dmarc !== "pass") return false;
  const domain = `@${email.split("@")[1]}`;
  return list.includes(email) || list.includes(domain);
}
