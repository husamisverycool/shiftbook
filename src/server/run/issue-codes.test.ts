import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUN_ISSUE_CODES } from "./issue-codes";

describe("every issue a run can give has a label in English and Spanish", () => {
  for (const locale of ["en", "es"]) {
    it(locale, () => {
      const labels = (JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as { convert: { totals: { blockers: Record<string, string> } } }).convert.totals.blockers;
      expect(RUN_ISSUE_CODES.filter((code) => typeof labels[code] !== "string" || labels[code].trim() === "")).toEqual([]);
    });
  }
});
