# Pattern: Settings › Notifications (per person)

Status: adopted — slice r (2026-10-17)
Reference product and screen: Linear — Settings › Account › Notifications
Source URL: https://linear.app/docs/notifications
Researched: 2026-10-17 (`docs/research/notifications-slice-r.md`). Confidence: high.

## Hierarchy
The settings column (`_components/settings.md`):
1. Title "Notifications"; one muted line: notices always reach the inbox; email is optional.
2. Section "Email": a panel with one row per kind of notice this person's role receives — the kind's
   name over a muted line saying when it comes; a switch on the right (Linear: per-type toggles).
3. Only the kinds the person's role receives are listed (Linear groups types).

## Interactions
- A switch saves at once and says so with a toast (Linear's toggles save immediately).

## States
- Loading: settings shape (`_components/loading.md`).

Deviations allowed: none
