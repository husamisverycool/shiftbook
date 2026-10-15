# CLAUDE.md — working rules for Shiftbook

Product contract: `SPEC.md`. Current slice plan: `.claude/plans/`. Read both before working.

## Talking to the owner
- The owner is not technical. Plain words. Never ask them to write code.
- Ask for exactly one thing at a time, in one sentence.
- Never ask them to paste a key or password into chat; keys go in the cloud environment settings.
- Never read `.env` files aloud (a hook blocks reading them).
- If corrected twice on the same thing: stop and ask them to `/clear`.

## How we work
1. Plan first: each slice gets `.claude/plans/<slug>.md`; show a plain summary; wait for "go".
2. Vertical slices in SPEC §25 order; each usable end to end before the next. `/clear` between slices.
3. Tests are the spec: failing test first → code → run → paste the real output.
   "Done" = tests pass + typecheck clean + lint clean (+ screenshot vs pattern file, differences
   listed, for screens). Never claim done without that evidence.
4. Subagents for research, and for a second-opinion review of every wage-rule or export change.
5. Stack changes need a record in `docs/decisions/NNNN-title.md`.

## Money, time, rules
- Money = integer cents. Time = integer minutes. No floats in pay or billing, ever.
- Round once, at line level; the explain string shows the rounding.
- Every rate, threshold, multiplier lives in a data table with effective dates. No literals in rules.
- Every pay/bill line has an `explain` string: inputs, rule, arithmetic.
- Rules engine: pure, deterministic, no I/O; one file per rule with its legal citation.

## Data safety
- No real SSNs, names, keys or customer data anywhere. Test SSNs are `9xx-xx-xxxx` only.
- SSNs: app-layer envelope encryption; never in logs, prompts, exports (except audited reveal).
- Redact SSN-shaped and date-of-birth text from images before any model call.
- Demo mode makes no external calls and uses the same code paths as production.

## Design (non-negotiable)
- No design decisions of our own. Every screen copies the hierarchy and interactions of its
  reference in `docs/patterns/`; build only what the pattern file describes. Unsure → ask the owner.
- shadcn/ui + Tailwind defaults as the neutral base. Never copy logos, names, icons, wording, colors.
- Pattern file locations (a hook enforces these; each needs `Source URL:`, `## Hierarchy`,
  `Deviations allowed: none`):
  - `src/app/**/page.tsx` (and loading/error/not-found/template/default) →
    `docs/patterns/<route>.md`, where `<route>` is the URL path with `[locale]` and `(groups)`
    removed; `/` → `home`. Example: `src/app/[locale]/(app)/invoices/[id]/page.tsx` →
    `docs/patterns/invoices/[id].md`.
  - `src/app/**/layout.tsx` → `docs/patterns/_layouts/<name>.md` (`<name>` = remaining folder path
    with `[locale]` dropped, brackets/parens stripped, `/` → `-`; empty → `root`).
  - `src/pdf/<name>.tsx` → `docs/patterns/_documents/<name>.md`.

## Guardrails (hooks in `.claude/settings.json`, scripts in `.claude/hooks/`)
- Pattern file required before any page/layout/PDF template edit.
- `tests/goldens/` is read-only (except `tests/goldens/_proposed/`). The owner approves a case by
  typing `approve golden <name>` (or `approve all goldens`); that unlocks it for one turn.
- Writes containing a non-9xx SSN-shaped string, an API key, or a private key are blocked.
- Production, `--prod`, production database URLs and deploys are blocked. The owner deploys.
- Hooks and `.claude/settings.json` are locked; the owner types `unlock hooks` to allow one turn
  of edits.
- After each TypeScript edit: lint + typecheck run; fix what they report.
- A turn cannot end while rules or export golden tests fail (after 5 blocked attempts in a row it
  lets the turn end but shows the owner a failure warning).

## Commands
(Filled in when slice (a) scaffolds the project.)
