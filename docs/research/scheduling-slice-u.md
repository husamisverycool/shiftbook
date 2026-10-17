# Research U: Scheduling, open shifts, offers, confirmation and attendance

Prepared 2026-10-17 for the scheduling slice (Slice U). Scope: the manager's schedule grid, publish
flow, open shifts and targeted offers, shift requests/bids, swaps, worker confirmation, worker-side
shift list (confirm, cancel, clock in), and how fill rate and no-shows are reported.

## How to read this

- **Source quality.** Every source below was fetched live on 2026-10-17 with Firecrawl (the only
  web tool that reached these hosts from this session). Confidence:
  - **High**: full official help page fetched and read today.
  - **Medium**: only the search-index excerpt of an official page was read.
  - **Unverified**: inferred or not found in public docs; must be checked in a browser before use.
- **Quoting.** Quotes are short and exist to pin down behaviour. We copy hierarchy and interactions
  only, never wording, names, icons or colors (CLAUDE.md, Design). Example people named in source
  screenshots are omitted.
- **Help-center screenshots** were not viewed (images); region order below comes from the written
  callout tables, which When I Work in particular publishes per screen.

---

## 0. Summary

| Granite piece | Primary pattern | Supporting pattern |
|---|---|---|
| Schedule grid (`/schedule`) | **When I Work Scheduler** (row-per-position / row-per-site views, OpenShifts row, per-day counters) | Deputy Schedule (status bar with clickable counts, filter-and-sort panel) |
| Publish flow | **Deputy "Publish shifts"** (3-step: what changed, which areas, how to notify) | When I Work Publish & Notify count + advanced publisher (recipients, date range, message, unpublish) |
| Create/edit shift dialog | **When I Work shift details** (assign-to incl. "open", how many, eligibility list, concerns) | Deputy recommended-worker ordering and override warning |
| Open shift offers | **Deputy "Send offers"** (pick recipients, optional message, no separate publish) | When I Work "View who's currently eligible" |
| Shift requests / bids queue | **When I Work OpenShift Requests page** (two tabs, status + schedule filters, approve one) | Deputy open shift with approval |
| Worker confirmation | **Deputy shift confirmation** (CONFIRMING badge, decline → empty shift + warning, expiry → open) | Instawork confirm window (32h prompt / 16h deadline) |
| Worker shift list (mobile) | **Instawork "My Shifts"** (Upcoming / Past / Cancelled, cancel with reason, transfer, clock in/out, adjust hours) | Deputy "Upcoming shifts" with confirm-all |
| Attendance / no-show report | **Deputy Attendance & absence report** (filters incl. tolerance, 3 summary stats, weekly chart, per-site and per-worker tables, detail table with "issues only") | Instawork fill-rate definition |
| Unfilled-shift rescue | **Instawork unfilled-shift options** (raise rate, push back start, cancel unfilled) | Deputy "Send offers to other locations" |

---

## 1. Deputy: Schedule page (manager)

- **Product:** Deputy
- **Sources (High):**
  - Schedule filtering and management: https://help.deputy.com/hc/en-au/articles/4688801660175-Schedule-filtering-and-management
  - Creating shifts on your schedule: https://help.deputy.com/hc/en-au/articles/4688731978639-Creating-shifts-on-your-schedule
  - Check your schedule on Deputy (views, mobile): https://help.deputy.com/hc/en-au/articles/4614752492687-Check-your-schedule-on-Deputy

### Regions (top to bottom, left to right)
1. **Header bar:** Location selector (single location, or expand to an area; "Select multiple" mode
   with checkboxes, Select all / Deselect, Done; text search inside the selector), date selector
   (prev/next arrows, click to open a calendar, a "jump to current week" shortcut, month/year skip),
   view selector, **Options** menu (expand/collapse areas, delete all visible shifts), and on the
   right the **Publish shifts** button carrying a count.
2. **Left column: team member list.** Search box at top (matches name, training tag, stress
   profile, pay-rate name). Filter icon opens a **Filter and sort** panel. Each row shows the
   person with a quick cost/hours summary for the period; people with zero hours who may work here
   sit at the bottom. "Add team member" link at the very bottom of the list.
