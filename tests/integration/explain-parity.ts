/**
 * Decision 0028: every duty on file with keys says, in its English template filled the stored
 * sentence's way, exactly its stored English sentence — so the Spanish screens say the same thing.
 */
import { createTranslator } from "next-intl";
import { expect } from "vitest";
import en from "../../messages/en.json";
import { PLAIN, renderExplain } from "../../src/lib/explain";
import type { Tx } from "../../src/server/db/client";
import { obligations } from "../../src/server/db/schema";

const english = createTranslator({ locale: "en", messages: en, namespace: "compliance.explain" });

export async function explanationsSayTheMessage(tx: Tx): Promise<number> {
  const rows = await tx.select({ kind: obligations.kind, message: obligations.message, explain: obligations.explain, statusNote: obligations.statusNote, noteKey: obligations.noteKey }).from(obligations);
  let checked = 0;
  for (const r of rows) {
    if (r.explain) {
      expect(renderExplain(r.explain, (key, values) => english(key as "reverify", values), PLAIN), r.kind).toBe(r.message);
      checked += 1;
    }
    if (r.noteKey) expect(renderExplain(r.noteKey, (key, values) => english(key as "reverify", values), PLAIN), `${r.kind} note`).toBe(r.statusNote);
  }
  return checked;
}
