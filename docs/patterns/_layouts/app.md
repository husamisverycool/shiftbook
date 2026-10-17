# Pattern: App frame with sidebar (`src/app/[locale]/(app)/layout.tsx`)

Status: adopted — decision B4 (2026-10-15, under the owner's "do everything"); frame, groups and Home
added by decision 0029 (2026-10-16)
Reference product and screen: Linear — sidebar and keyboard navigation; Stripe Dashboard — sidebar
sections and Home; shadcn/ui sidebar (inset variant) as the neutral base
Source URL: https://linear.app/enablement/guide/navigating-linear
Source URL: https://linear.app/docs/custom-views
Source URL: https://linear.app/docs/display-options
Source URL: https://linear.app/docs/workspaces
Source URL: https://linear.app/docs/inbox
Source URL: https://linear.app/now/behind-the-latest-design-refresh
Source URL: https://docs.stripe.com/dashboard/basics
Source URL: https://developer.apple.com/design/human-interface-guidelines/sidebars
Source URL: https://ui.shadcn.com/docs/components/sidebar
Researched: 2026-10-15 and 2026-10-16. Confidence: high for the sidebar's role, its sections and the
navigation shortcuts; medium for the inset sheet (shadcn's documented variant; Linear's refresh
describes the dimmer sidebar and softer structure, not the sheet itself).

## Purpose in Granite
The frame around every app page: one place to move between areas, the same on every page, inside the
root frame (demo banner above it).

## Hierarchy
1. **Sidebar** on the left, full height under the demo banner, on the frame's dim tone (Linear's
   refresh: a sidebar "a few notches dimmer", inactive items muted):
   1. Workspace name at the top (Linear: the workspace menu at the top of the sidebar). In Granite:
      the agency's name, a button that opens a menu with **Settings** (Linear: "Click your workspace
      name in the upper-left corner and select Settings"). Settings opens the payroll file settings
      (slice f), the first settings page; Margin settings (slice i) is the next item, for the Owner
      and the accountant; Compliance settings (slice j) after it, for everyone (only the Owner
      changes them); Members (slice k) after it, for everyone (only the Owner manages them); Single
      sign-on (decision 0033) after it, for the Owner only (Linear and Notion keep it with the
      workspace's security and members settings, for owners and admins);
      Activity (slice k, the agency's log) after it, for the Owner and the accountant;
      Billing (decision 0036; Linear's Administration › Billing, Vercel's Settings › Billing) after it,
      for the Owner only.
      Below a separator, the person's own items (slice k): their name and role (not a link),
      **Your account**, and **Sign out**. Linear's docs do not say where its log-out item sits —
      listed as a difference.
   2. **Home** first, alone (Stripe: the sidebar's first section starts with Home).
   3. The areas in groups, each under a short muted label, two levels at most (Stripe's sidebar
      sections; Apple "succinct, descriptive labels to title each group", "No more than two levels";
      Linear's sections):
      - **Payroll**: Convert timesheets, Client approvals (slice d);
      - **Billing**: Invoices, Receivables, Payments, Bank (slices g, h);
      - **Staffing**: Job orders, Assignments, Workers (slice k), Clients (slice g);
      - **Oversight**: Margin (slice i; the Owner and the accountant only, SPEC §2), Compliance
        (slice j) with a badge count of the duties overdue or due soon (Linear's "count or dot").
   4. The current area's link is highlighted.
   5. At the foot of the sidebar, **Keyboard shortcuts** with its key (`?`) (Stripe: "press the
      question mark key (?) for a list of available keyboard shortcuts").
2. **Page** to the right of the sidebar, on a raised sheet with large rounded corners and a hairline
   edge (shadcn's `inset` variant; decision 0029 rule 1): the route's own pattern, starting with its
   page header (`_components/page-header.md`).

## Interactions
- Click a sidebar link → that area.
- Keyboard (Linear "G then a letter" to jump): G then H → Home, G then C → Convert timesheets, G then
  J → Job orders, G then A → Assignments, G then P → Client approvals (A is taken; P as in
  "approval"), G then I → Invoices, G then L → Clients (C is taken; L as in "cLients"), G then R →
  Receivables, G then Y → Payments (P is taken; Y as in "paYments"), G then B → Bank, G then M →
  Margin, G then O → Compliance (C is taken; O as in "Obligations"), G then W → Workers. Not active
  while typing in a field.
- `?` (or the sidebar's Keyboard shortcuts) opens the list of keyboard shortcuts (Linear, Stripe).
- ⌘K / Ctrl+K, or the search row under the workspace menu (Linear's search button), opens the command
  menu (`_components/command-menu.md`, decision 0038); the shortcuts list names it.
- After a navigation the content panel fades in (Fluent: "a quick fade transition instead of moving
  or sliding"; Primer's 200ms; `_components/motion.md`, decision 0037); the sidebar stays still.

## States
- Changes paused (decision 0036: the agency's subscription is not active after its free days): the
  screens hide every change, as for the accountant, and a page's "only these roles change this" line
  says instead that changes are paused and the Owner can restart the subscription in Settings › Billing
  (the role line would be wrong for the Owner). Home's banner says why (`home.md`).
- Narrow screens: not documented by Linear for the web app. Granite uses shadcn's sidebar default
  (collapses behind a menu button; the sheet fills the width) — listed as a difference.

## Never copy
Linear's or Stripe's wording, icons, colors or logo.

Deviations allowed: none
