/**
 * The rules engine's and Shiftbook's own messages in the reader's language (decision 0030). An issue,
 * a line or a working carries `say` (keys under `engine`) or `said` (keys under `said`, the server's
 * own) beside its English `message` or `explain`, which stays the record. Pure: the screens and the
 * tests share it.
 */
import { keysOf, renderSay, type Say, type SayFormat } from "@shiftbook/rules";
import type { Said } from "../server/said";

/** Anything the engine or the server wrote: its English record, and its keys when it has them. */
export interface Spoken {
  message?: string | null;
  explain?: string | null;
  say?: Say | null;
  said?: Said | null;
}

/** Says a key of a namespace with its values written out; `has` tells whether the messages have the key. */
export interface Speaker {
  (key: string, values: Record<string, string>): string;
  has: (key: string) => boolean;
}

function render(parts: Say<string> | null | undefined, t: Speaker, f: SayFormat): string | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  if (!keysOf(parts).every((k) => t.has(k))) return null;
  try {
    return renderSay(parts, (key, values) => t(key, values), f);
  } catch {
    return null;
  }
}

/**
 * What it says in the reader's language: its keys through `engine` (or `said`), dates and lengths of
 * time written by `f`; or its stored English when it has no keys (written before them) or keys these
 * messages cannot say.
 */
export function speak(x: Spoken, engine: Speaker, f: SayFormat, said?: Speaker): string {
  const record = x.message ?? x.explain ?? "";
  return render(x.say, engine, f) ?? (said ? render(x.said, said, f) : null) ?? record;
}
