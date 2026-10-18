# 0046 — Visual richness: one accent, warm neutrals, charts with hover, avatars, dark mode

Status: accepted for building three accent candidates; the owner picks one (indigo, blue or teal)
Date: 2026-10-17

## Context
The owner (2026-10-17): the screens look "bland, stale … flat, untitled-document-esque"; make them
"more dynamic and interesting to look at", "draw purely from inspiration … not too radical … don't
start from scratch". Decision 0029 left the app neutral grey on white with no accent, thin black
charts and no identity marks. Research `docs/research/visual-richness-slice-z.md` (27 sources read
2026-10-17) records how Linear, Stripe, Vercel Geist, Atlassian, GitHub Primer, Polaris, Carbon,
Apple and shadcn give their own product screens character — and where each says to stop.

## Decision (each item cites the research's source codes)
1. **One accent, in four shadcn tokens only** — `--primary`, `--ring`, `--sidebar-primary`,
   `--chart-1` (N1; Linear's three theme inputs "base color, accent color, and contrast", L1). It
   colours the one primary button per view, focus rings, checked controls, the active sidebar item's
   icon, the current tab's underline and the single chart series — never headings, navigation icons,
   status badges, backgrounds or secondary buttons (H1 "Refrain from adding color to the background of
   multiple controls"; A1). `--accent` stays neutral (hover surfaces, N1). Three candidates from
   Tailwind's default palette, chosen against documented constraints (no status meaning, white text
   ≥ 4.5:1): **indigo** (default), **blue**, **teal**, each with its dark-mode shades (research §13).
   The build reads `GRANITE_ACCENT` into `data-accent` on `<html>` so the owner can compare; the
   unchosen two are removed once the owner picks.
2. **Selected ≠ focused ≠ brand** (A1): the active sidebar item keeps its neutral tint and medium
   weight; only its icon takes the accent; focus is the accent ring.
3. **Warm neutral base** — Tailwind `stone`, which shadcn ships as a base colour (N1), following
   Linear's 2026 move from "a cool, blue-ish hue" to "a warmer gray that still feels crisp" (L2), with
   no contrast cost (stone-50/100 separate from white exactly as neutral does, research §12.9). The
   sidebar sits one step off the content panel and its inactive items are muted ("a few notches
   dimmer", L2; Geist Background 1 vs 2, G1). The step is stone-50, not stone-100: secondary text
   (stone-500) on stone-100 is 4.4:1, under AA, and the sign-in pages sit on the same surface.
   Text in the accent uses `--accent-text` (the light button colour; indigo/blue/teal-300 or -400 in
   dark), never `--primary`, which is a fill; the primary button's hover and press darken it solidly
   rather than fading it, so its label keeps its contrast.
4. **Charts** (Home, Margin): the current period in the accent, 2px, with one faint same-hue area
   fill on a single series only (C1, C2, P2); the period before dashed and neutral (S5; P2); hover
   shows a point, a vertical crosshair and a tooltip with both periods (P2 anatomy; N2; M1); bars in
   the accent, a loss in the destructive tone. Gridlines stay hairline grey (P2). The same numbers stay
   in a screen-reader table.
5. **Sparklines** under the Margin page's billed and margin figures: label → figure → small accent
   line, no axes (Stripe's KPI pattern, S4).
6. **Figures**: decision 0029 rule 13's 24px semibold for Home's Today and Margin's figures, and the
   overview cards (Stripe, Mercury).
7. **Avatars with initials**: people round, organisations (clients, the agency) rounded square (P1);
   one or two uppercase letters (G2), never "?"; the colour from a stable hash of the record's id into
   twelve Tailwind tint pairs that never use a status hue (Polaris: the same person always the same
   colour, Q1; A1 "Don't use an accent when the color has semantic meaning"); `{hue}-100`/`{hue}-800`
   light, `{hue}-900`/`{hue}-200` dark, each ≥ 6.4:1 (research §13). Sizes from Primer's scale
   (20–24px in rows, 32px in headers' lists, 40px beside a record title).
8. **A client's colour dot** — the same hash and hue as its avatar — beside the client's name in
   tables and the schedule (Linear and Attio show category colour as a small mark, not a filled tile;
   Linear removed coloured tile backgrounds in 2026, L2). Never on status.
9. **Dark mode**: Light / System / Dark under Settings › Account › Preferences, default System,
   kept per person (Geist G3, GitHub P3, Linear L3). Built by filling shadcn's `.dark` tokens, never by
   inverting (Mercury M1; Apple H1).
10. **Sign-in pages stay a centred single column** with the accent on their one primary button (X1:
    none of Linear, Vercel, Stripe, Mercury or Ramp splits the page).
11. **Restraint written into the pattern files** (§11 of the research): one accent-filled control per
    view, one gradient per chart, at most five series, category colour never on status, icons
    monochrome except status icons.

## Alternatives considered
- Coloured tiles behind navigation icons and figures: removed by Linear in 2026 (L2) and rejected by
  the owner in slice l (decision 0029).
- A split sign-in page with a brand panel: none of the five references uses one (X1).
- Amber, orange, green or emerald accents: they read as warning or success (C1, A2) and fail white
  text contrast (research §13).

## Consequences
- `src/components/shiftbook/avatar.tsx` is the one avatar; `docs/patterns/_components/color.md` and
  `avatar.md` are the rules; Home, Margin, workers, clients, members, schedule, command menu and portal
  pattern files name them.
- The `users.appearance` column (drizzle/0065) keeps the person's choice; the browser keeps it too
  so pages open in the right theme.
- Owner, 2026-10-18: "customize between different styles of colors … not just one choice". Each person
  picks their own accent — Indigo (default), Blue, Teal or Graphite (the neutral look before this
  decision, stone-900 / stone-200) — in Settings › Account › Appearance, as Linear ("custom themes by
  selecting base UI and accent colors", L2) and GitHub (Appearance, P3) allow. Kept in `users.accent`
  (drizzle/0066) and a `granite-accent` cookie so each page opens in it; GRANITE_ACCENT now only sets
  the default for people who have not chosen.

