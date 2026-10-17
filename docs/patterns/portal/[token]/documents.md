# Pattern: Client portal — Documents (`/portal/[token]/documents`)

Status: adopted — slice (v) plan (2026-10-17)
Reference product and screen: Avionté client portal — Documents (a list of files with their date and
a download); Stripe customer portal History rows (one line per item, the action at the right)
Source URL: https://avionteclassicsupport.zendesk.com/hc/en-us/articles/360045869733-Customer-Portal-Overview
Source URL: https://docs.stripe.com/customer-management
Researched: 2026-10-17 (`docs/research/client-portal-slice-v.md` §1, §4). Confidence: medium.

## Hierarchy
1. **Title** "Documents".
2. **Rows**, hairlines between them: the document's name ("Illinois registration {number}", "Proof of
   Illinois registration"), a muted "Dated {date}" under it, and **Download** at the right. The
   agency's latest certificate per state, then the proofs of registration made for this client
   (820 ILCS 175/85: the client verifies the agency's registration on March 1 and September 1).

## Interactions
- Download saves the file.

## States
- None: "No documents yet" and one line.

## Loading and errors (slice o)
- Loading: the list outline. A failure: the frame stays, "Try again".

Deviations allowed: none
