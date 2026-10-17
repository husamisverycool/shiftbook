# Pattern: Motion, hover, press and focus (shared, every screen)

Status: adopted — decision 0037 (2026-10-17; the owner said "go")
Reference product: GitHub Primer motion tokens (the one system that names a token for each kind of
interaction); IBM Carbon motion where Primer is silent; Apple's Human Interface Guidelines and WCAG
2.2 for reduced motion
Source URL: https://github.com/primer/primitives/tree/main/src/tokens/functional/motion
Source URL: https://github.com/primer/react/tree/main/packages/react/src/TooltipV2
Source URL: https://carbondesignsystem.com/elements/motion/overview/
Source URL: https://carbondesignsystem.com/elements/motion/choreography/
Source URL: https://developer.apple.com/design/human-interface-guidelines/motion
Source URL: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
Researched: 2026-10-17, values read live from each source (`docs/research/motion-slice-n.md`).
Confidence: high for Primer and Carbon values (their own token and style source).

## Hierarchy
The four kinds of movement, each with one duration and one curve (Primer's functional tokens):

| Kind | When | Duration | Curve |
|---|---|---|---|
| Hover | colour or background change under the pointer; focus ring appearing | 100ms | `cubic-bezier(0.25,0.1,0.25,1)` |
| State change | switch, checkbox, expand/collapse, tab underline, a row action appearing | 200ms | `cubic-bezier(0.6,0,0.2,1)` |
| Enter | menu, popover, select list, tooltip, dialog, sheet, toast, side panel appearing | 300ms | `cubic-bezier(0.3,0.8,0.6,1)` (decelerating) |
| Exit | the same leaving | 200ms — "shorter than enter" | `cubic-bezier(0.7,0.1,0.75,0.9)` (accelerating) |

Primer's ceiling: nothing in the interface moves for longer than 300ms; never over 500ms.

## Interactions
1. **Hover** (buttons, rows, links, sidebar items, chips, icon buttons, tiles): the background or
   colour eases in over 100ms and eases back over the same 100ms when the pointer leaves — every
   reference uses one transition that reverses; none documents a different hover-out.
2. **Press**: the pressed colour, nothing that scales or jumps (no web reference documents a press
   animation; the 1px nudge on buttons goes).
3. **Focus**: the ring appears with the hover timing; it is always shown for the keyboard, motion or
   not (WCAG).
4. **Tooltips** (Primer React): open 50ms after the pointer arrives, fade in over 100ms; close at once
   when the pointer or focus leaves. Keyboard focus opens them with no delay. Icon-only buttons and
   truncated names get a tooltip instead of the browser's plain `title` box.
5. **Menus, popovers, select lists**: Enter 300ms (fade and a short move away from the trigger),
   Exit 200ms. The move is 4px (Polaris appear-below: one space unit); no scaling.
6. **Dialogs**: the dim layer fades; the dialog fades and settles 24px down into place (Carbon modal:
   the container moves from -24px to 0) — Enter in, Exit out back up. **Sheets and the list's side panel** slide from their edge with the same pair.
7. **Toasts**: Enter in, Exit out (Carbon: exit easing for "closing a modal or toaster").
8. **Expand/collapse** (setup guide, approval rows, list groups): the chevron turns and the body opens
   with the state-change timing.
9. **Tab underline** (page tabs): slides to the chosen tab with the state-change timing (Primer lists
   "tab-switch" under it).
10. **Row actions** (a list row's checkbox and preview button): fade in on hover with the
    state-change timing.
11. **Loading**: spinners turn linearly; skeletons pulse slowly (Carbon: 3000ms, ease-in-out).
12. **Page content** after navigation: appears with a quick fade, no slide (Fluent: "a quick fade
    instead of moving or sliding").

## States
- **Reduced motion** (the device's setting): every movement becomes a plain fade or nothing (Apple:
  replace movement with fades); skeletons and the tab slide stop; colours still change.

## Never
Bounces, springs, scale-on-press, parallax, anything over 500ms, a duration or curve not in the
table above.

Deviations allowed: none
