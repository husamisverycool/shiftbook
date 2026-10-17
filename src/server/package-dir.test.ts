import { describe, expect, it } from "vitest";
import { packageDir } from "./package-dir";

describe("packageDir", () => {
  it("finds an installed package's folder by a file it holds", () => {
    expect(packageDir("pdfjs-dist", "standard_fonts")).toMatch(/pdfjs-dist$/);
  });

  it("skips a resolver that gives back something other than a folder (the server bundle's module ids)", () => {
    expect(packageDir("pdfjs-dist", "standard_fonts", [() => 97728 as unknown as string])).toMatch(/pdfjs-dist$/);
  });

  it("says plainly when the package is not installed", () => {
    expect(() => packageDir("not-a-package-shiftbook", "x")).toThrow("not-a-package-shiftbook is not installed");
  });
});
