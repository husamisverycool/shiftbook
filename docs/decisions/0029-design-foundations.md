# 0029 — Design foundations: Linear's frame and lists, Stripe's pages, Mercury's figures

Status: accepted
Date: 2026-10-16

## Context
The owner (2026-10-16): the screens look professional but lack "gravity"; take them "to the next
level", drawn purely from excellent products, not radical. A first pass mixed rules from many design
systems into shapes of our own (boxed number cards on every list, a grey sentence under each title,
dotted status pills, dashed empty boxes). The owner's review: it "looks vibe coded" — "everything
should be drawn purely from inspiration". So this decision takes each piece from a screenshot the
product itself published, listed with its source in `docs/research/design-gravity-slice-l.md`
part C (parts A and B keep the written guidelines that agree with them). shadcn/ui and Tailwind stay
the neutral base; no reference's colors, icons, illustrations, names or wording are copied.

## Decision
One look, three products, each where SPEC §26 points to it.

1. **Frame — Linear** (`_layouts/app.md`): the sidebar on the app's dim tone; each page is a rounded
   content panel nested in it (Linear's "App / Location bar / View bar / Content"; shadcn's `inset`
   sidebar is that structure). Sidebar sections are muted labels at the items' own size (Linear's
   "Workspace", "Favorites"; Stripe's "Shortcuts", "Products"): Home first, then Payroll, Billing,
   Staffing, Oversight.
2. **Pages — Stripe** (`_components/page-header.md`): a large bold title with the page's buttons on
   the right — the one primary button last — and underline tabs under it (Stripe invoices list,
   Stripe app overview page). No sentence under the title unless the reference shows one (a detail
   page's key facts, as Stripe's detail header does); a read-only notice stays.
3. **Lists of records — Linear** (job orders, assignments; `job-orders.md`, `assignments.md`): the
   rows run edge to edge with hairline dividers, groups are full-width tinted bands with a count,
   filters are chips — as Linear's list view; the page title follows rule 2 so every page starts the
   same way.
4. **Tables — Stripe** (`_components/table.md`): full width with no box around them; column headers
   in small capitals, semibold; the amount bold; "—" for an empty value; a "…" menu at the row's
   end.
5. **Status — Stripe** (`_components/status.md`): a small tinted badge with the word only — no dot,
   no icon (Stripe's Paid/Draft badges; Geist "Don't add checkmarks or X icons"). Tones from
   Tailwind's default palette, one meaning each: neutral, info, success, warning, critical.
6. **Figures — Stripe Home and Mercury** (`_components/key-figures.md`): plain type, never boxed — a
   small muted label over the figure, a short muted line under it when the reference has one, set in
   a row with space between (Stripe Home "Today", Stripe's "Program summary", Mercury's headline
   figure with its money-in/money-out rows). Only where the page's own reference shows figures:
   Home, Margin, Receivables.
7. **Charts — Stripe and Mercury**: on Home, in white cards on a light grey band (Stripe's "Your
   overview"), each with a semibold title, the figure, a line or bars with hairline gridlines, and a
   "View more" link; elsewhere (Margin) the same chart under its heading without the card. Gridline
   values on the right; bars from zero, a loss below the zero line.
8. **Home — Stripe Home, with Polaris's setup guide** (`home.md`): the setup guide on top for the
   Owner; "Today" (the pay period now, its figures, and a right column of balances with View links);
   "Your overview" (the 13-week charts); what needs attention as Stripe surfaces notifications.
9. **Empty states — Linear and Stripe** (`_components/empty-state.md`): an icon, one line saying what
   is missing and what to do, and the one action — no box, no tinted circle.
10. **Record pages — Stripe detail page** (`_components/record-page.md`, added after the owner asked
    on 2026-10-16 for pages that fill comfortably, drawn only from references): ancestors above the
    title (never a back arrow), the title with its status, one line of facts, the actions on the
    right; the record's content on the left and its details as label-over-value on the right; each
    module a heading over a hairline, never a card. Invoice, client, job order, worker, compliance
    duty and client approval pages all use it, so every record behaves the same.
11. **Settings — Linear settings** (`_components/settings.md`; Linear's own screenshots of
    Preferences, Notifications, Team permissions and access, the SAML domains and API keys lists, and
    the SAML setup, published at linear.app/docs/account-preferences, /notifications, /members-roles,
    /saml-and-access-control, /api-and-webhooks, /invite-members and /scim): one centred column, 688px
    on every settings page (Linear's 640px at its 13px type, scaled to our 14px), the title in the same
    place (rule 2); each section a heading (16px, medium) with one muted line under it and, at the
    heading's right, its add action; under it the section's rows **inside a rounded bordered panel**
    (`rounded-lg border bg-card`, 16px padding) — each row at least 60px tall, the label (14px, medium)
    over a muted 13px line on the left, the control (select, switch, input, figure or text action) on
    the right, vertically centred, a hairline between rows stopping at the panel's padding; a list's
    rows lead with a 32px tile or initials; an empty panel is one muted row; a form sits in a padded
    panel whose foot (a hairline, the note at the left, the actions at the right) holds its Save.
    Sections are 48px apart; panels within a section 12px. Members follows Linear's Members list: the
    search and Filter at the left and Invite at the right on one line, then the people as rows with
    hairlines between them. Activity, a log, keeps its Stripe Workbench panes (`settings/activity.md`).
12. **Wizards — Attio import and QuickBooks Online upload**: ancestors and title as rule 10, then the
    numbered steps (done ones ticked, the current one bold), one step at a time; the bank import and
    the placement import share it.
13. **Type**: Geist (already the app's font). Title 28px bold; section headings 18–20px semibold
    (settings: 16px medium, rule 11); body 14px; labels 13px muted; figures 24–28px semibold with
    tabular digits (Stripe; Mercury).

## Alternatives considered
- The first pass's composite rules (boxed figure grids, dotted pills, tinted headers, dashed empty
  boxes): rejected by the owner as not drawn from any product.
- Linear's small location-bar title on every page: Linear's own lists use it, but most Shiftbook
  screens follow Stripe; one title style keeps the app coherent, and Linear's list rows keep their
  shape under it.
- Polaris's grey canvas with boxed cards: not what Linear's or Stripe's screenshots show.

## Consequences
- Every page and pattern file names which screenshot it follows; differences are listed in
  `docs/screens/slice-l.md`.
- After signing in, people land on Home (`/`), not Convert timesheets.
- Spanish screens write money the US way ("$1,234.56", CLDR's US Spanish), as US pay stubs and banks
  do and as the explanations already group numbers (decision 0028).
- The setup guide's "hidden" is a cookie on that browser (a convenience, not a record).
