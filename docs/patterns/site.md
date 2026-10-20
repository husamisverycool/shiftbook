# Pattern: Website home (tabulado.com)

Status: adopted — slice aa, fifth design (2026-10-20). The owner found the fourth design's product
drawings "a draft of an app" and asked for drawings that look like a fully built, modern app, and for a
page whose colours and motion flow as it scrolls. The page keeps the fourth design's parts and adds the
app as the references draw theirs: Linear's hero (the real app frame, dark, at its own density, playing a
flow by itself), Attio's pinned product tour, and Apple's and Stripe's colour that changes behind the page
as the reader moves. Earlier rounds: `.claude/plans/website-v3.md`, `docs/research/website-visual-slice-aa.md`.
Reference product and screen: Linear (the app frame: workspace switcher, search with ⌘K, grouped areas
with counts, breadcrumbs, view bar, list with status circles, labels, IDs, avatars, a record panel with
properties and activity; the inbox's list beside the open item; the hero's lit floor and headline from a
blur; FIG drawings; dark chapters with a page-wide scene and a features row); Raycast (the command menu
with grouped results and keys); Attio (pinned tour: numbered steps on the left with a filling bar, the app
on the right changing screen); Stripe (dashboard tiles with sparklines; invoice beside its list; country
tabs; odometer; Connect's flow; bento with the pointer's border light; the indigo band with its burst of
light; the drifting colour band; page rails); Vercel (a build log with its summary under it); Cursor and
Granola (a self-playing window with a step bar that fills); Check (the product leaning back and
flattening as the page scrolls); Mercury (photo hero, frosted email field, docked disclosure, security
trio, close, footnotes); Ramp (the pinned tangle pulled into order); Apple (fanned phones with a switch;
colour changing behind the page; parts moving at their own speed); Column (a map with the covered places
lit); Cursor (product windows standing on public-domain paintings).
Source URL: https://linear.app
Source URL: https://linear.app/method
Source URL: https://www.raycast.com
Source URL: https://attio.com
Source URL: https://stripe.com
Source URL: https://stripe.com/payments
Source URL: https://stripe.com/connect
Source URL: https://stripe.com/invoicing
Source URL: https://vercel.com
Source URL: https://cursor.com
Source URL: https://www.granola.ai
Source URL: https://www.checkhq.com
Source URL: https://mercury.com
Source URL: https://ramp.com
Source URL: https://www.apple.com/airpods-pro/
Source URL: https://www.apple.com/iphone-18-pro/
Source URL: https://column.com
Researched: 2026-10-20. Confidence: high for structure; motion timings are typical values.

## The app on the page (`src/components/site/app/`)
Every drawing of the product is built from one kit at Linear's density (13px rows, hairlines, quiet
icons), in a light theme (the tour, the bento) and a dark one (the hero), and shows sample data:
- Frame: the window's three dots and title; the sidebar as the real app groups it (agency switcher,
  Search ⌘K, Home, Inbox with a count, To check with an amber count; Payroll: Weeks, Pay runs, Payroll
  files; Billing: Client approvals, Invoices; Staffing: Workers, Clients, Schedule; the person at the
  foot); a header of breadcrumbs and actions; an optional view bar (tabs with counts, Filter, Display); an
  optional record panel. The frame sizes itself to its own width (sidebar and panel drop away when narrow).
- Pieces: status circles (new, reading, needs a person, ready, done), source tiles (email, text, photo,
  clock, spreadsheet, client portal), labels with a dot, soft badges, grey IDs, initials avatars, keys,
  a "sure" bar, quiet and filled buttons, property rows, sparklines.
