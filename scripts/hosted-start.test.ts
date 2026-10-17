import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connectionFor, rolePassword, volumeKey } from "./hosted-start";

const ADMIN = "postgresql://admin:pw%40x@127.0.0.1:5432/main?sslmode=disable";

describe("hosted start", () => {
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
    const key = volumeKey(dir);
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(statSync(join(dir, "encryption-key")).mode & 0o777).toBe(0o600);
    expect(volumeKey(dir)).toBe(key);
    expect(readFileSync(join(dir, "encryption-key"), "utf8").trim()).toBe(key);
  });
});
