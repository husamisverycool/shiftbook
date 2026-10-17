# 0038 — The command menu: GitHub's command palette on cmdk

Status: accepted (owner, 2026-10-17: SPEC §27 item 1; "draw purely from inspiration … be ambitious")
Date: 2026-10-17

## Context
SPEC §26 lists "Command palette → Linear ⌘K; Raycast". Research (`docs/research/command-menu-slice-p.md`)
found GitHub's command palette the best documented (opening, scope, prefixes, navigation versus
commands, keyboard), Linear's for recent items and ID search, Stripe's for jumping straight to a
record by its number, and `cmdk` — the library behind Vercel's menu and shadcn's Command — for the
list's keyboard and accessibility.

## Decision
1. **Library:** `cmdk` 1.1.1 (MIT, one small package, already the engine of shadcn's Command). Our own
   `src/components/ui/command.tsx` follows shadcn's Base UI flavour, inside our Base UI Dialog.
2. **Hierarchy (GitHub):** the scope chip at the input's left, the input, groups under headings —
   with nothing typed: the current context, recent items (Linear), then pages and actions. Records
   are searched on the server, tenant-fenced, never by SSN.
3. **Prefixes (GitHub's convention, mapped to Granite's records by GitHub's own meaning):** `>`
   actions (GitHub: command mode); `#` work records — invoices, job orders, assignments (GitHub: issues
   and pull requests); `@` people and companies — workers and clients (GitHub: users and
   organizations); `?` help.
4. **Keyboard:** GitHub's (⌘K/Ctrl+K toggles, Enter goes, ⌘/Ctrl+Enter opens a new tab, ⌘/Ctrl+C
   copies the link, Tab adds the highlighted client or worker to the scope, Backspace on an empty input
   removes it, Esc closes) plus cmdk's list keys.
5. **Secondary text** on a record (its client, status or week): GitHub's and Linear's published
   screenshots show one muted line of context beside each result; no text source documents it, so the
   owner's "draw from inspiration" stands as the approval.
6. **Recent items** are remembered in the browser (a per-person convenience; a cleared browser shows
   none).

## Consequences
- A visible trigger sits at the top of the sidebar with its shortcut, as Linear's search button.
- "View all results" (Stripe) is not built: Granite's lists already filter by text.
