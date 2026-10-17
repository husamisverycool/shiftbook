import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connectionFor, hostedMode, inside, keyCheck, makeVolumeKey, readVolumeKey, rolePassword } from "./hosted-start";

const ADMIN = "postgresql://admin:pw%40x@127.0.0.1:5432/main?sslmode=disable";

describe("hosted start", () => {
  it("accepts only demo or live, so a typo never makes a live host a demo", () => {
    expect(hostedMode("demo")).toBe("demo");
    expect(hostedMode("live")).toBe("live");
    for (const wrong of [undefined, "", "Live", "prod", "demo "]) expect(() => hostedMode(wrong)).toThrow(/must be "demo" or "live"/);
  });

  it("works out the same password for a role at every start, a different one per role", () => {
    expect(rolePassword(ADMIN, "shiftbook_app")).toBe(rolePassword(ADMIN, "shiftbook_app"));
    expect(rolePassword(ADMIN, "shiftbook_app")).not.toBe(rolePassword(ADMIN, "shiftbook_owner"));
    expect(rolePassword(ADMIN, "shiftbook_app")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the host, port and options, with the account and database swapped", () => {
    const url = new URL(connectionFor(ADMIN, "shiftbook_app", "abc", "granite"));
    expect([url.username, url.password, url.host, url.pathname, url.search]).toEqual(["shiftbook_app", "abc", "127.0.0.1:5432", "/granite", "?sslmode=disable"]);
  });

  it("makes the key once, readable by the app only, then reads the same key back", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "granite-key-")), "keys");
    expect(readVolumeKey(dir)).toBeNull();
    const key = makeVolumeKey(dir);
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(statSync(join(dir, "encryption-key")).mode & 0o777).toBe(0o600);
    expect(readVolumeKey(dir)).toBe(key);
    expect(readFileSync(join(dir, "encryption-key"), "utf8").trim()).toBe(key);
    // A second start that races the first keeps the first key.
    expect(makeVolumeKey(dir)).toBe(key);
  });

  it("stops at a damaged key file instead of replacing it", () => {
    const dir = mkdtempSync(join(tmpdir(), "granite-key-"));
    writeFileSync(join(dir, "encryption-key"), "");
    expect(() => readVolumeKey(dir)).toThrow(/32-byte key/);
  });

  it("recognises a key by its check, which differs for another key", () => {
    const a = Buffer.alloc(32, 1).toString("base64");
    const b = Buffer.alloc(32, 2).toString("base64");
    expect(keyCheck(a)).toBe(keyCheck(a));
    expect(keyCheck(a)).not.toBe(keyCheck(b));
    expect(keyCheck(a)).not.toContain(a);
  });

  it("knows whether the files folder is on the volume", () => {
    expect(inside("/data", "/data/storage")).toBe(true);
    expect(inside("/data", "/data")).toBe(true);
    expect(inside("/data", "/app/.storage")).toBe(false);
    expect(inside("/data", "/data/../app")).toBe(false);
    expect(inside("/data", "/database")).toBe(false);
  });
});