- Screens: Inbox (Linear's: what came in, each with its source and status, beside the open item and the
  hours read from it, the doubtful cell marked, "Add to the week ⏎"); Week (Linear's list grouped by
  client, the doubtful cell with a popover of both readings and "Keep 8 [1]", the worker's record panel
  and activity); Pay run (Stripe's tiles over a table, one worker open on the real engine's lines with
  their reasons, the total rolling); Client approvals (Attio's list with states, and what the client
  sees); Invoices (Stripe's invoice beside its list); Payroll file (Vercel's log of the real exporter's
  file with a tab per system, its checks beside it and its control totals under it); ⌘K (Raycast's menu).

## Hierarchy
1. Hero: Mercury's photograph darkening into the ink band; the two headline lines arriving from a blur;
   one lead sentence; the frosted email field with "Start free" inside it and a frosted "Try the demo".
   Under it the app in its dark theme on Linear's lit floor, leaning back and flattening as the page
   scrolls (Check), playing a Monday by itself: hours arrive in the inbox and are read twice; ⌘K opens and
   types "week"; the week opens on the doubtful cell and a person keeps 8 (the activity gains the line);
   the pay run fills from the engine; the payroll file is written. The key pressed shows in a chip at the
   frame's foot (Linear). Below the frame Cursor's step bar (four steps, each with a sentence) fills with
   the play; pressing a step holds it; a pause button. Mercury's disclosure docked on the frame's foot.
2. Stripe's row of payroll systems' names; Linear's statement and FIG 0.1–0.3 (layers lift on hover).
3. Monday at a staffing agency (Ramp): pinned; the tangle of loose ends pulls into one week.
4. One week, start to finish (Attio's tour): pinned for six steps — Inbox, To check, Pay run, Client
   approvals, Invoices, Payroll file. Left: the numbered steps, the current one bright with its sentence
   opened and its bar filling as the reader scrolls; pressing one scrolls to it. Right: the app in its
   light theme changing screen with each step (each screen arriving from a blur), the screen's own small
   motion (rows arriving, a person keeping 8, lines filling, a client approving, the file's system
   changing), on a soft field of colour whose hue changes with the step (Stripe). Phones: no pin; each
   step's words, then its screen.
5. Stripe's bento with the border light: each card a piece of the app on a field of colour or a
   painting (Cursor): the two readings with Keep 8 / Keep 6; one pay line with its law; the payroll file;
   one invoice per client; approval by link; the worker app's phones (Apple's switch); the covered states.
6. Stripe's indigo band: four product facts with gradient numerals; the burst of light below, drifting
   against the scroll.
7. Linear's chapters on the night band: the same week paid in four states (the engine's lines, chart and
   odometer) with the dated rule changes as Linear's changelog; where the week goes (Stripe Connect's
   flow and the real files). Each has a features row of disclosures.
8. Mercury's security trio; the close on Stripe's drifting colour band; two cards; footer.

## Scroll
- Colour that flows (Apple, Stripe): the page is three groups of one lightness each — dark (hero → FIG
  band, ink → deep navy), light (Monday → tour → bento, paper → cool lavender → paper), dark (indigo band →
  night chapter → teal-black chapter → ink close). Each group has one background that fades to the colour
  of the part in the middle of the screen. Light and dark never fade into each other.
- Arrivals (Linear, Attio): headings, cards and scenes come in from a blur and a short rise the first
  time they reach the screen; bento cards and the security trio one after another.
- Speed (Apple): the indigo band's burst drifts against the scroll; the hero frame flattens.

## Interactions
- Plays and loops run only while on screen; every one holds still under reduced motion (the hero shows
  its last step; the tour's screens change without moving; nothing hides or drifts).
- Tabs (states, payroll systems) are Base UI tabs: arrow keys move between them. The hero's and the
  tour's steps are buttons.
- The bento's border light follows a mouse pointer only.

## States
- No demo address: "Try the demo" becomes "See how it works" and scrolls to Monday.
- Owner, 2026-10-20: no photographed or drawn timesheets anywhere on the site.
- Spanish: every word in Spanish (usted); the exporters' clerk notes are not shown; sample names and
  figures stay; the worker-app phones open in Spanish.
- The site keeps its own palette under a dark system setting.
- Without the page's script everything shows, on each group's first colour.

Deviations allowed: none
