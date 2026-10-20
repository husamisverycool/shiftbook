# Plan — website, third design (slice aa)

Owner, 2026-10-20: the second design is "way too basic"; wants ambitious, extremely well-made elements
drawn purely from the best sites, not complicated for its own sake. Four research reports (scratchpad
`research2/`: stripe-vercel-linear.md, fintech.md, craft.md, awards.md) agree on one thing: the best
pages make the product itself do the work on screen, on sample data, and let the visitor trigger it.
Our page explains; theirs demonstrate.

Kept from the second design (the owner liked the direction): Mercury's photo hero and frosted email
field, the dark/paper bands, Stripe's drifting colour band at the close, the dark footer with footnotes.

## Page order (every element named with its reference; sample data only, labelled)
1. **Hero** — Mercury's photo, headline lines blurring in (Linear). The real review screen in a window
   rises out of the photo's foot and flattens as you scroll (Check's flip-up; Linear's lit floor under
   it). It plays itself (Cursor, Granola): sheet photo → two scan passes → rows fill → one amber
   disagreement → resolved → pay lines with their explanations. A Photo / Hours / Pay lines switch
   (Granola). "Never moves money" bar docked on the window (Mercury treasury).
2. **Monday at an agency** — Ramp's "Systems that never spoke": pinned while scrolling, a tangle of the
   real mess (clipboard photo, supervisor's text "Maria left at 2, not 4", a spreadsheet, the wage
   poster, a client email disputing hours) joined by dashed lines; scrolling pulls them into one clean
   week. Replaces the current scroll story.
3. **Read twice** — Linear's two-circle diagram (both reads agree → accepted; they differ → you decide)
   beside Increase's checking card (each field ticks, one is left "needs a person").
4. **Pick a state** — Stripe's country tabs + Apple's toggle: one sample week; California, Illinois,
   Massachusetts, New Jersey. Pay lines computed by our real rules engine (on the server, same code as
   the app); the hours chart's overtime lines move per state (Linear's dot plot); the total rolls digit
   by digit (Stripe's odometer); each line shows its law.
5. **Where the week goes** — Stripe Connect's flow diagram: photo → Tabulado → payroll file / invoices;
   tabs per payroll provider show that file's real column headers from our exporters; a node says money
   never moves through Tabulado.
6. **Bento of live pieces** — Stripe's bento with the border light that follows the mouse: a client
   "Approve" button you can press, adding to a timeline (Resend); deadlines counting down from the real
   compliance tables (Ramp's ticker); three phones of the worker app with an English/Spanish switch
   (Apple); the audited Social Security number reveal (Rippling); a map of the states actually covered
   (Column's dot map).
7. **No two sheets alike** — Gusto's collage of the demo's own messy sample sheets around one line.
8. **Security** (kept, refined) and **close** (kept: Stripe's band, Mercury's two pills).
9. **Craft throughout** — Stripe's 1px page rails and dashed sub-dividers, Linear's keyline between
   chapters, layered soft shadows, grain kept inside borders, Stripe's sliding hover arrow, every
   animation paused off screen and stopped for reduced motion.

Removed: the photo carousel, cycling list, scroll-lit statement and still bento (the research says they
read as template).

## Honesty
No customers, logos, quotes or usage numbers. States limited to what the engine covers. A visitor's own
file is never read on the website (demo mode makes no outside calls).

## Done means
Pattern files updated with each source URL; en/es copy; typecheck, lint, unit tests clean; screenshots on
desktop, phone and dark system setting with differences listed; committed and pushed.
