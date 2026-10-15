# Pattern: Empty states (shared component)

Status: researched — LOW confidence, ready for owner review
Reference product and screen: Linear — empty list views
Source URL: https://www.saasui.design/pattern/empty-state/linear
Researched: 2026-10-15. Linear's own documentation does not describe empty states; the only source
is a third-party gallery of screenshots that look older than Linear's current interface.

## Hierarchy
1. The whole app frame and the view header (title, tabs, filter and display controls) stay in place.
2. In the content area, centered: a small icon, with one short line of text below it.
3. Only where a create action makes sense: an inline text link under the line (observed in the
   projects case). No description paragraph and no large button were observed.

## Interactions
- Filter and display controls stay usable while the view is empty.
- The inline link (when present) performs the create action.

## Not known from the references (ask the owner before building)
- Linear's current (2025–2026) empty-state design.

## Never copy
Linear's icons, illustrations or wording. Icons come from the shadcn/ui default icon set (lucide).

Deviations allowed: none
