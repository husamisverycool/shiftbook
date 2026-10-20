# Pattern: The layout every Tabulado email shares

Status: adopted — slice ab, onboarding (2026-10-20; `.claude/plans/onboarding.md`).
Reference product and screen: Linear's login email (a small wordmark at the top left, one button, the
code set apart, a short footer under a hairline) and Stripe's account emails (one button, short help,
the team's sign-off), drawn under Postmark's transactional rules (subject carries the point, a
preheader for the inbox preview, the product as sender, a plain-text part with each link on its own
line, absolute expiry times, a line saying why the email came).
Source URL: https://demo.react.email/preview/Community/magic-links/linear-login-code
Source URL: https://demo.react.email/preview/Community/welcome/stripe-welcome
Source URL: https://postmarkapp.com/guides/transactional-email-best-practices
Researched: 2026-10-20. Confidence: high for the structure; the Linear and Stripe emails are community
recreations of the real ones.

## Hierarchy
1. Preheader (hidden): one line for the inbox preview.
2. "Tabulado" as a bold 17px wordmark, top left (text, not an image).
3. Paragraphs, 15px on 24px lines, dark grey; lists the same.
4. A code, when the email carries one: 32px, wide letter spacing, in a light grey box with a hairline.
5. The one button: near-black, white 15px text, 8px corners; under it, in 13px grey, "Or copy this link
   into your browser:" and the link written out. Any later link is plain underlined text.
6. Footer under a hairline: 13px grey, why the email was sent and on whose behalf.
7. Width at most 520px, centred, 40px above; white page.

## States
- Dark mode where the mail program follows it: near-black page, light text, light button.
- Plain-text part: the same blocks; each link on its own line under its label; the footer after "--".
- English or Spanish, by the reader's language.
- Nothing loaded from other sites; no tracking.

## Never copy
Linear's, Stripe's or Postmark's logos, colours or wording.

Deviations allowed: none
