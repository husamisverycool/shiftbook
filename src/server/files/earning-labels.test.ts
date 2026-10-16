import { readFileSync } from "node:fs";
import { WORKED_TIME } from "@shiftbook/rules";
import { describe, expect, it } from "vitest";
import { earningType } from "../db/schema";

type Messages = { invoice: { earning: Record<string, string> }; convert: { files: { earning: Record<string, string> } } };
const missing = (types: readonly string[], labels: Record<string, string>) => types.filter((type) => typeof labels[type] !== "string" || labels[type].trim() === "");

describe("every kind of line has its name in English and Spanish", () => {
  for (const locale of ["en", "es"]) {
    it(`${locale}: every pay and bill line kind on the invoice; hours worked on the files step`, () => {
      const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Messages;
      expect({ invoice: missing(earningType.enumValues, m.invoice.earning), files: missing(WORKED_TIME, m.convert.files.earning) }).toEqual({ invoice: [], files: [] });
    });
  }
});
