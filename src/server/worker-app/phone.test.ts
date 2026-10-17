import { describe, expect, it } from "vitest";
import { maskPhone, phoneIndex, readPhone } from "./phone";

const KEY = Buffer.alloc(32, 7);

describe("mobile numbers (slice t)", () => {
  it("reads US numbers written the usual ways into E.164", () => {
    expect(readPhone("(312) 555-0142")).toBe("+13125550142");
    expect(readPhone("312.555.0142")).toBe("+13125550142");
    expect(readPhone("+1 312 555 0142")).toBe("+13125550142");
    expect(readPhone("1-312-555-0142")).toBe("+13125550142");
  });

  it("refuses what is not a US mobile number (NANP: area and exchange never start with 0 or 1)", () => {
    expect(readPhone("555-0142")).toBeNull();
    expect(readPhone("(012) 555-0142")).toBeNull();
    expect(readPhone("(312) 155-0142")).toBeNull();
    expect(readPhone("+44 20 7946 0958")).toBeNull();
    expect(readPhone("312 555 01422")).toBeNull();
    expect(readPhone("")).toBeNull();
  });

  it("shows only the last four", () => {
    expect(maskPhone("+13125550142")).toBe("(•••) •••-0142");
  });

  it("finds the same number with the same keyed digest, revealing nothing", () => {
    const a = phoneIndex("+13125550142", KEY);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(phoneIndex("+13125550142", KEY)).toBe(a);
    expect(phoneIndex("+13125550143", KEY)).not.toBe(a);
    expect(phoneIndex("+13125550142", Buffer.alloc(32, 8))).not.toBe(a);
  });
});