3. **Main grid:** rows = areas (Area view) or people (Team member view); columns = days. Empty
   cells offer "+" or double-click to create. Unpublished shifts are drawn in a neutral state,
   published shifts in a "done" state (source: "Unpublished shifts in the schedule are coloured grey
   but published shifts are coloured green" — colors not to be copied, only the two-state idea).
   An **Open shift** item sits at the top of the people list and can be dragged into a cell.
4. **Bottom status bar:** counts for the visible schedule of: empty shifts, unpublished, published,
   requiring confirmation, open shifts, warnings, leave approved, leave pending, people unavailable.
   Clicking a clickable label jumps to the **next** shift with that status ("Each time you click on
   the link you will be taken to the next sequential shift with that specific status"). Leave and
   unavailable counts are not clickable.

### Views and periods
- Views: by Area or by Team member. Periods: day, week, 2-weekly, 4-weekly and monthly (the last two
  in Team member view only).
- Bulk actions apply only to what is visible: "Deputy's bulk update features only apply to shifts
  that are visible on the schedule". Publishing likewise covers only the visible view.

### Filter and sort panel
- **Sort by:** first name, last name, total hours, scheduled cost, base cost, stress, age, role,
  most qualified, tenure, leave/available, employment type, pay rate; a separate icon reverses order.
- **Filter people by:** training, stress profiles, employment type, access level, primary location,
  pay rate. Logic is OR across selected values ("results include team members who match any of the
  options you select"). Matching people's shifts are highlighted in the grid.
- **Filter shifts by:** shift types, published status.

### Create shift (dialog)
- Opened by "+" or double-click in an area cell. Fields: who, start and finish, area (defaults to
  the clicked area), break duration, shift notes (sent to the worker on publish; 1000-char limit).
- **Who** dropdown orders the most suitable first: preferred for this area, then "recommended"
  per five checks: "fatigue, training, availability/leave, permission to work at the location, and
  whether there is a conflicting shift". A non-recommended person can still be chosen by overriding
  a warning.
- In Team member view, creating a shift pre-fills start, length, break and area from that person's
  history, marked with a "suggested" indicator.
- **Save** has a split arrow for repeating the shift across the week. Clone/copy/templates exist.
- Cost visibility depends on role: supervisors do not see costs.
- **Delete:** select a shift and press Delete or Backspace; or Delete in the dialog; or "Delete All
  Shifts" from Options for the filtered view.
- **Shift history** from the shift's three-dot menu: created/updated/published by whom and when,
  who approved an open-shift request, swap updates.

### Keyboard and hover
- Delete/Backspace on a selected shift deletes it (documented). Drag and drop people from the list
  into the grid creates shifts with location defaults. No other shortcuts documented (unverified).

### Mobile
- Day view (list of who is working where and when) and Week view by area (grid); toggle icon,
  location toggle, prev/next day arrows, tap date bar for a picker.

---

## 2. Deputy: Publishing shifts

- **Source (High):** https://help.deputy.com/hc/en-au/articles/4688746992399-Publishing-shifts

### Flow (modal, three steps, Next / Next / Publish)
1. **Publish type:** "Publish updates" (only amended/new shifts notify) vs "Publish all" (everyone
   on the visible schedule is notified, changed or not).
2. **Areas:** tick boxes per work area. Hidden areas are excluded from the count and from this list
   (the count on the button drops when an area is hidden).
3. **Notification type:** require confirmation (email/SMS/app, worker must accept or decline);
   notify (email, SMS, app); notify (email and app only); mark as published without notifying.

### Button state
- Button label carries the number of shifts to publish for the current view; it changes to a
  "nothing to publish" state when all visible shifts are published.

### Tips worth copying
- To publish for one person only: switch to Team member view, filter to that person, publish.
- Optional location setting to notify a worker when a published shift is removed.

---

## 3. Deputy: Open shifts, offers, swaps, confirmation

- **Sources:**
  - Managing Open shifts (Medium; excerpt): https://help.deputy.com/hc/en-au/articles/4688698300687-Managing-Open-shifts
  - Shift confirmation (High): https://help.deputy.com/hc/en-au/articles/4688708441487-Shift-confirmation
  - Swap or offer shifts, manager settings (Medium): https://help.deputy.com/hc/en-au/articles/4688726501135-Allow-team-members-to-swap-or-offer-shifts
  - Swap/offer, worker side (Medium): https://help.deputy.com/hc/en-au/articles/4614775254671-How-to-swap-or-offer-your-shift-to-a-co-worker

### Open shift types
- **Open shift**: on publish, all *recommended* workers are notified; first come, first served.
- **Open shift with approval**: workers request; manager approves.

### Send offers (targeted)
- On a shift's three-dot menu → **Send offers** → pop-up to choose recipients. Option to include
  other locations (multi-select dropdown, Done). Offers reach only people whose main location is
  selected, who are schedulable, and have the needed training tags.
- Optional "message to team members" (email only, not in SMS).
- Sending offers notifies immediately; "You don't need to publish the shift afterward."

### Worker claim
- Web: "Me" tab calendar shows open shifts on their day; an "Available Shifts" list shows all.
  Clicking opens a pop-up to claim. Claimed rows then show an accepted marker.
- Email: open shifts emailed to recommended workers; claim from the email.
- Manager sees who claimed in the schedule or in shift history.

### Swap / offer to co-worker
- Settings: "Manager approval for shift swaps" (optional) and "Offer shifts" (no approval, manager
  notified). Until claimed (and approved if required) the original worker remains responsible.
- Manager approves/declines; both workers are notified and the schedule updates.

### Confirmation lifecycle (High)
- Publishing with "require confirmation" sends email (and SMS if a number exists). The worker must
  accept or decline "within a defined time period" (configurable per location).
- States on the grid: a **CONFIRMING** marker while pending. **Declined** → the shift becomes an
  **EMPTY** shift with a warning flag; manager is notified; detail in shift history.
  **No answer by deadline** → "the shift will automatically become an Open Shift".
- Worker side: "Upcoming Shifts" with a red badge count; shifts needing confirmation show
  tick/cross; mobile offers "Confirm all"; decline requires a reason; "if you decline the shift you
  cannot confirm it afterwards". SMS reply uses a unique code.

---

## 4. Deputy: Attendance & absence report (no-shows)

- **Source (High):** https://help.deputy.com/hc/en-au/articles/9849035622927-Attendance-absence-report

### Regions (top to bottom)
1. **Filters row:** shift start date (default last 30 days), location, location status (active /
   archived), area, **tolerance** (grace minutes, default 15, editable), team member, team member
   status.
2. **Summary stats (3 tiles):** No shows, Late arrivals, Early departures; each as a count and as a
   % of all shifts.
3. **Line chart:** the three measures by week.
4. **Bar chart:** top 10 locations by no-shows.
5. **Table per location/area:** Location/Area, Total scheduled shifts, No shows, % No shows, Late
   arrivals, % Late, Early departures, % Early.
6. **Table per team member:** same columns keyed by person.
7. **Detail table:** person, shift start, timesheet start, shift end, timesheet end, No Show (Y/N),
   Late Arrival (Y/N), Late minutes, Early Departure (Y/N), Early minutes, location, area, custom
   fields. A checkbox, ticked by default, shows **shifts with issues only**.

### Definitions (exact)
- No show = "shifts not clocked in or out"; % No shows = "No shows / Total scheduled shifts x 100".
- Late = not clocked in within the tolerance; Early departure = clocked out outside the tolerance.
- Drill-down and "show or download the underlying data" available on charts; views can be saved;
  deleted areas show with a prefix to preserve history.

---

## 5. When I Work: Scheduler (manager)

- **Sources (High unless noted):**
  - Scheduler Reference Guide (Medium; excerpt with callout tables): https://help.wheniwork.com/articles/scheduler-reference-guide-computer/
  - Schedule Views (Medium; excerpt): https://help.wheniwork.com/articles/schedule-views-computer/
  - Position View Reference Guide: https://help.wheniwork.com/articles/position-view-reference-guide/
  - Publishing the Schedule: https://help.wheniwork.com/articles/publishing-the-schedule-computer/
  - Scheduling OpenShifts: https://help.wheniwork.com/articles/scheduling-an-openshift-computer/
  - How Shift Bidding Works: https://help.wheniwork.com/articles/shift-bidding/
  - Process OpenShift Requests: https://help.wheniwork.com/articles/process-openshift-requests/

### Regions (top to bottom, left to right)
1. **Top-left:** schedule switcher ("Viewing"), date range with prev/next, "Today", and the
   **Publish & Notify** button with a split-arrow for advanced options. The button shows the number
   of changes; it has three states: everything ready to publish, some already published (only new
   changes go), nothing new.
2. **Under the dates:** "as" dropdown switching the grouping: **Users**, **Positions**, **Job
   Sites**, **Coverage** (chronological). Time views: day, week, 2-week, month (position and job
   site views: week, 2-week, month only).
3. **Left sidebar "Filters":** lists of positions, job sites, users, tags; click a name to show only
   it, checkbox to hide; "Select All" resets each list. **Display options** checkboxes per view:
   users view — hide unscheduled users, hide filtered users, highlight unconfirmed shifts; position
   view — hide unscheduled positions, highlight OpenShifts, show shifts at other schedules;
   coverage — highlight OpenShifts. A color-by picker (shift / position / job site).
4. **Grid:** in Users view the **top row is dedicated to OpenShifts**; if four or more OpenShifts
   exist on a day in week view, that row can collapse/expand. In Position / Job site view "each
   position gets one row and a count of shifts"; assigned shifts show the person and hours, open
   shifts show an open label and hours; a "No Positions" row catches the rest. Per-day **counters**
   show total shifts (open + assigned) and total hours.
5. **Shift chips:** unpublished = diagonal stripes; published = solid. Time off, preferred, and
   unavailable markers per person-day; hover the triangle to see hours.
6. **Tools menu:** auto-assign, bulk edit, copy previous day/week, load / save / update schedule
   template, print (or XLS), export, clear schedule (current view).

### Keyboard
- "Scheduler views have keyboard shortcuts. To navigate to position view using the keyboard, select
  'p'." (High.) The full shortcut list was not found publicly (unverified).

### Shift details dialog (exact field list)
- **Assign to** (required; pick a person or "OpenShift"; a button lists everyone currently
  eligible; availability preferences shown under the field; a "Scheduling Concerns" message
  appears when assigning would exceed the person's max hours; time-off markers).
- **Require pick up approval** (open shifts; turns on bidding).
- **Share shift with other schedules** (open shifts).
- **How many** (open shifts only; creates N identical open shifts).
- Time (required), breaks (paid/unpaid minutes and start), color, position, job site, tags
  (required qualifications), task lists, notes (350 chars), repeat, save as template.
- **View who's currently eligible**: offer to specific eligible users (uncheck people on mobile).
- Template picker appears first if templates exist; else straight to the custom shift form.

### Eligibility rule (exact four criteria)
1. Qualified for the shift by tagged positions. 2. Not already on a published shift. 3. Not on
approved time off. 4. Not hidden in the scheduler.
- Without approval: "The first employee to view and accept the OpenShift gets it automatically".

### Advanced publisher (split arrow on Publish & Notify)
- A Recipients (optional: tag OpenShifts, users or positions); B Date range; C Notify users with
  changes; D Notify all users; E Message (optional, email only, shown only when notifying);
  F Publish Shifts; G Unpublish Shifts ("Users are not notified when their shifts are unpublished").
- "Re-Send Notifications" for selected recipients after publishing.
- Notification triggers: publishing assigned shifts, saving changes to a published shift,
  publishing open shifts they're eligible for, offering open shifts to them.

### OpenShift Requests page (bids)
- Entry: bell icon with count badge (top-left) and a requests menu.
- Two tabs: **Requests I Can Approve** (pending, excluding your own) and **All Requests**.
- Left sidebar: search, filter by status and schedule.
- Open a request → list of requesters **in order of request date**; partial-overlap takers hidden
  behind a "+n can take part" link; select one → **Approve**.
- Statuses (exact set): Pending Approval, Approved, Canceled, Expired (day passed, nobody approved),
  Denied (shown to those not chosen).
- Mobile: dashboard card for requests; those needing your approval sorted to the top.

### Mobile
- Publish from phone: Manager Tools → Publish & Notify → Send → confirm. Absences can be processed
  from a dashboard "Attendance Notices" card (Medium, from related-article excerpt).

---

## 6. Instawork: worker ("Pro") shift list and rules

- **Sources (High):**
  - Shift cancellation policy: https://help.instawork.com/en/articles/2226313-shift-cancellation-policy
  - Booked Shifts Disappeared (confirmation window): https://help.instawork.com/en/articles/8548261-booked-shifts-disappeared
  - How reliability affects your shift access: https://help.instawork.com/en/articles/5048510-how-reliability-affects-your-shift-access
  - How do I clock in and out (Medium; full excerpt in search index): https://help.instawork.com/en/articles/4357174-how-do-i-clock-in-and-out-for-a-shift
  - Unfilled shifts close to start (partner side): https://help.instawork.com/en/articles/10082544-what-to-do-when-you-have-unfilled-shifts-close-to-your-start-time

### Worker navigation
- Bottom tab "Shifts" → "My Shifts" with segments **Upcoming** and **Past / Cancelled**; cancelled
  shifts move to a Cancelled section. Pull to refresh. A "Live Shifts" page exists for the active
  shift.

### Shift detail actions
- **Confirm**: "You'll be prompted to confirm your shift 32 hours before the shift starts. You'll
  have 16 hours before the shift start time to confirm". Multiple shifts with the same business can
  be confirmed together. No confirmation → auto-cancel, counted against reliability.
- **Cancel**: scroll down → "can't make it" action → enter reason → confirm. Optional **transfer**
  to another worker (limit 3 per rolling 30 days; worker remains responsible until accepted).
  Cannot re-book a shift you cancelled. Cannot cancel once clocked in; multi-day bookings cancel as
  a set.
- **Clock in**: inside the geofence; "Clock In" button on the shift; optional clock-in code from the
  site contact, or a QR code the site scans. Clock out the same way plus an end-of-shift survey.
- **Adjust time**: Past Shifts → shift → request hours adjustment with actual times, breaks and
  evidence.

### Rule tiers (useful as data for Granite's no-show policy table, not wording)
- Free-cancel grace: 15 minutes after booking, not applicable if booked within 1 hour of start.
- More than 24h notice: early cancel (counts toward cancellation rate).
- Within 24h: late cancel (suspension risk; removes upcoming shifts).
- After start: no-show. 1 in 30 days = 7-day suspension; 2 in 30 days = 30-day suspension.
- Major tardy: clocking in 15+ minutes after start.
- Business cancels within 24h: up to 4 hours pay at the scheduled rate (capped at scheduled length),
  with listed exceptions; requires a dispute to trigger.

### Partner side: fill rate and unfilled rescue
- Marketing defines fill rate as "shifts filled in US markets across all positions and when shifts
  are posted 2-7 days in advance" (https://www.instawork.com/, Medium; footnote text).
- Unfilled shift options: **raise the rate** (from the shift home "improve fill rate" or shift
  details; new rate applies to everyone already booked), **push back** start time for unfilled
  slots only, **cancel unfilled** slots without fee. Physical timesheet printable from shift details.

---

## 7. Homebase

Not fetched (rate limits; Deputy and When I Work cover the manager grid fully). Unverified; skip.

---

## 8. Fill rate and no-show display: what the sources agree on

- Fill rate is a ratio of filled slots to requested slots; Instawork qualifies it by lead time.
  Neither Deputy nor When I Work publishes a "fill rate" metric by that name; When I Work gives
  per-day shift counts including OpenShifts, Deputy gives a count of empty and open shifts in the
  status bar. Granite should compute fill rate = filled slots / requested slots per order and
  show open/empty counts inline (Deputy status bar pattern).
- No-show rate (Deputy): no-shows / total scheduled shifts, with a tolerance filter for lateness.

---

## Recommended hierarchy for Granite

### `/schedule` (manager grid)
1. **Header** (When I Work top-left cluster + Deputy right-side publish): client/site selector with
   multi-select (Deputy location selector) · date range with prev/next, Today, calendar picker
   (Deputy date selector) · grouping switch: by **Order/Position**, by **Worksite**, by **Worker**
   (When I Work "as" dropdown; single-letter keys like the documented "p") · Publish button with a
   pending-changes count and split arrow (When I Work Publish & Notify; Deputy count on button).
2. **Left rail:** worker search that also matches skills/certs (Deputy search), Filter-and-sort
   panel with OR filters (Deputy), display toggles: hide unscheduled rows, highlight open shifts,
   highlight unconfirmed (When I Work display options).
3. **Grid:** first row = **Open shifts** (When I Work users view); rows per position/site carry a
   shift count (When I Work position view); per-day counters of shifts and hours (When I Work);
   two-state shift chips, unpublished vs published, using pattern not color alone (When I Work
   stripes idea); confirmation state markers: pending, declined → empty + warning, expired → open
   (Deputy confirmation lifecycle).
4. **Bottom status bar:** clickable counts that jump to the next matching shift: empty, unpublished,
   awaiting confirmation, open, warnings (Deputy status bar).
5. **Shift dialog:** assignee with recommended-first ordering and override warning (Deputy) ·
   "open" assignee option, How many, require approval, view eligible + offer to selected (When I
   Work) · concerns message for overtime/conflicts (When I Work Scheduling Concerns) · Delete key on
   selected chip (Deputy) · history from overflow menu (Deputy).
6. **Publish dialog:** step 1 updates-only vs all (Deputy) · step 2 scope (sites/positions, date
   range, recipients) (Deputy areas + When I Work recipients/date range) · step 3 notify mode incl.
   require confirmation and "mark published, don't notify", optional message (Deputy + When I Work).
   Unpublish lives in the same dialog (When I Work).

### `/schedule/requests` (offers and bids queue)
- Two tabs: needs my approval / all (When I Work) · left filters: status, client/site, search (When
  I Work) · request detail: requesters in request-date order, select one, Approve (When I Work) ·
  statuses Pending, Approved, Canceled, Expired, Denied (When I Work) · "Send offers" from a shift
  with recipient picker, other-sites option, optional message, no extra publish (Deputy).

### Worker portal shift list (mobile-first)
- Segments Upcoming / Past / Cancelled (Instawork) · badge count of shifts needing confirmation and
  a confirm-all (Deputy) · confirm window as data: prompt at T-32h, deadline T-16h, expiry → shift
  returns to open (Instawork window + Deputy expiry) · cancel with required reason, policy tier
  shown before confirm (Instawork) · clock in/out button on the active shift with code fallback
  (Instawork) · request hours adjustment from a past shift (Instawork).

### `/reports/attendance`
- Filters incl. tolerance minutes default 15 (Deputy) · three stat tiles with count and % (Deputy) ·
  weekly trend (Deputy) · top worksites by no-shows (Deputy) · per-site and per-worker tables
  (Deputy) · detail table with "issues only" on by default (Deputy) · add a **fill rate** tile:
  filled / requested slots for orders in range (Instawork definition, our own computation).

### Unfilled-shift actions (order detail)
- Raise pay/bill rate, push back start for unfilled slots, cancel unfilled slots (Instawork).

### Gaps
- No public keyboard shortcut list for either scheduler beyond When I Work's "p".
- Deputy open-shift claim pop-up contents and Homebase: not verified.
- Screenshots not inspected; colors and iconography deliberately not recorded.
