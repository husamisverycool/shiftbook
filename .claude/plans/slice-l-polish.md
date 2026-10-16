# Slice (l) — every screen at its best, in both languages; the whole acceptance test

SPEC: §24 (acceptance, in English and Spanish, as one Playwright test; "a stranger can open the demo
URL and do all of that in under ten minutes without help"), §20 (every string in both languages),
§25 row l (polish every screen against its pattern file). Owner, 2026-10-16: more gravity and some
creativity in the design, drawn purely from excellent, documented products — not radical.

## What the owner gets (plain words)
Every screen looks more substantial and finished — clearer page headers, the numbers that matter
shown big, statuses in color with icons, helpful empty pages — following the published design
guides of products like Shopify, GitHub, Stripe, Vercel and Linear. Every word on a Spanish screen
is Spanish, in one formal voice. One long automatic test walks the whole product, start to finish, in
both languages, the way a stranger would.

## Steps (each usable and tested before the next)
1. **Spanish in one voice** (task 51): usted everywhere, one word per idea (asignación, Propietario,
   nómina semanal, obligación); a unit test flags informal forms and old terms.
2. **Design foundations** (task 52): the products' own published screenshots (Linear, Stripe,
   Mercury, Shopify's setup guide) studied and listed with their sources
   (`docs/research/design-gravity-slice-l.md` part C); decision 0029 takes each piece from one of
   them — Linear's frame and lists, Stripe's titles, tabs, tables, badges and Home, Mercury's
   figures — on the shadcn base (no copied colors, logos, icons or wording). Owner's review of the
   first pass (2026-10-16): it looked "vibe coded"; boxed figure grids, dotted pills, sentences under
   titles and dashed empty boxes were removed because no reference shows them.
3. **Screen by screen**: each list, detail, settings and analytics screen moves to the shared pieces
   as its pattern file says (pattern files updated first where a documented rule adds to them);
   before/after screenshots in `docs/screens/slice-l.md` with differences listed.
4. **Every message in the reader's language** (task 50): the rules engine's blockers, warnings and
   line explanations, the run's own blockers, bank suggestions, days-to-pay and the workers' comp
   packet carry keys beside their English (the English stays the record; parity tests as in decision
   0028; answer keys compare the English).
5. **The acceptance test**: `tests/e2e/acceptance.spec.ts`, SPEC §24 steps 1–10 in English and in
   Spanish, from a fresh demo; plus a demo guide on the first screen (a setup checklist, as documented
   onboarding guides do) so a stranger needs no help.

## Done means
Tests (unit, integration, goldens, hooks, e2e with the acceptance test) green; typecheck and lint
clean; screenshots of every screen compared with its pattern file, differences listed; a second
opinion on the engine-message change (wage-rule code) and on the acceptance coverage.
