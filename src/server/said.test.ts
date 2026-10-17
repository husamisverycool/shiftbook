/**
 * Decision 0030: Granite's own server messages as keys. messages/en.json `said` is SAID_EN, Spanish
 * says each key with the same values, and each working the server writes says exactly its English.
 */
import { placeholders, PLAIN_SAY } from "@shiftbook/rules";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { FILE_OF, WORKER_ID_NAME, type PayrollSystem } from "../exports/targets";
import { readerFormat } from "../lib/explain";
import { speak, type Speaker } from "../lib/engine-say";
import { packet } from "./compliance/wc-packet";
import { lineBurden } from "./margin/burden";
import { overtimeRows } from "./margin/leakage";
import { daysToPay } from "./receivables/aging";
import { suggestMatch } from "./receivables/matching";
import { decisionSaid, decisionText, describeMoves, movesSaid } from "./run/corrections";
import { SAID_EN, saidEnglish, say, semicolons, nest, type Said } from "./said";

const strict = (locale: "en" | "es", messages: object, namespace: "said" | "engine"): Speaker => {
  const t = createTranslator({
    locale,
    messages: messages as typeof en,
    namespace,
    onError: (e) => {
      throw e;
    },
  });
  return Object.assign((key: string, values: Record<string, string>) => t(key as "gap", values), { has: (key: string) => t.has(key as "gap") });
};
const english = strict("en", en, "said");
const spanish = strict("es", es, "said");
const spanishWay = readerFormat("es", { hours: (n) => `${n} horas` });
const sides = (s: string) => [s.length - s.trimStart().length, s.length - s.trimEnd().length];

/** Each said says its English record (through next-intl too), and renders in Spanish. */
function saysItsRecord(items: { explain?: string; message?: string; said: Said }[]) {
  for (const x of items) {
    const record = x.explain ?? x.message!;
    expect(saidEnglish(x.said)).toBe(record);
    expect(speak({ ...x, say: null }, english, PLAIN_SAY, english)).toBe(record);
    const said = speak({ ...x, say: null }, spanish, spanishWay, spanish);
    expect(said).not.toMatch(/[{}]/);
    expect(said).not.toBe(record);
  }
}

