# Pattern: Payroll file settings (`/settings/payroll`)

Status: adopted — slice (f) plan (2026-10-16, under the owner's "just keep going")
Reference product and screen: 7shifts — a payroll integration's settings (the target chosen once
with its company identifier; a Settings page with tabs: export codes per category, each with the
fallback when blank stated; payroll mapping with "Edit employee IDs"; a mapping page of Matched /
Unmatched rows with search and a progress bar); Deputy — export destination (a dropdown of
formats, each format's own fields shown inline once chosen, the file name) and the custom payroll
export template (included columns: rename the header, reorder, remove; a field picker with search;
format settings: delimiter, column headers on or off); QuickBooks Time — payroll item mapping (one
target item per hour type; changes save on their own); ClickTime — the export refuses to run while
the company code, a code or a person's id is missing; Workyard — the export cannot proceed until
every type is mapped; Linear — workspace settings reached from the workspace name at the top of the
sidebar
Source URL: https://kb.7shifts.com/hc/en-us/articles/4417520074387-ADP-Workforce-Now-US-Payroll-Export
Source URL: https://kb.7shifts.com/hc/en-us/articles/4417514104595-How-to-map-roles-and-employees
Source URL: https://kb.7shifts.com/hc/en-us/articles/4417514163859-QuickBooks-Online-Payroll-Integration
Source URL: https://help.deputy.com/hc/en-au/articles/13116516297487-Introduction-to-the-new-Timesheet-Export-experience-Beta
Source URL: https://help.deputy.com/hc/en-au/articles/4767874654223-Custom-payroll-export
Source URL: https://help.deputy.com/hc/en-au/articles/4694235841295-Exporting-to-ADP-Run-US
Source URL: https://help.deputy.com/hc/en-au/articles/4694853299087-Exporting-to-Intuit-QuickBooks-Desktop-US
Source URL: https://quickbooks.intuit.com/learn-support/en-us/help-articles/map-quickbooks-payroll-items/00/380722
Source URL: https://support.clicktime.com/hc/en-us/articles/41018977335565-Export-Payroll-Data-to-ADP
Source URL: https://help.workyard.com/en/articles/15467712-how-to-map-pay-types-for-quickbooks-online-payroll-exports
Source URL: https://support.avionte.com/hc/en-us/articles/55995315997203-Bulk-Import-Functionality-Jobs-Placements-and-Companies
Source URL: https://linear.app/docs/workspaces
Source URL: https://linear.app/docs/account-preferences
Source URL: https://linear.app/docs/scim
Researched: 2026-10-16 (`docs/research/payroll-formats-slice-f.md` §7). Confidence: high for the
7shifts tabs and mapping page and for Deputy's template builder (help articles with screenshots);
medium for Deputy's destination step (beta article); no reference documents keyboard shortcuts. Laid
out on 2026-10-17 as Linear's settings from Linear's own screenshots (`_components/settings.md`).

## Purpose in Granite
Where the Owner chooses the payroll system the weekly payroll file is made for (SPEC §13), enters
what that system needs (company code, QuickBooks version, a customer for QuickBooks Online, a
spreadsheet's layout), the system's code for each kind of pay, and each worker's id in that system.
The run checks against these settings and names whatever is missing (ClickTime, Workyard).

## Hierarchy
Laid out as Linear's settings (`_components/settings.md`): the shared header, the sections in the
centred column, each section's rows in a rounded bordered panel, a form's Save in the panel's foot.
1. **Page header:** "Settings" above, H1 "Payroll file" (Linear settings page title); for anyone but the
   Owner, the muted line under the title says only the Owner changes payroll settings.
2. **Payroll system** section (7shifts: the target chosen once; Deputy: the format list), its muted line
   saying one system at a time:
   1. Nothing chosen yet: the warning that no system is chosen, above the panel.
   2. A panel of rows, one per system (Linear's rows; Deputy's format list; §7.7 capability hint): the
      system's name (with "In use" beside the one in use) over a one-line hint of what its file carries,
      the radio at the row's right; the whole row chooses it. Gusto, QuickBooks Desktop, QuickBooks
      Online, ADP Workforce Now, RUN Powered by ADP, Paychex Flex, Paylocity, Spreadsheet (decision 0040).
   3. Under it, once a system is chosen, a panel with only that system's own fields (Deputy: fields
      appear once a format is chosen; 7shifts: the company code), label over field with its rule as
      the hint (Linear's SAML setup): ADP Workforce Now and RUN — company code; QuickBooks Desktop —
      version (2022 and later, or 2021 and earlier with the company name and company file number from a
      Timer Lists export); QuickBooks Online — the customer every row is recorded against; Paychex
      Flex — client id. Then the file name the system expects, read only (7shifts; Deputy).
      Paychex Flex and Paylocity add **Read a sample file** (Avionté BOLD's "create a mapping from a
      file", docs/research/connections-exports-slice-s.md §3): a dashed box with its title and one
      line at the left and the button at the right; once a file is read, one line says whether its
      columns are the ones Granite writes (with any difference), the client id found (filled into the
      field, kept on Save) and the codes found, for the Codes tab. The file is read in the browser.
   4. That panel's foot: when it was last changed and by whom at the left; "Saved" and **Save** (7shifts
      saves explicitly) at the right.
2b. **Pay week** section (completeness audit G1; Gusto's pay schedule, which names the day a pay period
   starts): one row — "Pay week starts on" over a muted line (overtime is counted in this week,
   29 C.F.R. § 778.105) and a select of the seven days at the right, saved when changed. Once hours are
   filed or a run is made the select is read only and the line says the day is now fixed.
   Source URL: https://support.gusto.com/article/106622257100000/edit-company-details-for-admins
3. **Tabs** (7shifts Settings tabs) for the system in use: **Earning codes** · **Worker ids** ·
   **Spreadsheet columns** (only when the system is Spreadsheet). Under each tab, its muted line, then
   its panel (the tab names the section; its heading is for screen readers).
4. **Earning codes** tab (7shifts custom export codes; QuickBooks Time one item per hour type): a panel
   of rows under a caption row (Kind of pay · Code · Sent as · Multiple), one row per kind of pay
   Granite can produce: the kind of pay over **what happens when it is blank** (7shifts), then at the
   right the code in the system (a field, or the system's fixed column as text), hours or dollars where
   the system lets the agency choose, and the multiple the system applies to hours where the agency
   declares it (ADP Workforce Now). Kinds of pay the system cannot carry say so at the right. **Save** in
   the panel's foot.
5. **Worker ids** tab (7shifts mapping page): a progress bar "N of M workers have an id", filter chips
   **All · Missing · Set** with counts and a search box, then a panel of rows under a caption row: the
   worker's name, at the right the id field (and Gusto's job title) and a status badge (Set / Missing).
   An id saves on its own when the field is left or Enter is pressed (QuickBooks Time saves on change).
6. **Spreadsheet columns** tab (Deputy custom payroll export), one panel in parts between hairlines
   (Linear's SAML panel): the file's options (file name, delimiter, date format, column headers on or
   off); the **included columns** in file order as a list nested in the panel, each with its header text
   (rename), move up and move down (Deputy reorders by dragging) and Remove; **Add a column** with a
   searchable list of the fields (Deputy field picker), including fixed text (Deputy's static value).
   **Save** in the panel's foot.

## Interactions
- Choosing another system shows its fields at once; nothing changes until Save (7shifts setup is
  finished with an explicit step). Saving a change of system says the change applies to every file
  not made yet.
- Earning codes and spreadsheet columns are saved with their tab's Save; leaving with unsaved
  changes is not blocked (no reference documents a guard), the changes are simply not kept.
- A worker id saves when its field is left or Enter is pressed; the row's badge and the progress
  bar update (7shifts statuses; QuickBooks Time autosave). An invalid id shows its rule under the
  field and is not saved.
- The Exceptions step's "no id in the payroll system" fix opens this page on **Worker ids**
  filtered to **Missing** (Workyard maps inside the export; ClickTime names what is missing).
- The sidebar's agency name opens a menu with **Settings** (Linear: the workspace name opens the
  menu that holds Settings).
- Keyboard: the references document none; tabs move with the arrow keys and fields submit with
  Enter (shadcn/Base UI defaults).

## States
- **Nothing chosen yet** (a new agency): the system choice with no system marked and the tabs not
  shown; the run's payroll file check names the missing choice (ClickTime refuses without a company
  code).
- **Partly set up:** the Worker ids progress bar below M of M and the Missing chip's count; an
  earning-code row left blank states its fallback.
- **Saved:** a short confirmation next to Save; the "last changed" line updates.
- **Refused:** a field that breaks its rule (a company code that is not 2 or 3 letters and digits,
  an ADP file number outside 51–999999, a QuickBooks name with characters the file cannot carry)
  shows the rule under the field; nothing is saved.
- **Read only:** for anyone but the Owner, every field is shown disabled and the header's muted line
  says only the Owner changes payroll settings.

## Look (checked against Linear's screenshots, 2026-10-17)
As `_components/settings.md`. Remaining differences: Linear has no radio rows (its choices are selects);
the systems keep a row each because each carries its own hint (Deputy). Linear's rows have one control
each; the earning codes and worker ids have several, so a caption row names them, as 7shifts' mapping
table and Deputy's template head their columns.

## Never copy
7shifts', Deputy's, Intuit's, ClickTime's, Workyard's or Linear's wording, icons, colors or logos.

## Loading and errors (slice o)
- Loading: the page's outline in the settings shape (`_components/loading.md`); buttons that start
  work show a spinner in place of their icon (Primer Button `loading`).
- A failure: the frame stays; the failed content's place says so with "Try again"
  (`_components/error.md`).

Deviations allowed: none
