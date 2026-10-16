# Pattern: App frame with sidebar (`src/app/[locale]/(app)/layout.tsx`)

Status: adopted — decision B4 (2026-10-15, under the owner's "do everything")
Reference product and screen: Linear — sidebar and keyboard navigation
Source URL: https://linear.app/enablement/guide/navigating-linear
Source URL: https://linear.app/docs/custom-views
Source URL: https://linear.app/docs/display-options
Source URL: https://linear.app/docs/workspaces
Researched: 2026-10-15. Confidence: high for the sidebar's role, its sections and the navigation
shortcuts; low for widths, icons and collapse behavior on narrow screens (not documented).

## Purpose in Shiftbook
The frame around every app page (converter, job orders, assignments, import): one place to move
between areas, the same on every page, inside the root frame (demo banner above it).

## Hierarchy
1. **Sidebar** on the left, full height under the demo banner:
   1. Workspace name at the top (Linear: the workspace menu at the top of the sidebar). In Shiftbook:
      the agency's name, a button that opens a menu with **Settings** (Linear: "Click your workspace
      name in the upper-left corner and select Settings"). Settings opens the payroll file settings
      (slice f), the first settings page.
   2. The personal and workspace areas as a vertical list of links (Linear: Inbox, My issues, then
      the workspace's views). In Shiftbook, in build order: Convert timesheets, Job orders,
      Assignments, Client approvals (slice d), Invoices, Clients (slice g).
   3. The current area's link is highlighted.
2. **Page** to the right of the sidebar: the route's own pattern.

## Interactions
- Click a sidebar link → that area.
- Keyboard (Linear "G then a letter" to jump): G then C → Convert timesheets, G then J → Job orders,
  G then A → Assignments, G then P → Client approvals (A is taken; P as in "approval"), G then I → Invoices, G then L → Clients (C is taken; L as in "cLients"). Not
  active while typing in a field.
- `?` opens the list of keyboard shortcuts (Linear).

## States
- Narrow screens: not documented by Linear for the web app. Shiftbook uses shadcn's sidebar default
  (collapses behind a menu button) — listed as a difference.

## Not known from the references (ask the owner before building)
- Icons per link, sidebar width, whether the sidebar can be collapsed on desktop.

## Never copy
Linear's wording, icons, colors or logo.

Deviations allowed: none