describe("the server's own messages (decision 0030)", () => {
  it("messages/en.json `said` is exactly SAID_EN", () => {
    expect(en.said).toEqual(SAID_EN);
  });

  it("Spanish has every key, with the same placeholders and the same spaces at each end", () => {
    const esSaid = es.said as Record<string, string>;
    expect(Object.keys(esSaid).sort()).toEqual(Object.keys(SAID_EN).sort());
    for (const [key, template] of Object.entries(SAID_EN)) {
      expect(placeholders(esSaid[key]!).sort(), key).toEqual(placeholders(template).sort());
      expect(sides(esSaid[key]!), key).toEqual(sides(template));
      if (/[a-z]/i.test(template.replace(/\{\w+\}/g, ""))) expect(esSaid[key], `${key} is still English`).not.toBe(template);
    }
  });

  it("every template is valid ICU in both languages", () => {
    for (const [key, template] of Object.entries(SAID_EN)) {
      const values = Object.fromEntries(placeholders(template).map((p) => [p, `<${p}>`]));
      expect(english(key, values), key).toBe(template.replace(/\{(\w+)\}/g, "<$1>"));
      expect(() => spanish(key, values), key).not.toThrow();
    }
  });

  it("the kinds of pay are the invoice's own names, in both languages", () => {
    for (const [type, name] of Object.entries(en.invoice.earning)) expect((en.said as Record<string, string>)[`earning${type}`], type).toBe(name);
    for (const [type, name] of Object.entries(es.invoice.earning)) expect((es.said as Record<string, string>)[`earning${type}`], type).toBe(name);
  });

  it("a missing payroll id names each system's id and file as the export does", () => {
    const keys: Record<PayrollSystem, keyof typeof SAID_EN> = { gusto: "noPayrollIdGusto", qbd: "noPayrollIdQbd", qbo: "noPayrollIdQbo", adp_wfn: "noPayrollIdAdpWfn", adp_run: "noPayrollIdAdpRun", paychex: "noPayrollIdPaychex", paylocity: "noPayrollIdPaylocity", spreadsheet: "noPayrollIdSpreadsheet" };
    for (const system of Object.keys(keys) as PayrollSystem[]) {
      expect(saidEnglish([say(keys[system], { name: "Ana Ruiz" })])).toBe(`Ana Ruiz has no ${WORKER_ID_NAME[system]}, so ${FILE_OF[system]} could not match them.`);
    }
  });

  it("days to pay, none and some", () => {
    saysItsRecord([daysToPay([]), daysToPay([{ issuedOn: "2026-09-01", dueOn: "2026-10-01", paidOn: "2026-10-05" }]), daysToPay([{ issuedOn: "2026-09-01", dueOn: "2026-10-01", paidOn: "2026-09-20" }, { issuedOn: "2026-09-08", dueOn: "2026-10-08", paidOn: "2026-10-20" }])]);
  });

  it("a deposit's suggested match, each kind of reason", () => {
    const clients = [{ id: "plm", name: "Prairie Line Manufacturing (demo)" }];
    const inv = (id: string, balanceCents: number, poNumber: string | null = null, issuedOn = "2026-10-13") => ({ id, number: id, clientId: "plm", poNumber, issuedOn, dueOn: "2026-11-12", balanceCents });
    const open = [inv("PLM-1", 63_600, "PO-77001"), inv("PLM-2", 42_400, null, "2026-10-06"), inv("PLM-3", 10_000)];
    const dep = (description: string, amountCents: number) => ({ postedOn: "2026-10-20", description, reference: null, amountCents });
    const W = { daysBefore: 90, daysAfter: 20 };
    const found = [
      suggestMatch(dep("INV PLM-1", 63_600), open, clients, W),
      suggestMatch(dep("INV PLM-1 PLM-2", 100_000), open, clients, W),
      suggestMatch(dep("INV PLM-1 PLM-2", 110_000), open, clients, W),
      suggestMatch(dep("PO-77001", 63_600), open, clients, W),
      suggestMatch(dep("PRAIRIE LINE MANUFACTURING", 52_400), open, clients, W),
      suggestMatch(dep("ACH", 73_600), open, clients, W),
      suggestMatch(dep("PRAIRIE LINE MANUFACTURING", 5000), open, clients, W),
      suggestMatch(dep("PRAIRIE LINE MANUFACTURING", 900_000), open, clients, W),
    ];
    expect(found.every((s) => s !== null)).toBe(true);
    saysItsRecord(found.map((s) => s!));
  });

  it("overtime not billed, and a line's burden", () => {
    const MULT = { OT: { num: 3, den: 2 }, DT: { num: 2, den: 1 } };
    const pay = (type: "OT" | "DT", minutes: number, amountCents: number) => ({ workerId: "w1", week: "2026-10-05", type, minutes, amountCents, multiplier: MULT[type] });
    const bill = (type: "OT" | "DT", minutes: number, ruleId: string) => ({ workerId: "w1", week: "2026-10-05", clientId: "plm", type, minutes, ruleId });
    saysItsRecord(overtimeRows([pay("OT", 240, 15_900), pay("DT", 60, 5300)], [bill("OT", 120, "bill_overtime_straight"), bill("OT", 120, "bill_overtime_multiplier"), bill("DT", 60, "bill_overtime_not_billable")]));
    saysItsRecord(overtimeRows([pay("OT", 360, 23_850)], [bill("OT", 360, "bill_overtime_multiplier")]));
    const rates = { taxPpm: 117_000, taxState: "IL", wcPpm: 30_000, wcState: "IL", wcClass: "3632", excludeOtPremium: true };
    saysItsRecord([
      lineBurden({ type: "REG", amountCents: 73_000 }, rates),
      lineBurden({ type: "OT", amountCents: 16_425, multiplier: { num: 3, den: 2 } }, rates),
      lineBurden({ type: "OT", amountCents: 16_425, multiplier: null }, rates),
      lineBurden({ type: "BONUS_OT", amountCents: 1000 }, rates),
      lineBurden({ type: "REG", amountCents: 73_001 }, { ...rates, taxPpm: null, taxState: null }),
      lineBurden({ type: "REG", amountCents: 73_000 }, { ...rates, wcClass: null, taxState: null }),
      lineBurden({ type: "REG", amountCents: 73_000 }, { ...rates, wcPpm: null, wcState: null }),
    ]);
  });

  it("the workers' comp packet's rows", () => {
    const line = (type: string, amountCents: number, multiplier: { num: number; den: number } | null = null) => ({ state: "IL", classCode: "3632", workerId: "w1", workerName: "Ana Ruiz", type, minutes: 60, amountCents, multiplier });
    const { rows } = packet([line("REG", 73_000), line("OT", 16_425, { num: 3, den: 2 }), line("OT", 1001, { num: 3, den: 2 }), line("DT", 5300, { num: 2, den: 1 }), line("OT", 500), line("BONUS_OT", 250), line("HOL", 900)], "state");
    expect(rows.length).toBe(1);
    saysItsRecord(rows);
  });

  it("a correction's decisions and moves", () => {
    for (const decision of ["paid_by_hand", "offset_earlier_overpayment", "repaid_outside_payroll", "consent_to_deduct", "written_off"] as const) {
      const d = { decision, differenceCents: -5475 };
      expect(saidEnglish([decisionSaid(d)])).toBe(decisionText(d));
    }
    const moves = [
      { type: "REG" as const, rate: { num: 1825, den: 1 }, minutes: -1440 },
      { type: "REG" as const, rate: { num: 1900, den: 1 }, minutes: 1440 },
    ] as Parameters<typeof describeMoves>[0];
    expect(saidEnglish([say("correctionMoves", { name: "Ana", amount: "$1.00", moves: semicolons(movesSaid(moves).map((m) => nest(m))) })])).toBe(
      `Ana: $1.00 more pay, but it moves pay between rates, kinds of hours or workweeks (${describeMoves(moves)}), which the payroll file cannot carry as additions. Pay it by hand and record that here.`,
    );
  });
});
