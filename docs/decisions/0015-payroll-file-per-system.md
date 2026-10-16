# 0015 — One payroll system at a time, set in the agency's settings

Status: accepted
Date: 2026-10-16

## Context
Slices (a) to (e) made one payroll file, Gusto's hours import, with the format fixed in code. SPEC
§13 asks for every common payroll system's file. The research
(`docs/research/payroll-formats-slice-f.md`) found five more with public, file-based imports or
documented importer files: QuickBooks Desktop (IIF time activities), QuickBooks Online (through
importer apps), ADP Workforce Now (paydata), RUN Powered by ADP (time sheet import), and the
templates PEOs and factoring companies each define. They differ in who prices the hours: Gusto,
both QuickBooks and RUN multiply a rate they store; ADP Workforce Now takes a rate per row; a
spreadsheet carries whatever its columns say. Plan: `.claude/plans/slice-f-payroll-formats.md`,
decisions F1–F8.

## Decision
- **The system is a setting.** `payroll.target` (the format and its options: company code,
  QuickBooks version, customer, spreadsheet layout) and `earning_code_map.{format}` (per kind of pay:
  the system's code, hours or dollars, and the multiple the agency declares where the system lets
  it) live in `agency_settings`. The setting in use is the one row with no end date; a change ends
  it yesterday and starts a new row today (or replaces today's row), with an audit event. Only the
  Owner changes them. A change applies to every file not made yet; files already made keep theirs.
- **Each worker's id per system** stays in `workers.payroll_ids` (one key per system). One id names
  one person (ADP file numbers compared as numbers).
- **The run checks against the system in use:** a worker paid this period with no id in it blocks
  the run, and the file's dry run turns any refusal into a blocker naming the worker. The payroll
  settings are part of the approval's fingerprint, so changing them voids an approval; the files are
  made under a shared lock on the settings, so they use what was approved.
- **Every exporter is pure** (fixture in; bytes, control totals and notes out), checks every line,
  refuses what its file cannot carry (naming the worker), reads its own file back and states the
  gross the system should compute from it next to Shiftbook's. Where the system multiplies a stored
  rate, every hours line must be that rate × the file's multiple, or the worker is refused; the
  stored rate is the worker's regular rate however regular pay travels.
- **A correction** (0014) uses the same exporter with its differences, each kept in its workweek so
  dated files put it in the week worked.

## Alternatives considered
- **The system dated by pay period** (as the workweek start is): a correction of a period paid in an
  earlier system would then be made for a system the agency no longer runs. Files go to the system
  in use when they are made.
- **Several systems at once** (a file per system per run): no agency in the research pays one
  week's workers through two payroll systems; it doubles every check for no case we know.
- **Overtime at a weighted rate as an "adjustment" dollars code in ADP**: a `Temp Rate` per row
  (rate ÷ the column's multiple) carries it exactly without a code the agency must create.

## Consequences
- No live connection to any payroll system: files only (a later slice may add APIs).
- QuickBooks Online carries regular hours only; other pay is paid by hand (the importers set no
  payroll item).
- Open items for a real customer test: a QuickBooks Desktop 2022+ IIF import, ADP's overtime
  multiple on `Temp Rate`, RUN's exact heading text (research §8).
