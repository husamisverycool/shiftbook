/**
 * Decision 0030: the engine's messages in the reader's language. messages/en.json `engine` is the
 * engine's own English (ENGINE_EN), Spanish says every key with the same values, and each answer key's
 * blockers, warnings and lines render through next-intl exactly as the stored English in English.
 */
import { computePay, english as engineEnglish, ENGINE_EN, PLAIN_SAY, placeholders, type Say } from "@shiftbook/rules";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { loadRuleCases } from "../../tests/golden-runners/shared";
import { saidEnglish, type Said } from "../server/said";
import { speak, type Speaker, type Spoken } from "./engine-say";
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
const units = { hours: (n: number) => `${n} horas` };
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

  it("writes a length of time as every screen writes hours (670:00), in both languages", () => {
    for (const locale of ["en", "es"]) {
      const way = readerFormat(locale, { hours: (n: number) => `${n} hours` });
      expect(way.duration(40200)).toBe("670:00");
      expect(way.duration(90)).toBe("1:30");
      expect(way.hours(40230)).toBe("670:30");
      expect(way.hours(43200)).toBe("720 hours");
    }
    const say: Say = [{ key: "approachingEqualPay", values: { name: "Fatima Haddad", week: { date: "2026-10-05" }, duration: { duration: 40200 }, client: "Prairie Line", months: "12", date: { date: "2026-10-11" }, threshold: "720 hours" } }];
    expect(speak({ message: engineEnglish(say), say }, english, readerFormat("en", { hours: (n: number) => `${n} hours` }))).toContain(": 670:00 worked at Prairie Line");
    expect(speak({ message: engineEnglish(say), say }, spanish, spanishWay)).toContain("670:00");
  });

  it("says a warning in Spanish, with dates and lengths of time the reader's way", () => {
    const say: Say = [
      { key: "belowMinimumWage", values: { name: "Ana Ruiz", date: { date: "2026-10-05" }, rate: "$14.00/h", minimum: "$15.00/h", citations: "820 ILCS 105/4(a)(1)" } },
    ];
    // The record is the say's own English: a say is used only while it says exactly its record.
    expect(speak({ message: engineEnglish(say), say }, spanish, spanishWay)).toBe(
      "Ana Ruiz el 5 de octubre de 2026: la tarifa de pago de $14.00/h está por debajo del salario mínimo de $15.00/h (820 ILCS 105/4(a)(1)). Una línea de complemento paga la diferencia; corrija la tarjeta de tarifas.",
    );
    const line: Say = [{ key: "arithmeticExact", values: { label: { say: [{ key: "labelRegular" }] }, duration: { duration: 2400 }, minutes: "2400", rate: "$20.00/h", note: "", exact: "80000", amount: "$800.00" } }];
    expect(speak({ explain: engineEnglish(line), say: line }, spanish, spanishWay)).toBe("Horas regulares: 40:00 (2400 min) × $20.00/h = 80000¢ exactos → $800.00.");
  });

  it("falls back to the stored English: written before keys, or keys these messages do not have", () => {
    expect(speak({ message: "Stored English." }, spanish, spanishWay)).toBe("Stored English.");
    expect(speak({ explain: "Stored English.", say: null }, spanish, spanishWay)).toBe("Stored English.");
    expect(speak({ message: "Stored English.", say: [{ key: "notAKey" as "gap" }] }, spanish, spanishWay)).toBe("Stored English.");
  });
});

/**
 * The app's own translators: src/i18n/request.ts and the locale layout set no onError and no
 * getMessageFallback, so next-intl reports a problem with console.error and says "namespace.key"
 * instead of throwing. Whatever a stored say holds, the screen shows its English or its record.
 */
