/** What a server action may read about its own request: where the page was opened, and who sent it. */
import { headers } from "next/headers";
import { env } from "./env";
import { senderFrom } from "./sender";

/** "http://localhost:3000" — used for links only in demo mode (see linkBaseUrl in services.ts). */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The sender's internet address (as the app's own proxy recorded it) and browser, kept with an approval. */
export async function requestSender(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  return senderFrom(await headers(), env.trustedProxyHops);
}
