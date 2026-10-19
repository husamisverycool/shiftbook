# Pattern: Notifications (inbox)

Status: adopted — slice r (2026-10-17)
Reference product and screen: Linear — Inbox (sidebar entry, list of notifications, unread first,
keyboard actions)
Source URL: https://linear.app/docs/inbox
Source URL: https://linear.app/docs/notifications
Researched: 2026-10-17 (`docs/research/notifications-slice-r.md`). Confidence: high (Linear's docs).

## Hierarchy
1. Sidebar: "Notifications" item with a bell, at the top of the list under Home, with the unread
   count as the item's badge (Linear: the Inbox in the sidebar with its badge count).
2. Page header (`_components/page-header.md`): the title; actions on the right: "Mark all read",
   "Delete read".
3. Tabs: Unread, All (Linear's Priority / Other split is replaced by unread / all: Tabulado has no
   priority filter — listed as a difference).
4. The list (`_components/table.md` rhythm, Linear rows): one row per notice — an unread dot at the
   left edge for unread rows (Linear marks unread), the notice's icon by kind, one line of what
   happened, the thing it is about in muted text, and the time on the right. Unread rows first.
5. Empty: `_components/empty-state.md` — the bell icon, "No notifications".

## Interactions
- Click a row (or Enter) → marks it read and opens the thing it is about.
- `J` / `K` or arrows move; `U` marks the selected row read or unread; `Alt`+`U` marks all read;
  `Backspace` deletes the selected row; `Shift`+`Backspace` deletes all read (Linear's keys).
- `G` then `N` goes to Notifications from anywhere (Linear: `G` then `I` — `I` is taken by Invoices).

- Three more kinds (integration, SPEC §27): a worker confirmed a shift in the worker app; a client asked
  for workers in its portal; a worker wrote in the worker app. Each goes to the roles that act on it
  (placements; the worker app's messages) and opens the schedule's week, Job orders, or the worker's
  Messages tab.
- Timesheets by email (slice y, decision 0042): to whoever converts timesheets (hours ability); a filed
  email opens its week, a held one opens Settings › Connections at the forwarding section.
- One more kind (completeness audit G1): a pay run is ready to look over. It goes to the roles that
  run payroll and opens the week's Totals step.

## States
- Loading and errors: `_components/loading.md`, `_components/error.md` (list shape).

Deviations allowed: none
