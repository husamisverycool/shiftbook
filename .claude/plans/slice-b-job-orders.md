# Slice (b) — Job orders, assignments, rate cards

Status: GO — the owner said "approve all goldens and do everything" on 2026-10-15, after slice (a).
Choices the research left open were made under that instruction and the owner's earlier "go and do
what you think is best but … rely on inspiration from great products" (each is listed under
"Decisions made for the owner"; the owner can reverse any of them).
Contract: SPEC.md §4 (JobOrder, RateCard, Assignment), §8, §21, §26. Research with sources:
pattern files below (copied from the research notes, every claim with its URL).

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
- **Rate cards** belong to a job order, or to one assignment (a worker paid differently). An
  assignment with any card of its own uses only its own cards. Fields: effective from/to, pay rate,
  bill rate or markup (stored as basis points; bill rate = pay × (10000 + markup) / 10000, rounded
  once, half-up, shown in the explain string), OT and DT bill multipliers, WC class code.
  Differentials, holiday rule and minimum-hours guarantee come with the full rules engine (slice c).
- **Versions** (Bullhorn): a new version copies the current one; it ends the previous version the
  day before it starts; no gaps or overlaps; unique start dates.
- **Never rewrite a paid week** (SPEC §8; Stripe Prices): a version whose dates touch a locked (paid)
  period cannot be edited or deleted — only a new version starting after the last paid day. A
  version not used by any paid week can be edited (with a required reason, Stripe/Restaurant365) or
  deleted; the earliest version cannot be deleted while later ones exist (Bullhorn).
- **Assignments:** worker, job order, start, end, status (active / ended / cancelled). End not before
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

## Out of this slice
Workers directory (slice k), client billing profiles editing (slice g), differentials and holiday
rules (slice c), command palette (slice l), import drafts shared by link.
