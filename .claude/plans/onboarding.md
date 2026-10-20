# Plan: onboarding, from "Start free" to a working first week (slice ab)

Owner, 2026-10-20: "think very deeply … what a perfect onboarding process looks like drawing from
inspiration … including emails and the verification email process … a really well done, perfectly made
process." Research the same day: the current flow (sign-up → link → password → authenticator → Home) and
the references below. Every screen and email copies its reference; pattern files are written first.

## What is wrong today
- The "check your email" screen has no resend, no code, no "open your email" buttons.
- A failed send still says "Check your email" (only logged).
- The link lasts 24 hours and opens straight onto the password page; mail scanners can open links.
- Sign-up email reads "Tabulado via Tabulado"; every email is bare text with one link; no welcome email.
- An expired link loses what was typed.
- Two-step setup offers only an authenticator app, though passkeys already work for sign-in.
- New agencies start on a 10-step guide that leaves out teammates, workers, the timesheet address and
  billing; nothing asks the few questions that would tailor it.
- If the free-days setting is missing, a brand-new agency is paused until it subscribes.
- Leftovers: `shiftbook-recovery-codes.txt`, `shiftbook_setup_guide`.

## The new journey
1. **Start (Mercury, Linear signup).** Work email, your name, agency name — unchanged fields, one screen.
   The website's email field still pre-fills it.
2. **Confirm your email (Slack's confirm screen; Linear's login email).** One email carrying both a
   6-digit code and a button. The screen shows the address with "Wrong email?", six code boxes (paste
   fills all, auto-submits), "Open Gmail" and "Open Outlook", and "Send a new code" disabled for 60
   seconds with a countdown (Supabase's 60s). Code and link work once, for 15 minutes (Auth0's 900s),
   and a newer one replaces them. The code works on any device, so an email read on a phone can be typed
   into the computer. The link opens a page with one "Continue" button (scanners cannot use it up).
   If the email could not be sent, the screen says so and offers to try again.
3. **Choose a password** (unchanged screen, now after the email is confirmed).
4. **Protect the account (Stripe puts two-step first; GitHub's 2FA setup).** Required for the Owner, as
   now. A passkey is the main choice ("Use this device's fingerprint or face"), the authenticator app the
   other; then recovery codes, as now.
5. **Three questions, one per screen, with a progress bar (Gusto's setup, Mercury's application).**
   a. Which states do your workers work in? (California, Illinois, Massachusetts, New Jersey, other)
   b. Which payroll system do you use? (cards: Gusto, ADP Workforce Now, RUN, Paychex Flex,
      QuickBooks, Paylocity, other) — saved as the agency's payroll setting.
   c. Invite a teammate (email and role; "Skip for now" — Linear's invite step).
   Each answer is saved to the agency's real settings; nothing is asked twice later.
6. **Home with "Finish setting up" (Gusto's remaining tasks; Stripe's checklist; Linear's learn-by-doing).**
   The guide is reordered and completed, tailored by the answers: copy your timesheet email address;
   add your first client and worksite; add or import workers; turn one timesheet into hours; send a
   client approval; make the payroll file; invite your team; start your subscription. Each item done
   from the agency's own records; the guide disappears when all are done.

## Emails (Postmark's and Resend's rules; Linear's, Stripe's and Slack's emails)
- One template for every email Tabulado sends: a small wordmark, a heading that matches the subject,
  short paragraphs, one button, the link written out under it, a quiet footer saying why it was sent;
  a plain-text part; a preheader; works in dark mode (no text in images); English or Spanish.
- Sender "Tabulado" for Tabulado's own mail; "{Agency} via Tabulado" for an agency's mail to clients.
- New and rewritten:
  - Confirm your email: "123456 is your Tabulado code" — code large, button, "works until 3:42 PM".
  - Welcome, right after setup: one next step (forward a timesheet to your agency's address).
  - Setup nudge, two days later only if a step is still open: names that one step, links to it; at most
    two, stops once set up.
  - Free days ending: 7 days and 3 days before (Stripe's trial reminders), with "Start subscription".
- Existing emails (invites, resets, codes, approvals, invoices, portal) move onto the template with
  their wording unchanged.

## Also fixed
- A missing free-days setting no longer pauses a new agency (it gets the default free days).
- Leftover "shiftbook" names in files and cookies.

## Done means
- Failing tests first for every rule (expiry, replace, resend cooldown, code tries, scanner-safe link,
  honest send failure, answers saved, nudge stops, trial emails' days).
- Typecheck, lint, unit and integration tests; Playwright run of the whole journey in English and
  Spanish; screenshots of each screen and email beside its pattern file, differences listed.
- A second-opinion review by a subagent of the security parts (codes, links, two-step).
