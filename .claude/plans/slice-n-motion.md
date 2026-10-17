# Slice (n) — motion, hover, press and focus everywhere (decision 0037)

Status: planned (2026-10-17), waiting for the owner's "go"

## Plain summary
Every button, row, link, icon, menu, tooltip, dialog, tab and panel moves the same calm, quick way,
copied from GitHub's published design system (Primer), with IBM's (Carbon) filling the gaps:

- Pointing at anything clickable softly shades it in a tenth of a second and fades back when you
  leave.
- Menus, pop-ups, dialogs, side panels and messages glide in over 0.3s and leave faster (0.2s), as
  GitHub's rule says ("shorter than enter").
- Icons explain themselves with a small label that appears almost at once and vanishes the moment
  you move away — replacing the browser's plain grey boxes.
- Tabs slide their underline, sections open smoothly, switches glide, rows reveal their actions.
- Nothing bounces or jumps; people who turn on "reduce motion" on their device get fades only.
- Every control shows a clear ring when used with the keyboard (about a dozen don't today).

## Steps (tests first in each)
1. Tokens: CSS variables and Tailwind utilities in `globals.css`; reduced-motion rule; unit test
   `tests/unit/motion-tokens.test.ts` that fails on any raw `duration-N`, `ease-*` or `transition-all`
   in `src/` outside the token file.
2. Shared primitives (`src/components/ui`): button, badge, input, textarea, select, native-select,
   input-group, checkbox, switch, tabs (sliding underline), table row, sidebar, dropdown-menu,
   popover, select, combobox, tooltip (50ms delay, close at once), dialog, alert-dialog (24px rise),
   sheet, skeleton, sonner.
3. App pieces from the inventory: list rows (CSS hover), row actions fade, list side panel slides,
   page tabs underline slide, status tabs, calendar switch, setup guide and approval rows
   expand/collapse with turning chevrons, drop zones, chart bars highlight with a real tooltip,
   native `title` boxes → tooltips, missing keyboard rings (calendar switch, compliance nav, import
   kind picker, locale switchers, member buttons, collapse chevrons, panel expand link, "+N more",
   agenda rows, text links).
4. Page content fades in after navigation (Fluent's "quick fade").
5. Evidence: e2e `tests/e2e/motion.spec.ts` reads computed transitions on sample elements, checks
   tooltip timing and reduced motion; a short screen recording; all suites, typecheck, lint green;
   a second-opinion review of the diff.

## Done means
Tests green (unit, integration, goldens, hooks, e2e); typecheck and lint clean; recording and
screenshots of hover/focus states compared with the pattern file, differences listed in
`docs/screens/slice-n.md`.
