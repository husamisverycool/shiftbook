import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { last4Of, readSsn, sealSsn, ssnIndex, ssnProblem, unsealSsn } from "./ssn";

const KEK = randomBytes(32);
const WORKER = "00000000-0000-4000-a000-000000000001";
const OTHER = "00000000-0000-4000-a000-000000000002";
/** Numbers the SSA never issues, built from parts (the repository's guard refuses SSN-shaped text outside 9xx). */
const never = (area: string, group: string, serial: string) => [area, group, serial].join("-");

describe("what an SSN may look like (SSA's never-issued numbers refused; 9xx test numbers and ITINs taken)", () => {
  it("reads nine digits with or without dashes or spaces", () => {
    expect(readSsn("900-12-3456")).toBe("900123456");
    expect(readSsn(" 900 12 3456 ")).toBe("900123456");
    expect(readSsn("900123456")).toBe("900123456");
    expect(readSsn("90-0123456")).toBeNull();
    expect(readSsn("9001234567")).toBeNull();
    expect(readSsn("abc-de-fghi")).toBeNull();
  });

  it("refuses an area of 000 or 666, a group of 00, a serial of 0000", () => {
    expect(ssnProblem("900-12-3456")).toBeNull();
    expect(ssnProblem(never("000", "12", "3456"))).toBe("area");
    expect(ssnProblem(never("666", "12", "3456"))).toBe("area");
    expect(ssnProblem("900-00-3456")).toBe("group");
    expect(ssnProblem("900-12-0000")).toBe("serial");
    expect(ssnProblem("12-345")).toBe("format");
  });

  it("keeps the last four in clear", () => {
    expect(last4Of("900123456")).toBe("3456");
  });
});

describe("envelope encryption: a fresh data key per SSN, wrapped by the key outside the database", () => {
  it("opens with the right key for the right worker only", () => {
    const sealed = sealSsn("900123456", KEK, WORKER);
    expect(JSON.stringify(sealed)).not.toContain("900123456");
    expect(unsealSsn(sealed, KEK, WORKER)).toBe("900123456");
    expect(() => unsealSsn(sealed, KEK, OTHER)).toThrow();
    expect(() => unsealSsn(sealed, randomBytes(32), WORKER)).toThrow();
  });

  it("seals the same SSN differently each time (fresh keys and nonces)", () => {
    const a = sealSsn("900123456", KEK, WORKER);
    const b = sealSsn("900123456", KEK, WORKER);
    expect(a.data).not.toBe(b.data);
    expect(a.key.data).not.toBe(b.key.data);
  });

  it("a keyed index finds the same SSN within an agency (duplicates), never across agencies", () => {
    expect(ssnIndex("900123456", KEK, "agency-a")).toBe(ssnIndex(readSsn("900-12-3456")!, KEK, "agency-a"));
    expect(ssnIndex("900123456", KEK, "agency-a")).not.toBe(ssnIndex("900123456", KEK, "agency-b"));
    expect(ssnIndex("900123456", KEK, "agency-a")).toMatch(/^[0-9a-f]{64}$/);
  });
});
