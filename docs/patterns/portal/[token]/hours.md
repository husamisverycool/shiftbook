# Pattern: Client portal — Hours to approve (`/portal/[token]/hours`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: TempWorks WebCenter — timecard approval list (one row per period with
its status and a Review action); the approval page itself is `approve/[token].md` (Bullhorn)
Source URL: https://kb.tempworks.com/help/customer-portal-invoices
Source URL: https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §3, §4). Confidence: medium.

## Hierarchy
1. **Title** "Hours to approve".
2. **One row per pay period sent for approval**: the period's dates, "{n} shifts waiting · {hours}",
   and at the right either **Review and approve** (when this contact is the approver it was sent to)
   or a muted line "Sent to {name}, who approves these hours."

## Interactions
- **Review and approve** opens the approval page for that period with a fresh link (POST, as
  decision 0013 requires; nothing happens on opening the list).

## States
- Nothing waiting: "Nothing to approve" and one line.

## Loading and errors (slice o)
- Loading: the list outline. A failure: the frame stays, "Try again".

Deviations allowed: none
