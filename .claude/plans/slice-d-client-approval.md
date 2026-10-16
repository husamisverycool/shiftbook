# Slice (d) — Client approval portal

Status: GO under the owner's "just keep going … I don't need to approve anything for you"
(2026-10-16). Every choice the research left open is listed under "Decisions made for the owner";
the owner can reverse any of them.
Contract: SPEC.md §2 (client approver role), §10 (client approval), §19 (audit), §21 (security),
§24 step 4. Research with sources: the pattern files below and
`docs/research/client-approval-slice-d.md` (security, email and reminders).

## Goal (what the owner can do at the end)
From **Client approvals** in the sidebar: pick a pay period, send each client's approver a link to
that week's hours, and see who has approved. The client's approver opens the link (no account), sees
their own workers' hours by worker and day, disputes a shift with a reason (and the right times if
they know them), and approves the rest with their typed name. The agency sees the dispute, accepts
the client's times, edits the hours, or keeps them with a reply; the run never pays or bills a
disputed shift until it is settled. Reminders go out on their own while a client has not acted.

## Done means (evidence I will paste)
1. `pnpm test` (unit + integration + goldens), `pnpm typecheck`, `pnpm lint` — real output, green.
2. Playwright, English and Spanish: send a request → open the email (demo mailbox) → follow the link
   → dispute one shift → approve the rest → the agency accepts the dispute → the converter pays the
   corrected hours. Accessibility check on every new screen.
3. Screenshots of every new screen and state compared with its pattern file, differences listed.
4. A second-opinion review of the link and approval code (security) and of the run change, fixed.
5. Tenant isolation tests for every new table and for the link lookup.

## Screens and their references (pattern files written before any screen code)
| Route | Pattern file | Reference |
|---|---|---|
| `/approve/[token]` | `approve/[token].md` | Bullhorn Time & Expense approval application; Upwork dispute form; TempWorks confirmation; Stripe hosted invoice page (expired, settled) |
| client portal frame | `_layouts/portal.md` | Stripe hosted invoice page and customer portal frame |
| `/approvals` | `approvals.md` | Harvest approval page; Stripe invoices list; Instawork disputes banner; Linear status order |
| `/approvals/[id]` | `approvals/[id].md` | Stripe invoice detail and email logs; Bullhorn One activity; Harvest approvals log and withdraw; Instawork hour disputes; Stripe dispute response |
| emails | `_emails/approval-request.md` | Bullhorn approval request, reminder and confirmation emails; Stripe invoice email |

## Rules (tests first for each)
- **Link** (research §1–2): `sbap_` + 32 random bytes (base64url); only its SHA-256 is stored, in a
  unique column. Path `/{locale}/approve/{token}`. The page sends `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store`, `X-Robots-Tag: noindex`, and loads nothing from other sites. Opening the
  link only shows the page; approve, dispute and "email me a new link" are button presses (POST)
  that check the link again. A link lasts the agency's `approval_link_days` setting (14 in the demo)
  and stops working for decisions once the period's files are created. Each send and each reminder
  makes a new link (older ones keep working until they expire); changing the approver or
  withdrawing an approval revokes every earlier link for that client and period. The first lookup
  crosses agencies through one narrow database function that returns only the agency and the link.
- **What the client sees** (research §4): the client, the period, each worker's name, each shift's
  day, start, end, break and hours, totals, each shift's state. Never pay or bill rates, amounts,
  Social Security numbers (not even the last four), worker contact details, other clients, other
  periods or the timesheet images. Built from its own data shape that has no such fields.
- **Who may be asked**: only shifts the run could pay (read cleanly, reviewed, or already approved);
  sending is refused while any of the client's shifts in the period still needs review (it says how
  many). Shifts matched to the client after a request was sent are shown as waiting on the same
  link and on later ones.
- **Approve**: approves every shift shown that is waiting and not disputed, in one transaction,
  only if the shifts are exactly as the page showed them (a SHA-256 of what was shown is checked;
  otherwise refused and reloaded). Needs the approver's typed full name and the confirmation box.
  Stored: the link, the email it was sent to, the typed name, the confirmation text with its version
  and language, the time, the internet address and browser, the SHA-256, and the values of every
  shift approved — in the decision record and the audit event (actor "{name} <{email}> (client)").
  Shifts become `client_approved`. A confirmation email goes to the approver and a notice to the
  agency's email address.
