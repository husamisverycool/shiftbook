/**
 * Duty explanations and Shiftbook's notes as keys (decision 0028), on the server: the English the keys
 * say, which citations the messages carry, the Illinois equal-pay sentence, and Shiftbook's notes read
 * back into keys. Keys are kept only when they say exactly the stored English, so a reader in another
 * language is never told something the record does not say.
 */
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import { PLAIN, renderExplain, type Explain, type ExplainPart } from "../../lib/explain";

const english = createTranslator({ locale: "en", messages: en, namespace: "compliance.explain" });

/** What the keys say in English, written the stored sentence's way. */
export const sayInEnglish = (e: Explain): string => renderExplain(e, (key, values) => english(key as "reverify", values), PLAIN);

/** The rule's code when the messages carry its citation as the rule table has it now (a replaced row's text stays as stored). */
export const citationCodeOf = (code: string, citation: string): string | null => ((en.compliance.citations as Record<string, string>)[code] === citation ? code : null);

/** The Illinois equal-pay duty's sentence as the engine writes it (packages/rules/src/rules/il-equal-pay.ts). */
export function equalPayExplain(
  o: { kind: string; workerName: string; crossedOn: string; crossedAtMinute: number | null; windowStart: string; thresholdMinutes: number; earlierMinutesAfter: number },
  client: string,
  months: number,
): Explain {
  return {
    parts: [
      { key: "equalPayWhere", values: { worker: o.workerName, threshold: { hours: o.thresholdMinutes }, client, date: { date: o.crossedOn }, at: o.crossedAtMinute !== null ? "yes" : "none", clock: o.crossedAtMinute !== null ? { clock: o.crossedAtMinute } : "", months: String(months), windowStart: { date: o.windowStart } } },
      { key: o.kind === "il_equal_pay_720h" ? "equalPay720" : "equalPay4160" },
      ...(o.earlierMinutesAfter > 0 ? [{ key: "equalPayEarlier", values: { duration: { duration: o.earlierMinutesAfter } } }] : []),
    ],
    citation: null,
  };
}

const DATE = "(\\d{4}-\\d{2}-\\d{2})";
type Where = { kind: string; closedBySystem: boolean };
const EQUAL_PAY = ["il_equal_pay_720h", "il_equal_pay_4160h"];
/** Each fixed note, where Shiftbook writes it (so a person's words that happen to read alike stay theirs). */
const NOTES: [RegExp, (w: Where) => boolean, (m: RegExpExecArray) => ExplainPart][] = [
  [new RegExp(`^Reverified on ${DATE}\\.$`), (w) => w.kind === "i9_reverify" && !w.closedBySystem, (m) => ({ key: "noteReverified", values: { date: { date: m[1]! } } })],
  [new RegExp(`^The work authorization's end was changed from ${DATE} to ${DATE}\\.$`), (w) => w.kind === "i9_reverify" && !w.closedBySystem, (m) => ({ key: "noteWorkAuthChanged", values: { from: { date: m[1]! }, to: { date: m[2]! } } })],
  [new RegExp(`^The work authorization's end \\(${DATE}\\) was removed\\.$`), (w) => w.kind === "i9_reverify" && !w.closedBySystem, (m) => ({ key: "noteWorkAuthRemoved", values: { from: { date: m[1]! } } })],
  [new RegExp(`^Equal-pay rate entered from ${DATE}\\.$`), (w) => EQUAL_PAY.includes(w.kind) && !w.closedBySystem, (m) => ({ key: "noteRateEntered", values: { date: { date: m[1]! } } })],
  [new RegExp(`^Renewed: (.+), expires ${DATE}\\.$`), (w) => w.closedBySystem, (m) => ({ key: "noteRenewed", values: { number: m[1]!, expires: { date: m[2]! } } })],
  [new RegExp(`^Renewed: (.+), from ${DATE} to ${DATE}\\.$`), (w) => w.closedBySystem, (m) => ({ key: "notePolicyRenewed", values: { number: m[1]!, from: { date: m[2]! }, to: { date: m[3]! } } })],
  [new RegExp(`^(Section 1|Section 2) completed on ${DATE}\\.$`), (w) => w.closedBySystem, (m) => ({ key: "noteCompleted", values: { part: m[1] === "Section 1" ? "section1" : "section2", date: { date: m[2]! } } })],
];

/** A note Shiftbook wrote, as keys — null for anything else (a person's own words stay as typed). */
export function noteKeyOf(note: string, where: Where): Explain | null {
  for (const [pattern, writes, part] of NOTES) {
    const m = pattern.exec(note);
    if (!m || !writes(where)) continue;
    const key: Explain = { parts: [part(m)], citation: null };
    return sayInEnglish(key) === note ? key : null;
  }
  return null;
}
