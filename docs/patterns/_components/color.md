# Pattern: Colour — one accent, warm neutrals, dark mode (shared, every screen)

Status: adopted — decision 0046 (2026-10-17); the accent hue is the owner's pick of three
Reference product: Linear's theme inputs and 2026 refresh; shadcn/ui theme tokens; Atlassian colour
roles; Apple HIG colour; Vercel Geist and GitHub Primer theme switching
Source URL: https://linear.app/now/how-we-redesigned-the-linear-ui
Source URL: https://ui.shadcn.com/docs/theming
Source URL: https://atlassian.design/foundations/color-new
Source URL: https://developer.apple.com/design/human-interface-guidelines/color
Source URL: https://vercel.com/geist/colors
Source URL: https://primer.style/product/getting-started/foundations/color-usage
Researched: 2026-10-17 (`docs/research/visual-richness-slice-z.md`). Confidence: high.

## Hierarchy
1. **Neutrals**: Tailwind `stone` — the white content panel on a stone-100 sidebar; borders stone-200;
   secondary text stone-500 (Linear: "a warmer gray that still feels crisp"; shadcn's Stone base).
2. **One accent** (indigo, blue or teal; `data-accent` on `<html>`) in `--primary`, `--ring`,
   `--sidebar-primary` and `--chart-1` only. It colours: the one primary button of a view, focus rings,
   checked checkboxes and switches, the active sidebar item's icon, the current tab's underline, a
   single chart series and its area fill, sparklines.
3. **Never in the accent**: headings, navigation icons other than the active one, status badges
   (`_components/status.md` keeps its five tones), page backgrounds, secondary buttons, hover
   surfaces (`--accent` stays neutral).
4. **Dark mode**: every token has a dark value (shadcn `.dark`, stone 950/900/800); the accent's dark
   shades from the research (§13). Status tints and avatar tints have their own dark pairs.

## Interactions
- Settings › Account › Preferences › Appearance: System (default), Light, Dark — applied at once,
  kept for the person and in the browser.

## States
- A screen with two primary actions shows one in the accent and the other as an outline button.

## Never
More than one accent-filled control per view; colour without a second cue for meaning; a gradient
on more than one series; a hue from the status tones as an accent or avatar colour.

Deviations allowed: none