describe("with the app's own translators, a say that does not say its record shows the stored English (decision 0030)", () => {
  const app = (locale: "en" | "es", namespace: "engine" | "said"): Speaker => {
    const t = createTranslator({ locale, messages: (locale === "en" ? en : es) as typeof en, namespace });
    return Object.assign((key: string, values: Record<string, string>) => t(key as "gap", values), { has: (key: string) => t.has(key as "gap") });
  };
  const readers = [
    { locale: "en", engine: app("en", "engine"), said: app("en", "said"), way: PLAIN_SAY },
    { locale: "es", engine: app("es", "engine"), said: app("es", "said"), way: spanishWay },
  ] as const;
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const overlap: Say = [{ key: "shiftsOverlap", values: { name: "Ana Ruiz", date: { date: "2026-10-05" } } }];
  const overlapRecord = engineEnglish(overlap);
  const held: Say = [{ key: "workerHeld", values: { name: "Ana Ruiz", problem: { say: [{ key: "problemEqualPayMethod" }] } } }];
  const heldRecord = engineEnglish(held);
  const pending: Said = [{ key: "documentPending", values: { file: "week-41.pdf" } }];
  const pendingRecord = saidEnglish(pending);
  const unmatched: Said = [{ key: "unmatched", values: { name: "A. Ruiz" } }];
  const unmatchedRecord = saidEnglish(unmatched);

  const broken: [string, Spoken][] = [
    ["a missing value", { message: overlapRecord, say: [{ key: "shiftsOverlap", values: { name: "Ana Ruiz" } }] }],
    ["an unknown key", { message: overlapRecord, say: [{ key: "notAKey" as "gap", values: { name: "Ana Ruiz" } }] }],
    ["an unknown key in a fragment", { message: heldRecord, say: [{ key: "workerHeld", values: { name: "Ana Ruiz", problem: { say: [{ key: "notAKey" as "gap" }] } } }] }],
    ["a null value", { message: overlapRecord, say: [{ key: "shiftsOverlap", values: { name: null as never, date: { date: "2026-10-05" } } }] }],
    ["a null part", { message: overlapRecord, say: [null as never] }],
    ["a fragment whose say is not a list", { message: heldRecord, say: [{ key: "workerHeld", values: { name: "Ana Ruiz", problem: { say: "problemEqualPayMethod" as never } } }] }],
    // A template whose placeholder was renamed ({date} to {day}) with its English words unchanged: a say
    // stored before the change no longer fills it.
    ["a placeholder renamed, its English unchanged", { message: overlapRecord, say: [{ key: "shiftsOverlap", values: { name: "Ana Ruiz", day: { date: "2026-10-05" } } as never }] }],
    ["a date that is not a date", { message: overlapRecord, say: [{ key: "shiftsOverlap", values: { name: "Ana Ruiz", date: { date: "not-a-date" } } }] }],
    ["a say that says something else", { message: overlapRecord, say: [{ key: "shiftsOverlap", values: { name: "Ana Ruiz", date: { date: "2026-10-06" } } }] }],
    ["a server message missing a value", { message: pendingRecord, said: [{ key: "documentPending", values: {} }] }],
    ["a server message with a null value", { message: unmatchedRecord, said: [{ key: "unmatched", values: { name: null as never } }] }],
    ["a server message with a null part", { message: unmatchedRecord, said: [null as never] }],
  ];
  for (const r of readers) {
    for (const [what, x] of broken) {
      it(`${what} [${r.locale}]: the stored English, without throwing`, () => {
        const record = x.message;
        expect(() => speak(x, r.engine, r.way, r.said)).not.toThrow();
        expect(speak(x, r.engine, r.way, r.said)).toBe(record);
      });
    }
  }

  it("a say that says its record is said in the reader's language", () => {
    const [english, spanishReader] = readers;
    expect(speak({ message: overlapRecord, say: overlap }, english.engine, english.way, english.said)).toBe(overlapRecord);
    expect(speak({ message: overlapRecord, say: overlap }, spanishReader.engine, spanishReader.way, spanishReader.said)).toBe(
      "Ana Ruiz el 5 de octubre de 2026: dos turnos se superponen en el tiempo, así que los mismos minutos se pagarían dos veces.",
    );
    expect(speak({ message: heldRecord, say: held }, spanishReader.engine, spanishReader.way, spanishReader.said)).toBe(
      "Ana Ruiz: falta indicar el método. Todas las semanas de este trabajador quedan retenidas hasta que se corrija.",
    );
    expect(speak({ message: pendingRecord, said: pending }, spanishReader.engine, spanishReader.way, spanishReader.said)).toBe("week-41.pdf todavía se está leyendo; sus horas aún no están en los totales.");
    expect(console.error).not.toHaveBeenCalled();
  });
});
