/**
 * The rules engine's and Tabulado's own messages in the reader's language (decision 0030). An issue,
 * a line or a working carries `say` (keys under `engine`) or `said` (keys under `said`, the server's
 * own) beside its English `message` or `explain`, which stays the record. Pure: the screens and the
 * tests share it.
 */
import { english, keysOf, renderSay, type Say, type SayFormat } from "@shiftbook/rules";
import { saidEnglish, type Said } from "../server/said";

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

/**
 * The parts in the reader's language, or null to show the record. The parts are used only while they
 * say exactly the record with today's English templates: a say with a missing, renamed or malformed
 * value, or a key since changed, would otherwise come out as next-intl's "namespace.key" (the app's
 * translators report problems, they do not throw) or as some other sentence.
 */
function render<K extends string>(parts: Say<K> | null | undefined, record: string, inEnglish: (parts: Say<K>) => string, t: Speaker, f: SayFormat): string | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  try {
    if (inEnglish(parts) !== record) return null;
    if (!keysOf(parts).every((k) => t.has(k))) return null;
    return renderSay(parts, (key, values) => t(key, values), f);
  } catch {
    return null;
  }
}

/**
 * What it says in the reader's language: its keys through `engine` (or `said`), dates and lengths of
 * time written by `f`; or its stored English when it has no keys (written before them), keys these
 * messages cannot say, or keys that do not say exactly its English.
 */
export function speak(x: Spoken, engine: Speaker, f: SayFormat, said?: Speaker): string {
  const record = x.message ?? x.explain ?? "";
  return render(x.say, record, english, engine, f) ?? (said ? render(x.said, record, saidEnglish, said, f) : null) ?? record;
}
