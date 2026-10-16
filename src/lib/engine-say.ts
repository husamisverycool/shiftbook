/**
 * The rules engine's messages in the reader's language (decision 0030). An issue or a line carries
 * `say` (message keys under `engine`) beside its English `message` or `explain`, which stays the
 * record. Pure: the screens and the tests share it.
 */
import { keysOf, renderSay, type Say, type SayFormat } from "@shiftbook/rules";

/** Anything the engine wrote: its English record, and its keys when it has them. */
export interface Spoken {
  message?: string | null;
  explain?: string | null;
  say?: Say | null;
}

/** Says a key of a namespace with its values written out; `has` tells whether the messages have the key. */
export interface Speaker {
  (key: string, values: Record<string, string>): string;
  has: (key: string) => boolean;
}

/**
 * What it says in the reader's language: its say through `t` (dates and lengths of time written by
 * `f`), or its stored English when it has no say (written before keys) or one the messages cannot say.
 */
export function speak(x: Spoken, t: Speaker, f: SayFormat): string {
  const record = x.message ?? x.explain ?? "";
  if (!Array.isArray(x.say) || x.say.length === 0) return record;
  if (!keysOf(x.say).every((k) => t.has(k))) return record;
  try {
    return renderSay(x.say, (key, values) => t(key, values), f);
  } catch {
    return record;
  }
}
