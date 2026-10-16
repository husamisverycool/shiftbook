import { describe, expect, it } from "vitest";
import { localePath, safeNext } from "./next-path";

describe("where sign-in leads afterwards", () => {
  it("keeps a page inside the app, without its language", () => {
    expect(safeNext("/invoices?status=open")).toBe("/invoices?status=open");
    expect(safeNext("/es/compliance/aca")).toBe("/compliance/aca");
    expect(safeNext("/en")).toBe("/");
    expect(safeNext("/convert")).toBe("/convert");
  });

  it("never leaves the site or loops back to sign-in", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", "/sign-in/code", "/es/invite/x", "/approve/x", "", null, 42, "/a\nb"]) expect(safeNext(bad)).toBe("/");
  });

  it("puts the language in front, Home as the language's root", () => {
    expect(localePath("es", "/")).toBe("/es");
    expect(localePath("en", "/?recoveryLeft=2")).toBe("/en?recoveryLeft=2");
    expect(localePath("en", "/invoices?status=open")).toBe("/en/invoices?status=open");
  });
});
