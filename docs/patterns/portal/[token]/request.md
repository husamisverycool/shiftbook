# Pattern: Client portal — Request workers (`/portal/[token]/request`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: Instawork — booking wizard (one step at a time: what, where, when, then
a review before submitting); TempWorks WebCenter — order requests (the list of requests with their
status; a rejection carries a comment); the app's own wizard steps (decision 0029 rule 12)
Source URL: https://help.instawork.com/en/articles/4819315-how-do-i-post-a-shift
Source URL: https://kb.tempworks.com/help/customer-portal-how-to-create-and-submit-orders
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §5, §3). Confidence: medium (the
order-request field lists are in screenshots only).

## Hierarchy
1. **Title** "Request workers", then the numbered steps (done ones ticked, the current one bold):
   Position · Worksite · Schedule · Review — one step at a time (Instawork).
   - **Position:** position (with a short hint), number of workers.
   - **Worksite:** the client's worksites as choices, plus "Somewhere else" with a text box for the
     address (Instawork: saved sites pre-fill).
   - **Schedule:** start date, end date (optional), shift starts, shift ends, notes for workers
     (attire, safety gear, who to ask for).
   - **Review:** every answer as label over value with an edit link per step; **Send request**.
2. **Your requests** under the wizard (TempWorks order requests): newest first — position, start,
   number of workers, and the status badge (Waiting on {agency}, Accepted, Declined), a declined
   one with its reason.

## Interactions
- Continue checks the step's fields and says under each what to fix; Back keeps what was typed.
- Sending shows a toast, empties the wizard, and the request appears at the top of Your requests.

## States
- No requests yet: "No requests yet" and one line.

## Loading and errors (slice o)
- Loading: the settings-shape outline. A failure: the frame stays, "Try again".

Deviations allowed: none
