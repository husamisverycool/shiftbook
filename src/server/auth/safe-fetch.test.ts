/**
 * Outbound calls to identity providers (decision 0033, review M2): https on port 443 to a named host
 * only; every address the name resolves to must be public, checked at each connection (a name that
 * later resolves to a private address — DNS rebinding — is refused then too); answers capped in size.
 * No test here touches the network: the resolver is a stub, and every refusal happens before a
 * connection.
 */
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createSafeFetch, isPublicAddress, publicLookup, readCapped, SafeFetchError, type Resolver } from "./safe-fetch";

const answering = (...addresses: string[]): Resolver => async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    expect(error).toBeInstanceOf(SafeFetchError);
    return (error as SafeFetchError).reason;
  }
  throw new Error("expected a refusal");
}

describe("which addresses are public", () => {
  it("accepts public unicast addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "142.250.80.46", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"]) expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
  });

  it("refuses private, loopback, link-local, shared, documentation, multicast and reserved ranges, mapped forms included", () => {
    const blocked = [
      "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1",
      "192.168.1.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255",
      "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "100::1", "2001::1",
    ];
    for (const ip of blocked) expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
    expect(isPublicAddress("not an address")).toBe(false);
  });
});

describe("the connection's own lookup", () => {
  const lookup = (resolver: Resolver, all: boolean) =>
    new Promise<unknown>((resolve, reject) => publicLookup(resolver)("idp.example", { all }, (error, address, family) => (error ? reject(error) : resolve(all ? address : { address, family }))));

  it("hands the connection a public address", async () => {
    expect(await lookup(answering("93.184.216.34"), false)).toEqual({ address: "93.184.216.34", family: 4 });
    expect(await lookup(answering("93.184.216.34", "2606:2800:220:1::248"), true)).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::248", family: 6 },
    ]);
  });

  it("refuses a name when any of its addresses is private (no partial answers)", async () => {
    await expect(lookup(answering("93.184.216.34", "10.0.0.5"), true)).rejects.toMatchObject({ reason: "private_address" });
    await expect(lookup(answering("169.254.169.254"), false)).rejects.toMatchObject({ reason: "private_address" });
    await expect(lookup(answering(), false)).rejects.toMatchObject({ reason: "private_address" });
  });
});

describe("safeFetch refuses before connecting", () => {
  const safe = createSafeFetch({ resolver: answering("10.0.0.5") });

  it("anything but https on port 443 to a named host", async () => {
    expect(await refusal(safe("http://idp.example/.well-known/openid-configuration"))).toBe("not_https");
    expect(await refusal(safe("https://idp.example:8443/x"))).toBe("port");
    expect(await refusal(safe("https://127.0.0.1/x"))).toBe("ip_literal");
    expect(await refusal(safe("https://[::1]/x"))).toBe("ip_literal");
    expect(await refusal(safe("https://8.8.8.8/x"))).toBe("ip_literal");
    expect(await refusal(safe("https://user:pass@idp.example/x"))).toBe("credentials");
  });

  it("a name that resolves to a private address, at every call (a rebinding name is caught on the call that rebinds)", async () => {
    expect(await refusal(safe("https://idp.example/.well-known/openid-configuration"))).toBe("private_address");
    let calls = 0;
    const rebinding: Resolver = async () => (calls++ === 0 ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
    const flaky = createSafeFetch({ resolver: rebinding });
    expect(await refusal(flaky("https://idp.example/a"))).toBe("private_address");
    expect(await refusal(flaky("https://idp.example/b"))).toBe("private_address");
    expect(calls).toBe(2);
  });
});

describe("answers are capped", () => {
  it("reads up to the cap and refuses beyond it", async () => {
    expect((await readCapped(Readable.from([Buffer.from("small")]), 1024)).toString()).toBe("small");
    await expect(readCapped(Readable.from([Buffer.alloc(800), Buffer.alloc(800)]), 1024)).rejects.toMatchObject({ reason: "too_large" });
  });
});
