# Pattern: Settings › Branches (`/settings/branches`)

Status: adopted — completeness audit G1 (2026-10-17)
Reference product and screen: Gusto — company locations (Add location; each location's menu with
Edit and Deactivate); Linear — a settings list with the add action at the section heading's right
(`_components/settings.md`)
Source URL: https://support.gusto.com/article/106622257100000/edit-company-details-for-admins
Source URL: https://linear.app/docs/members-roles
Researched: 2026-10-17 (`docs/research/agency-setup-g1.md`). Confidence: high.

## Purpose in Tabulado
The agency's offices: job orders name the branch whose margin they count in (decision I10), and
Illinois branch registrations name them (slice j).

## Hierarchy
1. **Header:** "Settings" above, H1 "Branches".
2. **Branches** section, **Add branch** at the heading's right; the branches as rows in a panel:
   the name over a muted line (how many job orders count in it), and a "…" menu at the right —
   **Rename**, **Archive** (Gusto's Deactivate) / **Restore**. Archived branches last, marked Archived.

## Interactions
- **Add branch** and **Rename** open a small dialog with the name; the same name twice among open
  branches is refused, saying so.
- Archiving keeps the branch's margin and registrations; it leaves the job order form's choices.
- Only the Owner changes branches; anyone else sees the list read only.

## States
- **No branches:** one muted row saying job orders can still be saved without one, and **Add branch**.

## Never copy
Gusto's or Linear's wording, icons, colors or logos.

## Loading and errors
- Loading: the page's outline in the settings shape (`_components/loading.md`).
- A failure: the frame stays; "Try again" (`_components/error.md`).

Deviations allowed: none
