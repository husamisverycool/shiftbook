# Slice (b) — Job orders, assignments, rate cards

Status: GO — the owner said "approve all goldens and do everything" on 2026-10-15, after slice (a).
Choices the research left open were made under that instruction and the owner's earlier "go and do
what you think is best but … rely on inspiration from great products" (each is listed under
"Decisions made for the owner"; the owner can reverse any of them).
Contract: SPEC.md §4 (JobOrder, RateCard, Assignment), §8, §21, §26. Research with sources:
pattern files below (copied from the research notes, every claim with its URL).

## Progress (2026-10-15)
- Built and tested: job orders (list, page, create/edit), rate card versions with paid-week
  protection and markups, a worker's own rates, assignments (list, assign, end, cancel), the
  placement import (Bullhorn, JobAdder, Spott; SSN and birth-date columns removed), the sidebar
  frame. 289 unit/integration/golden tests and 14 browser tests pass; screens compared in
  `docs/screens/slice-b.md`.
- First outside review fixed (ended assignments, rate input checks, amounts, markup explanation).
- Second review fixed (sensitive columns, strict import rates, one client per timesheet).
- Third review fixed: a file without a header row is refused before anything is kept; removed
  columns are kept by position with why and shown on Match columns; Excel dates exact and the
  date order a choice; old dates remove a column only when most are old and never the start or end
  date; Excel SSN numbers keep their zeros; more SSN/birth-date spellings and formats; ZIP+4 kept;
  source row numbers; review names the other client and offers "Confirmed with the client";
  held entries are medium confidence.
- Fourth review fixed: attaching hours to another client is its own named choice (never an edit
  reason); headerless files with time-of-day dates refused; an empty Excel heading no longer
  fails; dates with times, year-first and dotted dates read; more birth-date spellings (Spanish,
  French, German, month names with dashes, weekdays); a month and year is not a date; birth
  dates hidden in filenames; each bill line explains only its own shifts. 444 tests, 16 browser
  tests pass.
- Fifth review fixed: date reading in the import can no longer be slowed by a long cell (bounded,
  anchored patterns; long cells skipped); dates with a time zone, month names, French and German
  spellings, "geb.", "F.N.", 8-digit dates; names like "Dobson" no longer look like "DOB"; every
  number in a removed heading hidden; a timesheet whose client is unclear also needs the explicit
  "Attach to {client}"; once attached, later fixes keep the entry there; the history shows the
  attach in the reader's language. 480 tests, 16 browser tests pass.
- Sixth review fixed: id columns are no longer removed as birth dates (dates must be most of the
  cells with digits; 8-digit numbers and short spaced numbers count only next to a birth word);
  "L4" only beside id words; every digit in a removed heading hidden (except the "4" of "Last 4");
  more birth-date spellings in free text ("dob01/02/1990", "FN …", "YOB 1990", "geb …", named time
  zones); start dates like "19-Oct-26", "Mon, Oct 19, 2026" and French and German months read; a
  timesheet with no client says so, names the client and offers the attach before a failed save;
  a worker at two other clients gets one "Attach to" per client; an attach to a client with no
  assignment that day is refused (the hours stay put); the kept client holds only for the same
  worker; pages no longer scroll sideways at 1024 px. 538 tests and 19 browser tests pass.
- Seventh review fixed: the id-column change no longer lets birth dates through — a header-less
  first row with an old 8-digit date is refused again; 8-digit dates under a date word in any of
  the common languages ("Fecha", "Data de nascimento", "Geboortedatum") are removed; the "most
  dates are old" rule is back, with an exception only for real id columns; a file name with a birth
  word keeps none of its numbers; "FN" and "geb" count only before an old date; an attach with the
  worker cleared is refused; Spanish uses the informal "edita" throughout. 542 tests and 19 browser
  tests pass.

## Goal (what the owner can do at the end)
From a sidebar on every page: open **Job orders**, see them as a list grouped by client, open one
in a side panel or its own page, create and edit job orders, give a job order (or one worker's
assignment) a rate card with dated versions, assign workers with start and end dates, and import
last month's placements from a Bullhorn, JobAdder or Spott export by matching its columns. The
converter from slice (a) then pays and bills with these rates, and weeks already paid never change.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright: create a job order → add a rate version → assign a worker → import the sample
   placement file → run the converter on a week using the new rate — English and Spanish; and the
   accessibility check on every new screen.
3. Screenshots of every new screen compared with its pattern file, every difference listed.
4. A second-opinion review of the rate-selection and locked-period changes (money path), fixed.
5. Hook tests still green.

