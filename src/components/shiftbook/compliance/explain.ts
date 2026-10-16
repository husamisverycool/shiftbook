"use client";

/** A duty's explanation and Shiftbook's own notes in the reader's language (decision 0028). */
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { readerFormat, renderExplain, type Explain } from "@/lib/explain";

/** A rule's citation in the reader's language; the rule table's text when the messages have none for it. */
export function useCite(): (code: string, stored: string) => string {
  const t = useTranslations("compliance.citations");
  return (code, stored) => (t.has(code) ? t(code as "aca_offer") : stored);
}

export function useSay(): (e: Explain) => string {
  const t = useTranslations("compliance.explain");
  const units = useTranslations("compliance.explainUnits");
  const cite = useCite();
  const locale = useLocale();
  const format = useMemo(() => {
    // The count written the way every other number on the line is (US Spanish groups as US English).
    const grouped = new Intl.NumberFormat(locale.startsWith("es") ? "es-US" : locale);
    return readerFormat(locale, { hours: (count) => units("hours", { count, n: grouped.format(count) }), duration: (h, m) => units("duration", { h: String(h), m }) });
  }, [locale, units]);
  return (e) => renderExplain(e, (key, values) => t(key as "reverify", values), format, cite);
}
