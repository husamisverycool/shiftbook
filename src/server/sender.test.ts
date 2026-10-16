import { describe, expect, it } from "vitest";
import { senderFrom } from "./sender";

const h = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe("the sender's internet address kept with an approval", () => {
  it("is the address the app's own proxy recorded: the last trusted hop, never what the sender wrote first", () => {
    // The sender wrote 198.51.100.9 themselves; the proxy appended the real address.
    expect(senderFrom(h({ "x-forwarded-for": "198.51.100.9, 203.0.113.7" }), 1).ipAddress).toBe("203.0.113.7");
    expect(senderFrom(h({ "x-forwarded-for": "203.0.113.7" }), 1).ipAddress).toBe("203.0.113.7");
    // Two proxies (a load balancer, then the app's host): the one the first proxy recorded.
    expect(senderFrom(h({ "x-forwarded-for": "198.51.100.9, 203.0.113.7, 10.0.0.2" }), 2).ipAddress).toBe("203.0.113.7");
  });

  it("is unknown rather than guessed: no trusted proxy, too few hops, or not an address", () => {
    expect(senderFrom(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.8" }), 0).ipAddress).toBeNull();
    expect(senderFrom(h({ "x-forwarded-for": "203.0.113.7" }), 2).ipAddress).toBeNull();
    expect(senderFrom(h({ "x-forwarded-for": "not an address" }), 1).ipAddress).toBeNull();
    expect(senderFrom(h({}), 1).ipAddress).toBeNull();
  });

  it("keeps the browser's description, cut to 500 characters", () => {
    expect(senderFrom(h({ "user-agent": "x".repeat(600) }), 1).userAgent).toHaveLength(500);
  });
});
