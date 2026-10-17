/** What a server action may read about its own request: where the page was opened, and who sent it. */
import { headers } from "next/headers";
import { env } from "./env";
import { senderFrom } from "./sender";

/** A host name (or a bracketed IPv6 address) with an optional port: nothing else is an address. */
const HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*|\[[0-9A-Fa-f:.]+\])(?::(\d{1,5}))?$/;

/**
 * The request's own address from its headers: the scheme from X-Forwarded-Proto only when it says
 * http or https (decision 0033, review H1); null when the Host is not a host.
 */
export function originFrom(h: { get(name: string): string | null }): string | null {
  const host = h.get("host");
  const match = host ? HOST.exec(host) : null;
  if (!host || !match || (match[1] !== undefined && Number(match[1]) > 65535)) return null;
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

/** "http://localhost:3000" — used for links only in demo mode (see linkBaseUrl in services.ts); never for a server-side call. */
export async function requestOrigin(): Promise<string | null> {
  return originFrom(await headers());
}

/** The sender's internet address (as the app's own proxy recorded it) and browser, kept with an approval. */
export async function requestSender(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  return senderFrom(await headers(), env.trustedProxyHops);
}
