/** The same as useEngineSay for server components (decision 0030): the reader's language and dates. */
import { getLocale, getTranslations } from "next-intl/server";
import { readerFormat } from "@/lib/explain";
import { speak, type Speaker, type Spoken } from "@/lib/engine-say";

export async function getEngineSay(): Promise<(x: Spoken) => string> {
  const [engine, said, units, locale] = await Promise.all([getTranslations("engine"), getTranslations("said"), getTranslations("compliance.explainUnits"), getLocale()]);
  // The count written the way every other number on the line is (US Spanish groups as US English).
  const grouped = new Intl.NumberFormat(locale.startsWith("es") ? "es-US" : locale);
  const format = readerFormat(locale, { hours: (count) => units("hours", { count, n: grouped.format(count) }), duration: (h, m) => units("duration", { h: String(h), m }) });
  const e: Speaker = Object.assign((key: string, values: Record<string, string>) => engine(key as "gap", values), { has: (key: string) => engine.has(key as "gap") });
  const s: Speaker = Object.assign((key: string, values: Record<string, string>) => said(key as "gap", values), { has: (key: string) => said.has(key as "gap") });
  return (x) => speak(x, e, format, s);
}
