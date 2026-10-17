# Pattern: Settings › Names (the nickname map)

Status: adopted — slice G3 (2026-10-17)
Reference product and screen: Linear — workspace label settings (a list of named items with a create
row and a row menu to delete), in Linear's settings layout (`_components/settings.md`)
Source URL: https://linear.app/docs/labels
Source URL: https://linear.app/docs/account-preferences
Researched: 2026-10-17. Confidence: medium (Linear documents the labels list and its actions; the
exact row layout follows `_components/settings.md`).

## Purpose in Granite
SPEC §6: names on timesheets are matched to the roster with "a per-agency nickname map". This page is
that map: which written given names stand for which formal ones ("Mike" → Michael).

## Hierarchy
1. The settings column (`_components/settings.md`): the title "Names"; one muted line under it saying
   what the map does.
2. **Nicknames** section: heading with its add action at the right (Linear "New label"). The add row
   opens in the panel: nickname, "stands for", Save and Cancel.
3. The panel's rows: the nickname (medium) over a muted line "stands for <given name>"; at the right
   a remove button (Linear's row menu has Delete; one action, so a button). An empty panel is one muted
   row.

## Interactions
- Add: both fields required; the same pair twice (case and accents ignored) is refused with a line
  saying so; a nickname equal to its given name is refused.
- Remove: at once, with a toast; audited.
- A match in review can add a row ("Remember 'Mike' as Michael?" on the document review page).
- Owner and coordinators change it; everyone else reads it.

## States
- Read-only roles: no add or remove controls; the page's role line says who changes it.

## Loading and errors (slice o)
- Loading: the page's outline in the settings shape (`_components/loading.md`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
