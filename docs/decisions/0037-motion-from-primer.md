# 0037 — Motion, hover, press and focus from Primer's motion tokens (Carbon where Primer is silent)

Status: accepted (owner: "go", 2026-10-17)
Date: 2026-10-17

## Context
The owner (2026-10-17): make the whole app seamless down to the smallest thing — what happens when
the pointer rests on an icon and when it leaves — drawn from successful products, not taste. SPEC
§26 forbids animations from taste. Today the motion is shadcn's mix: `transition-all` with no stated
duration, 100ms pop-ins for every menu and dialog, tooltips with no delay and no fade timing, a 1px
press nudge, rows highlighted with no transition, a side panel and accordions that jump, no
reduced-motion handling, and about a dozen controls with no visible keyboard focus.

Research (`docs/research/motion-slice-n.md`, values read live on 2026-10-17) compared Carbon,
Polaris, Material 3, Fluent 2, Primer, Apple and WCAG. Only GitHub Primer names a token for each kind
of interaction (hover, state change, enter, exit) with a written rule for each.

## Decision
1. Primer's functional motion tokens are the app's only durations and curves (pattern file
   `_components/motion.md`): hover 100ms, state change 200ms, enter 300ms, exit 200ms.
2. Carbon fills what Primer does not state: the dialog's 24px settle, the skeleton's slow pulse, the
   toast's exit easing. Fluent: navigation fades rather than slides.
3. Tooltips follow Primer React: 50ms delay, 100ms fade in, close immediately.
4. The tokens live once, as CSS variables in `globals.css` with Tailwind utilities; a unit test fails
   if a component uses a raw duration or curve (as rule values live in tables, not literals).
5. `prefers-reduced-motion: reduce` turns movement into fades (Apple; WCAG 2.2 C39).

## Alternatives considered
- Carbon throughout: well documented, but its 70ms hover reads as instant and its menus use
  `max-height` motion; Primer's set is simpler and states its own rules.
- Radix's 700ms tooltip delay: makes icon labels feel slow; Primer's 50ms is GitHub's shipped default.
- A different hover-out: the owner asked about it; no reference documents one, so the same
  transition reverses. The difference people see on leaving is in overlays, whose exit is shorter
  and accelerating.

## Consequences
- Every ui primitive and the app's own rows, tabs, chips and panels use the tokens.
- Motion cannot be shown in a screenshot; the e2e test reads the computed transition of a sample of
  elements and the reduced-motion result instead, and a short screen recording is attached.
