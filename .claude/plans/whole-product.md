# The whole product — roadmap after slice (m) (SPEC §27)

Owner, 2026-10-17: "build everything you think is best and all the stuff you said was out of scope …
I want the whole app to be done in totality." Each slice still gets its own plan file, pattern files
from documented references, tests first, real output, and a push before the next.

| Slice | What the owner gets | References |
|---|---|---|
| n | Smooth motion, hover, press and focus everywhere — **done** | Primer motion tokens; Carbon |
| o | Every state handled: page outlines while loading, errors with Try again, not found, spinning buttons — **built, testing** | Polaris SkeletonPage; Primer; GitHub 404 |
| p | ⌘K command menu: any page, record or action | GitHub command palette; Linear; cmdk |
| q | Free public Illinois 720-hour checker (the cold-call hook; nothing stored) | Stripe/Gusto free tools pattern to be researched |
| r | Notifications (in-app + email, per-user settings), invoices emailed with PDF, scheduled collection reminders, credit notes, promise-to-pay | Linear notifications; Stripe emails; Stripe dunning; Stripe credit notes |
| s | Connections page; Paychex Flex and Paylocity mapped exports; factor schedule of accounts | Zapier; Stripe integrations |
| t | Worker onboarding (W-4, I-9 §1, direct deposit, acknowledgments, e-signature) and the worker app (phone code login, hours, pay stubs, documents, messages, clock in/out) | Gusto self-onboarding; Rippling checklist; Square Team; Gusto Wallet; Gusto pay stub |
| u | Scheduling and shift fill; fill and no-show rates | Deputy; When I Work; Instawork |
| v | Client portal: invoices and backup, remittance stub, proof of registration, request workers | Stripe Customer Portal; Bill.com |
| w | Partner-ready money flows: payroll payload, wage-access availability, funding packet, insurance export — nothing moves | Stripe Connect onboarding; Stripe Capital |
| x | New Jersey rules and notices; the acceptance test grown to cover everything, en and es | — |

Working method: research agents fetch each reference's documentation first; one building agent per
slice at a time (messages files are shared); e2e runs serially on one database.
