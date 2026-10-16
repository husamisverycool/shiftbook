/**
 * Who sent a request, as evidence kept with an approval (decision 0013). X-Forwarded-For lists the
 * addresses each proxy saw, oldest first, and a sender can write anything at its start; only the
 * entries the app's own proxies appended can be trusted. With N trusted proxies, the client is the
 * entry N places from the end. With none, the address is unknown (never guessed from the header).
 */
const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/;

export function senderFrom(headers: { get(name: string): string | null }, trustedProxyHops: number): { ipAddress: string | null; userAgent: string | null } {
  const hops = Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 ? trustedProxyHops : 0;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = hops > 0 && chain.length >= hops ? chain[chain.length - hops]! : null;
  return { ipAddress: candidate && ADDRESS.test(candidate) ? candidate : null, userAgent: headers.get("user-agent")?.slice(0, 500) ?? null };
}