## Screens and their references (pattern files written before any screen code)
| Route | Pattern file | Reference |
|---|---|---|
| frame for all app pages | `_layouts/app.md` | Linear sidebar and navigation (G-then-key, ?) |
| `/job-orders` | `job-orders.md` | Linear issue list (display options, filters, grouping, selection, create modal); side panel contents from Attio's record preview, opened with Space as in Linear peek |
| `/job-orders/[id]` | `job-orders/[id].md` | Attio record page (details panel, relationship tab for assignments, activity tab); rate card tab from Bullhorn One placement rate card versions, current/scheduled/history from Gusto's compensation card, "used means new version" from Stripe Prices |
| `/assignments` | `assignments.md` | Linear issue list (same as job orders), grouped by status |
| `/assignments/import` | `assignments/import.md` | Attio CSV import (upload → map → review values → preview → run, import history) with Linear's "choose your source tool" step in front; remembered mappings from Flatfile |

The converter moves inside the app frame (its route and pattern file do not change).

## Rules (tests first for each)
- **Job orders:** client, worksite, position, SOC code, shift, headcount, pay range, prevailing-wage
  flag (SPEC §4). The worksite must belong to the client. Every change audited.
- **Rate cards** belong to a job order, or to one assignment (a worker paid differently). A
  worker's own rates apply on the dates their versions cover; the job order's rates apply on the
  other dates (so adding own rates later never leaves paid weeks without a card). Fields: effective from/to, pay rate,
  bill rate or markup (stored as basis points; bill rate = pay × (10000 + markup) / 10000, rounded
  once, half-up, shown in the explain string), OT and DT bill multipliers, WC class code.
  Differentials, holiday rule and minimum-hours guarantee come with the full rules engine (slice c).
- **Versions** (Bullhorn): a new version copies the current one; it ends the previous version the
  day before it starts; no gaps or overlaps; unique start dates.
- **Never rewrite a paid week** (SPEC §8; Stripe Prices): a version whose dates touch a locked (paid)
  period cannot be edited or deleted — only a new version starting after the last paid day. A
  version not used by any paid week can be edited (with a required reason, Stripe/Restaurant365) or
  deleted; the earliest version cannot be deleted while later ones exist (Bullhorn).
- **Assignments:** worker, job order, start, end, cancelled or not. "Ended" is read from the end
  date when shown, never stored, so late timesheets dated inside an ended assignment still match. End not before
  start; one worker cannot hold two overlapping assignments on the same job order; dates cannot move
  so that a paid entry falls outside them; a cancelled assignment is never payable.
- **Import:** Bullhorn / JobAdder / Spott / other; CSV or Excel. Social Security numbers and birth
  dates are dropped when the file is received (the stored copy never contains them; they are never
  offered as a field, previewed or logged). Workers are only matched to the roster, never created
  (SPEC §6); clients must exist; a job order is matched by client + position + worksite or created
  with a worksite chosen in the review step. Re-importing the same placement (same source id) skips
  it. Every row ends imported or skipped with a reason; nothing is silently blanked (Airtable's
  dead end is not copied).
- **Pay run:** rate cards selected per assignment first, then job order; missing or overlapping
  cards stay blockers; goldens unchanged.

## Decisions made for the owner (2026-10-15, under "do everything")
- B1 side panel: Attio's documented record preview (position "N of M", previous/next, expand,
  close, key fields and recent activity), opened and closed with Space as in Linear.
- B2 rate versions: editable until used by a paid week; afterwards only a new version (SPEC §8).
- B3 import accepts Excel as well as CSV, because Spott exports Excel only.
- B4 navigation frame: Linear's sidebar (the reference the root layout said was due before this
  slice).
- B5 one client per timesheet (second review, to tell the owner): a timesheet's hours only take
  that client's assignments, so a worker who moved clients is never billed to the new client by
  mistake. Hours matched elsewhere wait in review, named with the other client; the person can
  "Attach to {that client}" explicitly (a sheet that really covers two clients), and the log keeps
  both client names. An edit reason alone never moves hours to another client (fourth review).
- B6 date order in the import (third review): read from the file (day first only when two or
  more dates show it and none shows month first), shown date by date, and changeable by the
  person, as Attio sets a date format in the review step. Excel date cells are always exact.

## Out of this slice
Workers directory (slice k), client billing profiles editing (slice g), differentials and holiday
rules (slice c), command palette (slice l), import drafts shared by link.
