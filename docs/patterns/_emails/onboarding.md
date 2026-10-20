# Pattern: Onboarding emails (welcome, one setup reminder, free days ending)

Status: adopted — slice ab, onboarding (2026-10-20; `.claude/plans/onboarding.md`).
Reference product and screen: Stripe's welcome email (one line that the account is ready, one button
to the Dashboard, short help, signed by the team); the onboarding-email rules Loops and Userpilot
document (a welcome right away with one next step, not a feature list; a reminder only while a step is
still undone, naming that step and linking straight to it, stopping once set up); Stripe Billing's
trial reminders (7 days before the trial ends, and the `trial_will_end` event 3 days before). All in the
shared layout (`layout.md`).
Source URL: https://demo.react.email/preview/Community/welcome/stripe-welcome
Source URL: https://userpilot.com/blog/saas-onboarding-emails/
Source URL: https://loops.so/examples/onboarding-email-examples
Source URL: https://docs.stripe.com/billing/subscriptions/trials
Researched: 2026-10-20. Confidence: high for when each is sent; the Stripe welcome is a community
recreation of the real one.

## Hierarchy (welcome — once, when the agency's first Owner finishes two-step sign-in)
1. Sender "Tabulado"; subject: {agency} is ready on Tabulado; preheader: the one next step.
2. Heading: Welcome to Tabulado, {first name}.
3. One line: the agency is set up and the free days run until {date}.
4. One next step: forward one week's timesheets to the agency's address (the address written out) —
   or, with no forwarding domain set, convert the first week of timesheets.
5. The one button: Open Tabulado (Home, where "Finish setting up" waits).
6. Footer: sent because they created the agency.

## Hierarchy (setup reminder — two days after sign-up, then once more three days later, only while
## a step of "Finish setting up" is undone; never more than two)
1. Subject: the next step's own title (e.g. "Add a client and its worksite").
2. Heading: one step left before your first week / your next step.
3. The step's one-line description (the guide's own).
4. The one button: the step's own action, opening that page.
5. Footer: sent because the agency's setup is not finished; it stops once every step is done.

## Hierarchy (free days ending — 7 days before, and 3 days before, while there is no subscription)
1. Subject: your free days end on {date}.
2. Heading: {N} days left of your free days.
3. One line: after {date}, changes pause until the subscription starts; nothing is lost.
4. The one button: Start subscription (Settings › Billing).
5. Footer: sent to the agency's Owner.

## States
- English or Spanish, by the Owner's language.
- Never for the demo agency; only to the agency's active Owner.
- Each is kept with the agency's other emails (Stripe's email log).

## Never copy
Stripe's, Loops' or Userpilot's wording, colours or logos.

Deviations allowed: none