- **Dispute**: a shift waiting for approval, a required reason (free text), optional corrected start,
  end and break that must form a valid shift; saved as a draft on the page (removable) and sent with
  the approval. Sent disputes make their shifts `disputed` (never paid or billed: the run holds them
  with a plain reason that links to the request).
- **Settling a dispute** (agency): accept the client's times (applies them, audited with the client's
  reason, and the shift counts as approved by the client); edit the hours in Review hours (the edit
  settles the dispute; the shift needs approval again); or keep the hours with a required reply that
  the client sees on the next link (the shift needs approval again).
- **Withdraw approval** (agency): a required reason; the client's approved shifts go back to
  reviewed (editable) and need approval again; earlier links are revoked.
- **Reminders** (research §6; Harvest, Bullhorn One): automatic reminders at the agency's
  `approval_reminder_hours` after the request (24 and 48 h in the demo) while shifts wait and the
  link is valid; manual "Send a reminder". A sweep sends due reminders; running it twice sends each
  reminder once. It runs from a protected scheduled route in production and whenever the approvals
  pages load.
- **Email** (research §5; decision record 0012): one mail transport; demo mode and tests deliver to
  the demo mailbox table (no outside calls); production sends through Resend's HTTP API with the key
  from the environment settings. Every email is logged per request with the link hidden; in demo
  mode the request's history opens the delivered copy (with its working link) so the person can act
  as the client.
- **Everything audited** (SPEC §19): sent, reminded, link renewed, opened (marked "may be an
  automatic link check"), approved, disputed, dispute settled, approval withdrawn.

## Build order
1. Data: approval requests, links, decisions, disputes, email log, demo mailbox; `jobs`-free reminder
   counters; settings rows; RLS and the lookup function; tenant isolation tests.
2. Link and mail transport (unit): token, hash, email rendering in English and Spanish, link
   redaction, Resend request shape against a fake `fetch`.
3. Services (integration): send, view by link, approve, dispute drafts and submit, renew link,
   settle disputes, withdraw, reminders sweep with a fixed clock, run blocker for open disputes.
4. Screens: portal frame and page with all states; Client approvals list; request detail with
   disputes, hours, history and email view; sidebar entry (G then P); English and Spanish.
5. Playwright, accessibility, screenshots, second opinion, fixes.

## Decisions made for the owner (2026-10-16, under "keep going"; any can be reversed)
- D1 A dispute is per shift, with a required free-text reason (Bullhorn) and optional corrected times
  (Upwork lets the client name the hours; Instawork shows current against proposed). A reason list
  can come later.
- D2 Approvals are final on the page (Bullhorn, Beeline); the agency can withdraw an approval with a
  reason (Harvest), and the client is asked again.
- D3 Links last 14 days (setting), are reusable for viewing until then, and are replaced by each
  reminder; an expired link offers to email a new link to the same address (Bullhorn sends one; no
  email field is shown, so nobody can redirect a link).
- D4 Two automatic reminders, 24 and 48 hours after sending, only while the client has not acted
  (Harvest, Bullhorn One); no escalation to a second approver yet.
- D5 The client sees hours only, no amounts (Bullhorn's approver view; amounts are not final until
  the run).
- D6 The approver types their full name and ticks a confirmation (cheap evidence of intent; ESIGN
  § 7006(5)); the internet address is kept with the approval as evidence (time records: 2 years
  federally, 3 in Massachusetts) and the page says so.
- D7 Email goes out through Resend (plain HTTP, idempotency keys, signed webhooks, free tier fits a
  small agency), from Shiftbook's address as "{agency} via Shiftbook" with replies to the agency, so
  the agency needs no email setup. The key goes in the cloud environment settings, never in chat.
- D8 Requiring client approval before a run (SPEC §11) stays with the weekly run (slice e), where each
  client's billing profile will say whether approval is required. This slice only holds disputed
  shifts.

## Out of this slice
Requiring approval per client before a run (e); a second approver or escalation; editable email
text; approving on the client's behalf; client reports; email bounce webhooks (with the production
email setup); bill amounts on the page.
