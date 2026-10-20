"use client";

// A pay line's explanation as the app shows it (decision 0030): from its keys in the reader's language,
// or its English record. The website's sample line (docs/patterns/site.md §6).
import type { Say } from "@shiftbook/rules";
import { useEngineSay } from "@/components/shiftbook/engine-say";

export function ExplainLine({ explain, say }: { explain: string; say: Say }) {
  const speak = useEngineSay();
  return <p className="max-w-[80ch] font-mono text-[13px] leading-relaxed tabular-nums">{speak({ explain, say })}</p>;
}
