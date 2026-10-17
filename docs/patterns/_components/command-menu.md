# Pattern: Command menu (⌘K / Ctrl+K)

Status: adopted — decision 0038 (2026-10-17)
Reference product and screen: GitHub command palette (hierarchy, scope, prefixes, keyboard); Linear
command menu and search (recent items, ID search, contextual actions); Stripe Dashboard search (a
number jumps to its record); cmdk / shadcn Command (list, keyboard, roles)
Source URL: https://docs.github.com/en/get-started/accessibility/github-command-palette
Source URL: https://linear.app/docs/search
Source URL: https://docs.stripe.com/dashboard/search
Source URL: https://github.com/pacocoursey/cmdk
Source URL: https://ui.shadcn.com/docs/components/command
Researched: 2026-10-17 (`docs/research/command-menu-slice-p.md`). Confidence: high for GitHub and cmdk.

## Hierarchy
1. A dialog in the upper third of the screen (shadcn CommandDialog), no close button; a hidden title
   and description for screen readers.
2. The input row: a search icon; the scope chip(s) at its left (GitHub: "shows your location at the
   top left and uses it as the scope") — a client or worker when opened from its page or added with
   Tab; then the input.
3. The list, groups under small muted headings, separated when nothing is typed:
   - nothing typed: **Suggestions** for where you are (GitHub), **Recent** (Linear: recent issues),
     **Go to** (every sidebar destination and settings page the person may open), **Actions**;
   - typing: the same groups filtered, plus **Workers**, **Clients**, **Invoices**, **Job orders**,
     **Assignments** from the server, at most five each, active before ended (Linear's ordering);
   - `>` first: actions only; `#` first: invoices, job orders, assignments; `@` first: workers and
     clients; `?`: the help rows (GitHub's keystroke table, in our words).
4. Each item: leading icon, title (matched text marked, Linear), one muted line of context for
   records, the shortcut at the right when one exists (shadcn CommandShortcut).
5. Empty: one row saying nothing matches the typed text (cmdk). Loading: one muted row while records
   arrive (cmdk Command.Loading); a status line announces the count (Primer's filter results).

## Interactions
- ⌘K / Ctrl+K anywhere in the signed-in app toggles it (GitHub), also from inside a field; the
  sidebar's search row opens it, its shortcut shown as a kbd.
- ↑ ↓, Home/End, ⌘↑/⌘↓, Alt+↑/↓ (group), Ctrl+N/P (cmdk); Enter goes or runs; ⌘/Ctrl+Enter opens a
  record or page in a new tab; ⌘/Ctrl+C copies the highlighted record's or page's link (GitHub).
- Tab on a highlighted client or worker adds it to the scope; Backspace on an empty input removes
  the last scope; Esc closes (GitHub).
- An invoice number typed exactly jumps to that invoice on Enter (Stripe: "Use object identifiers …
  to take you directly").
- Actions are verb-first; one that opens a further step ends with "…" (GitHub). They follow the
  person's role: create a job order, upload timesheets, run this week's payroll, invite a member,
  switch language, keyboard shortcuts, sign out.
- Opens and closes with the dialog's motion (`_components/motion.md`).

- Pages also include Money's tabs (for the Owner), Collections, Connections, Notifications and Money
  settings; actions include "Publish the schedule…" for those who change placements (integration).

## States
- Signed-in app only. Nothing is ever searched by SSN or date of birth.
- Paused changes (decision 0036): actions that change records are hidden, as the screens hide them.

## Colour (decision 0046)

Worker and client results show their avatar (20px; circle or square) in place of the record icon (`_components/avatar.md`).

Deviations allowed: none
