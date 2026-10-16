# 0030 — The rules engine's messages in the reader's language

Status: accepted
Date: 2026-10-16

## Context
SPEC §20: every string in English and Spanish. Decision 0028 moved the compliance duties' "worked out
from" lines to message keys, but the pure rules engine still wrote every blocker, warning and pay or
bill line explanation as an English sentence, and Spanish screens showed that English: the converter's
Exceptions and Review totals, the margin lines and overtime not billed, the rate form's markup working.
The English is the record — the answer keys pin it byte for byte, and exports, CSV and PDFs carry it.

## Decision
- **Keys beside the record**: every `Issue`, `Line` and `Obligation` the engine returns carries `say`,
  a list of parts (`{ key, values }`, said one after the other with no separator), built at the same
  place the English was built. The English (`message`, `explain`) is now `english(say)`, so the two
  can never drift. `packages/rules/src/say.ts` holds the English templates (`ENGINE_EN`), plain
  `{name}` placeholders only; where English changes with a number ("is"/"are") the engine picks one of
  two keys. A value is text as the English writes it (money, rates, multipliers, counts, codes, names
  and citations — US formatting is right for US Spanish), a date, a length of time, or a nested
  fragment (a problem inside "… : <problem>. All of this worker's weeks are held …"). Fragments are
  whole clauses, so a translator can reorder the placeholders inside each.
- **Messages**: `messages/en.json` `engine` equals `ENGINE_EN` (a unit test), `messages/es.json` has
  each key with the same placeholders and the same spaces at each end (formal "usted", the app's own
  payroll words: tarifa de cobro, horas extra, tiempo doble, tarjeta de tarifas, igualdad salarial).
- **Screens**: `useEngineSay()` (`src/components/shiftbook/engine-say.ts`) renders a say with next-intl's
  `engine` namespace in the reader's language, dates and lengths of time the reader's way (the same
  `readerFormat` as the duties); anything without a say — or with a key these messages lack, or a say
  that today's English templates do not turn into exactly its stored English (a missing, renamed or
  malformed value: next-intl as the app sets it up reports such a problem and says "engine.<key>"
  rather than throwing) — shows its stored English. Used on Exceptions, Review totals, the margin lines, overtime not billed and the
  rate form's markup preview (`billFromMarkup` returns the working's keys too, and the bill line uses
  them while they say exactly the stored working).
- **Shiftbook's own messages** the same way, under a second namespace `said` (`src/server/said.ts`,
  `SAID_EN`; messages/en.json `said` equals it): the run's own blockers and warnings (`said` beside
  `message` on each issue), the invoice problems, a correction's decisions and moves, days to pay, a
  deposit's suggested match, overtime not billed, a pay line's estimated burden and the workers' comp
  packet's rows. The same hook says them (`getEngineSay()` in server components); an export's own
  refusal (from the payroll or VMS file writers) and a person's own words stay as they are.
- **Storage**: migration 0037 adds nullable `say jsonb` to `pay_lines` and `bill_lines`; a run's
  blockers and warnings (jsonb) carry each issue's say. Never backfilled: older rows keep their English.
  The run's fingerprint leaves every `say` and `said` out, so a run computed before keeps its
  fingerprint and an approval of it stands.
- **Proof**: the answer-key runners compare the result with every `say` removed (and the workers' comp
  packet's rows without `said`, as the duties without `explain`); unit tests check, for every approved
  and proposed answer key and for every case of the engine's own tests (run again through a checking
  `computePay`), that each say says exactly its record with keys `ENGINE_EN` has, that every template
  is valid ICU in both languages, and that each answer key renders in English through next-intl exactly
  as stored; the server's workings are checked the same way, and stored run issues and lines in the
  integration tests. For every approved answer key, the result as JSON through the fingerprint's own
  replacer is pinned to the SHA-256 the engine wrote before the keys (src/server/run/fingerprint.test.ts).

## Alternatives considered
- Translating the stored English with patterns on the screen: brittle, and silently wrong when a
  sentence changes.
- Storing both languages: a second record to keep right, and a third language would need a migration.
- One key per whole sentence with every variant inside ICU `select`: fewer keys, but the English then
  depends on next-intl, and the engine must stay pure with no dependencies.

## Consequences
- English readers see dates in engine messages written out ("October 5, 2026"), as the duties show
  them; the stored record, exports, CSV and PDFs keep ISO dates and stay byte-identical.
- A sentence change in the engine is a template change in `ENGINE_EN` and both message files; the tests
  fail until the three agree.
- An Illinois equal-pay rate row whose method is not one of the four named methods (a JavaScript
  property name such as "toString", which the equal-pay form refuses on entry) now holds its worker as
  "the method must be named"; before, the engine paid it with a garbled explanation.
