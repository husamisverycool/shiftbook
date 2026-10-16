/**
 * Decision 0030: the engine's messages in the reader's language. messages/en.json `engine` is the
 * engine's own English (ENGINE_EN), Spanish says every key with the same values, and each answer key's
 * blockers, warnings and lines render through next-intl exactly as the stored English in English.
 */
import { computePay, ENGINE_EN, PLAIN_SAY, placeholders, type Say } from "@shiftbook/rules";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { loadRuleCases } from "../../tests/golden-runners/shared";
import { speak, type Speaker } from "./engine-say";
import { readerFormat } from "./explain";

const strict = (locale: "en" | "es", messages: object): Speaker => {
  const t = createTranslator({
    locale,
    messages: messages as typeof en,
    namespace: "engine",
    onError: (e) => {
      throw e;
    },
  });
  return Object.assign((key: string, values: Record<string, string>) => t(key as "gap", values), { has: (key: string) => t.has(key as "gap") });
};
const english = strict("en", en);
const spanish = strict("es", es);
const units = { hours: (n: number) => `${n} horas`, duration: (h: number, m: string) => `${h} h ${m} min` };
const spanishWay = readerFormat("es", units);
const cases = [...loadRuleCases("tests/goldens/rules"), ...loadRuleCases("tests/goldens/_proposed/rules")];
const sides = (s: string) => [s.length - s.trimStart().length, s.length - s.trimEnd().length];

describe("the engine's messages (decision 0030)", () => {
  it("messages/en.json `engine` is exactly the engine's English templates", () => {
    expect(en.engine).toEqual(ENGINE_EN);
  });

  it("Spanish has every key, with the same placeholders and the same spaces at each end", () => {
    const esEngine = es.engine as Record<string, string>;
    expect(Object.keys(esEngine).sort()).toEqual(Object.keys(ENGINE_EN).sort());
    for (const [key, template] of Object.entries(ENGINE_EN)) {
      expect(placeholders(esEngine[key]!).sort(), key).toEqual(placeholders(template).sort());
      expect(sides(esEngine[key]!), key).toEqual(sides(template));
      // Only a template with no words of its own ("{a}, {b}") may read the same in both.
      const words = /[a-z]/i.test(template.replace(/\{\w+\}/g, ""));
      if (words) expect(esEngine[key], `${key} is still English`).not.toBe(template);
    }
  });

  it("every template is valid ICU in both languages (each placeholder filled)", () => {
    for (const [key, template] of Object.entries(ENGINE_EN)) {
      const values = Object.fromEntries(placeholders(template).map((p) => [p, `<${p}>`]));
      expect(english(key, values), key).toBe(template.replace(/\{(\w+)\}/g, "<$1>"));
      expect(() => spanish(key, values), key).not.toThrow();
    }
  });

  for (const c of cases) {
    it(`${c.name}: English on screen is the record; Spanish renders every message`, () => {
      const r = computePay(c.input);
      const all = [...r.blockers, ...r.warnings, ...r.payLines, ...r.billLines];
      for (const x of all) {
        const record = "message" in x ? x.message : x.explain;
        expect(speak(x, english, PLAIN_SAY)).toBe(record);
        const said = speak(x, spanish, spanishWay);
        expect(said).not.toMatch(/[{}]/);
        expect(said.length).toBeGreaterThan(0);
      }
    });
  }

  it("says a warning in Spanish, with dates and lengths of time the reader's way", () => {
    const say: Say = [
      { key: "belowMinimumWage", values: { name: "Ana Ruiz", date: { date: "2026-10-05" }, rate: "$14.00/h", minimum: "$15.00/h", citations: "820 ILCS 105/4(a)(1)" } },
    ];
    expect(speak({ message: "the record", say }, spanish, spanishWay)).toBe(
      "Ana Ruiz el 5 de octubre de 2026: la tarifa de pago de $14.00/h está por debajo del salario mínimo de $15.00/h (820 ILCS 105/4(a)(1)). Una línea de complemento paga la diferencia; corrija la tarjeta de tarifas.",
    );
    const line: Say = [{ key: "arithmeticExact", values: { label: { say: [{ key: "labelRegular" }] }, duration: { duration: 2400 }, minutes: "2400", rate: "$20.00/h", note: "", exact: "80000", amount: "$800.00" } }];
    expect(speak({ explain: "the record", say: line }, spanish, spanishWay)).toBe("Horas regulares: 40 h 00 min (2400 min) × $20.00/h = 80000¢ exactos → $800.00.");
  });

  it("falls back to the stored English: written before keys, or keys these messages do not have", () => {
    expect(speak({ message: "Stored English." }, spanish, spanishWay)).toBe("Stored English.");
    expect(speak({ explain: "Stored English.", say: null }, spanish, spanishWay)).toBe("Stored English.");
    expect(speak({ message: "Stored English.", say: [{ key: "notAKey" as "gap" }] }, spanish, spanishWay)).toBe("Stored English.");
  });
});
