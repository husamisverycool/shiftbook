# Pattern: The worker app's frame (`/w`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Gusto mobile app (employee) — tabs at the bottom, a profile entry at
the top; Square Team app — Home with clock-in first
Source URL: https://support.gusto.com/article/207607681100000/gusto-mobile-app-employee-experience
Source URL: https://squareup.com/us/en/staff/shifts/features
Source URL: https://developer.apple.com/design/human-interface-guidelines/tab-bars
Researched: 2026-10-17 (`docs/research/workers-app-slice-t.md` §2, §4). Confidence: high for the
tabs and their contents; medium for spacing (not documented).

## Hierarchy
1. A slim top bar: the agency's name on the left; on the right the worker's initials, which open
   **More** (Gusto's Profile icon).
2. The screen's content in one column, at most 32rem wide, centred (a phone screen on a computer).
3. A tab bar fixed at the bottom with five tabs, each an icon over its label: **Home**, **Shifts**
   (with the count waiting for an answer; Square Team's and Instawork's schedule tab), **Time**,
   **Pay**, **Messages** (with the unread count). The current tab in the text colour, the others
   muted. **More** is the initials at the top right (Gusto's Profile), as the tab bar holds five at
   most (Apple Human Interface Guidelines, tab bars).
4. Until onboarding is done, Home leads with it (Gusto: the person's onboarding checklist first).

## Interactions
- A tab → its screen; the current one is marked for screen readers (aria-current).
- Page changes fade (decision 0037); nothing slides.

## States
- Not signed in → the sign-in screen (`w/sign-in.md`).
- The worker's language: Spanish when their preference is Spanish (SPEC §27); a link in More
  switches it and keeps it.
- Demo: the demo banner stays above.

Deviations allowed: none
