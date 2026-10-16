/** What a server action may read about its own request: where the page was opened, and who sent it. */
import { headers } from "next/headers";

/** "http://localhost:3000" — used for links only in demo mode (see linkBaseUrl in services.ts). */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The sender's internet address (the first hop the host recorded) and browser, kept with an approval. */
export async function requestSender(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  return { ipAddress: ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null, userAgent: h.get("user-agent")?.slice(0, 500) ?? null };
}
