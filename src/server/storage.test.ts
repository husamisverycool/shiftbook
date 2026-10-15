import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDocumentStore } from "./storage";

describe("LocalDocumentStore", () => {
  const store = new LocalDocumentStore(mkdtempSync(join(tmpdir(), "sb-store-")));

  it("stores and returns bytes", async () => {
    await store.put("agency-1/doc/a.csv", new TextEncoder().encode("x,y"));
    expect(new TextDecoder().decode(await store.get("agency-1/doc/a.csv"))).toBe("x,y");
  });

  it("refuses keys that could escape the store", async () => {
    await expect(store.put("../etc/passwd", new Uint8Array())).rejects.toThrow(/unsafe/);
    await expect(store.put("agency-1/../../x", new Uint8Array())).rejects.toThrow(/unsafe/);
    await expect(store.get("/abs/path")).rejects.toThrow(/unsafe/);
  });

  it("removes everything under a prefix", async () => {
    await store.put("agency-2/a/b.txt", new Uint8Array([1]));
    await store.removePrefix("agency-2/");
    await expect(store.get("agency-2/a/b.txt")).rejects.toThrow();
  });
});
