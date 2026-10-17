/**
 * The request's own address, used for links in demo mode only (decision 0033, review H1): the scheme
 * from X-Forwarded-Proto is taken only when it is http or https, and a Host that is not a host name
 * (or a bracketed IPv6 address) with an optional port is no address at all.
 */
import { describe, expect, it } from "vitest";
import { originFrom } from "./request-info";

const h = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe("originFrom", () => {
  it("builds the address from Host and a forwarded http or https", () => {
    expect(originFrom(h({ host: "localhost:3700" }))).toBe("http://localhost:3700");
    expect(originFrom(h({ host: "app.example" }))).toBe("https://app.example");
    expect(originFrom(h({ host: "app.example", "x-forwarded-proto": "http" }))).toBe("http://app.example");
    expect(originFrom(h({ host: "localhost:3700", "x-forwarded-proto": "HTTPS, http" }))).toBe("https://localhost:3700");
    expect(originFrom(h({ host: "[::1]:3000" }))).toBe("https://[::1]:3000");
  });

  it("ignores any other forwarded scheme", () => {
    expect(originFrom(h({ host: "localhost:3700", "x-forwarded-proto": "javascript" }))).toBe("http://localhost:3700");
    expect(originFrom(h({ host: "app.example", "x-forwarded-proto": "file" }))).toBe("https://app.example");
    expect(originFrom(h({ host: "app.example", "x-forwarded-proto": "https://evil.example/" }))).toBe("https://app.example");
  });

  it("refuses a Host that is not one", () => {
    for (const host of ["evil.example/path", "user@evil.example", "evil.example:99999", "evil example", "", "a..b", "evil.example?x=1", "evil.example#x"]) expect([host, originFrom(h({ host }))]).toEqual([host, null]);
    expect(originFrom(h({}))).toBeNull();
  });
});
