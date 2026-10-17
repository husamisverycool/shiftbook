"use client";

/** The rules engine's and Granite's own messages and explanations in the reader's language (decision 0030). */
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { speak, type Speaker, type Spoken } from "@/lib/engine-say";
import { useReaderFormat } from "./compliance/explain";

/** Renders an issue's message or a line's explanation from its keys, or its stored English when it has none. */
export function useEngineSay(): (x: Spoken) => string {
  const engine = useTranslations("engine");
  const said = useTranslations("said");
  const format = useReaderFormat();
  return useCallback(
    (x: Spoken) => {
      const e: Speaker = Object.assign((key: string, values: Record<string, string>) => engine(key as "gap", values), { has: (key: string) => engine.has(key as "gap") });
      const s: Speaker = Object.assign((key: string, values: Record<string, string>) => said(key as "gap", values), { has: (key: string) => said.has(key as "gap") });
      return speak(x, e, format, s);
    },
    [engine, said, format],
  );
}
