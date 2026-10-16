"use client";

/** The rules engine's messages and explanations in the reader's language (decision 0030). */
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { speak, type Spoken } from "@/lib/engine-say";
import { useReaderFormat } from "./compliance/explain";

/** Renders an issue's message or a line's explanation from its keys, or its stored English when it has none. */
export function useEngineSay(): (x: Spoken) => string {
  const t = useTranslations("engine");
  const format = useReaderFormat();
  return useCallback(
    (x: Spoken) => {
      const say = Object.assign((key: string, values: Record<string, string>) => t(key as "gap", values), { has: (key: string) => t.has(key as "gap") });
      return speak(x, say, format);
    },
    [t, format],
  );
}
