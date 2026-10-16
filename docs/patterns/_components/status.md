# Pattern: Status badge (shared component)

Status: adopted — decision 0029 (2026-10-16, revised after the owner's review)
Reference product and screen: Stripe Dashboard — invoice status badges (Paid, Draft); Vercel Geist
badge guidance
Source URL: https://docs.stripe.com/invoicing/dashboard
Source URL: https://vercel.com/geist/badge
Researched: 2026-10-16 from the screenshot itself (part C). Confidence: high.

## Hierarchy
1. A small badge with slightly rounded corners: the status word on a light tint of its tone, the
   word in the tone's dark shade, medium weight (Stripe's "Paid" and "Draft"). No dot, no icon
   (Geist: "Don't add checkmarks or X icons for status").
2. Tones, one meaning each across the app: neutral (draft, not started, upcoming, ended), info
   (waiting on someone else), success (paid, approved, done, active), warning (needs attention
   soon), critical (overdue, failed, disputed). Tailwind's default palette.

## Interactions
None: a status is never a button.

## States
- In tables, its own column, one per row (Stripe).

Deviations allowed: none
