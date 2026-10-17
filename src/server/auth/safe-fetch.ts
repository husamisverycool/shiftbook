/**
 * The only way Shiftbook calls an identity provider (decision 0033, review M2): https on port 443 to a
 * named host, never an IP address, never with credentials in the address. The connection resolves the
 * name itself and refuses it when ANY of its addresses is private, loopback, link-local, shared,
 * documentation, multicast or otherwise reserved — at every connection, so a name that resolves to a
 * public address when an Owner saves it and to an internal one later (DNS rebinding) is refused then
 * too. Answers are capped in size and time; redirects are not followed.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";

export type SafeFetchReason = "not_https" | "port" | "ip_literal" | "credentials" | "private_address" | "too_large" | "timeout" | "network";
export class SafeFetchError extends Error {
  constructor(public readonly reason: SafeFetchReason) {
    super(`Outbound call refused: ${reason}`);
    this.name = "SafeFetchError";
  }
}

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
const systemResolver: Resolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/**
 * Never reached from here: RFC 6890's special-purpose ranges, and IPv6 forms that carry an IPv4
 * address. Two lists: Node's BlockList matches an IPv4 address against IPv4-mapped IPv6 ranges, so a
 * single list holding ::ffff:0:0/96 would block every IPv4 address.
 */
const BLOCKED_V4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  BLOCKED_V4.addSubnet(network, prefix, "ipv4");
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  BLOCKED_V6.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !BLOCKED_V4.check(address, "ipv4");
  if (version !== 6) return false;
  // ::ffff:a.b.c.d (and its hex form) is an IPv4 address in IPv6 dress: never needed for a provider.
  if (/^(0{0,4}:){0,5}:?ffff:/i.test(address) || /^::ffff/i.test(address)) return false;
  return !BLOCKED_V6.check(address, "ipv6");
}

/** The connection's own name lookup: every answer must be public, or none is used. */
export function publicLookup(resolver: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname).then(
      (answers) => {
        if (answers.length === 0 || answers.some((a) => !isPublicAddress(a.address))) {
          callback(new SafeFetchError("private_address") as unknown as NodeJS.ErrnoException, "", 0);
          return;
        }
        if ((options as { all?: boolean }).all) (callback as unknown as (e: null, all: { address: string; family: number }[]) => void)(null, answers.map((a) => ({ address: a.address, family: a.family })));
        else callback(null, answers[0]!.address, answers[0]!.family);
      },
      (error: unknown) => callback(error as NodeJS.ErrnoException, "", 0),
    );
  };
}

/** The whole answer, refused once it passes `max` bytes. */
export function readCapped(stream: Readable, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        stream.destroy();
        reject(new SafeFetchError("too_large"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (error) => reject(error instanceof SafeFetchError ? error : new SafeFetchError("network")));
  });
}

function bodyOf(body: RequestInit["body"]): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  throw new TypeError("safeFetch sends only text bodies.");
}

/** A fetch with the rules above; `resolver` and the caps can be set for tests. */
export function createSafeFetch(opts: { resolver?: Resolver; maxBytes?: number; timeoutMs?: number } = {}): typeof fetch {
  const resolver = opts.resolver ?? systemResolver;
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const safe = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:") throw new SafeFetchError("not_https");
    if (url.username || url.password) throw new SafeFetchError("credentials");
    if (url.port !== "" && url.port !== "443") throw new SafeFetchError("port");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) !== 0) throw new SafeFetchError("ip_literal");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = bodyOf(init?.body);
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const request = https.request({ hostname: host, servername: host, port: 443, path: `${url.pathname}${url.search}`, method: (init?.method ?? "GET").toUpperCase(), headers, lookup: publicLookup(resolver), timeout: timeoutMs }, (response) => {
        readCapped(response, maxBytes).then(
          (buffer) => {
            const status = response.statusCode ?? 502;
            const answerHeaders = new Headers();
            for (const [k, v] of Object.entries(response.headers)) if (v !== undefined) answerHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
            finish(() => resolve(new Response(status === 204 || status === 304 ? null : new Uint8Array(buffer), { status, headers: answerHeaders })));
          },
          (error: unknown) => finish(() => reject(error)),
        );
      });
      const timer = setTimeout(() => request.destroy(new SafeFetchError("timeout")), timeoutMs);
      request.on("timeout", () => request.destroy(new SafeFetchError("timeout")));
      request.on("error", (error) => finish(() => reject(error instanceof SafeFetchError ? error : new SafeFetchError("network"))));
      init?.signal?.addEventListener("abort", () => request.destroy(new SafeFetchError("timeout")));
      if (body !== null) request.write(body);
      request.end();
    });
  };
  return safe as typeof fetch;
}

export const safeFetch = createSafeFetch();
