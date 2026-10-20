# Website visual research — slice aa, second design (2026-10-20)

Why: the owner rejected the first website as "very basic", "simplistic" and "like the app itself", and
asked for a page modelled closely on Mercury's, Stripe's and Ramp's landing pages, researched first.

How: Mercury's home was captured frame by frame (Firecrawl screenshots at 1080px); Stripe, Ramp,
Campfire, Check, Deel and Warp were read from their pages' HTML and screenshots by four research agents.
Photographs are free Unsplash photos (credited in the footer); no third-party logos, names, icons,
wording or colours were copied.

## What each reference gives the site
- **Mercury (the spine).** Section order and rhythm: photo hero with a centred regular-weight headline,
  frosted email field with the button inside, frosted demo pill, frosted legal note at the photo's foot;
  near-black navy band (#14151c-ish) with a small two-tone heading over an accordion beside floating
  dark panels (amounts with superscript cents, a pointer); centred heading + photo carousel straddling
  dark and light bands with a tag chip, white words and thin progress segments; warm paper (#f6f5f2-ish)
  with a 2×2 grid of grainy cards holding one white UI piece and sparkle chips; a dark row of four big
  figures with vertical dividers; a security trio of abstract renders (rings, glowing white shapes,
  glossy pills); centred close with an accent pill and a frosted one; dark footer with a "Disclaimers
  and footnotes" block, label at the left. Header fixed and see-through over the photo, accent pill at
  the right.
- **Stripe.** Two-tone headings (statement, then its elaboration in grey); a moving strip of names faded
  at both edges.
- **Ramp.** A white product card floating over a photograph; the pricing card rising out of a dark band.
- **Campfire.** Headline lines rising out of clipped boxes; a pill whose arrow floods the whole button
  in three staggered circles; a tall cycling list of feature names faded at the edges.
- **Check.** A large statement whose words light as it is scrolled; "what we don't do" stated plainly.
- **Deel.** A warm bento of cards with white product pieces inside.
- **Apple and Stripe (pinned scenes).** A tall section whose picture stays pinned while scrolling drives
  it through states, with captions lighting in turn — used for the sheet-to-payroll story.
- **Stripe (gradient).** The skewed band of slowly moving colour fields, here behind the closing heading,
  in Tabulado's own colours.
- **Ramp (receipt matching).** A document scanned, its lines lifted into rows and matched, finished cards
  fanned — the motion inside the pinned story.
- **Warp.** Rows that resolve from a shimmering "Checking" to their result when seen.

## Honesty rules kept
- No customer logos, quotes or invented usage figures. The four figures are product facts ($0 moved,
  2 readings, 5 rule books, 8 formats). The carousel's words say what Tabulado does for that kind of
  week, not what a customer said.
- Every name and number in the pictures is sample data from the demo agency, labelled so; the Chicago
  minimum wage shown is the app's own table ($17.05 from July 1, 2026).
- Printed logos in photographs (a vest, a uniform) are blurred.

## Photographs (Unsplash licence)
- Hero: Adrian Sulyok (c_4eaGRDSVU) — asks for a credit link to sulyokimaging.ro.
- Carousel: Centre for Ageing Better (ZlOlRnWk8zU), Sam Moghadam (bN_aaTKfwM0), Samuel Wibisono
  (lC8i5_lJqgU).

## Second pass (owner: "go even deeper… nothing should look vibecoded")
Removed the tells that read as generated: the electric indigo (now a calmer blue), typewriter-style
uppercase labels (now Mercury's sentence-case muted labels), a code-looking pay line (now the pay
screen's own line with superscript cents), a hover fill that left stripes (now Campfire's circles
growing from the arrow), and an oversized hero headline (now Mercury's calmer scale).

## Third pass (owner: "way too basic… draw purely from inspiration, very ambitious")
Four research passes (Stripe, Vercel, Linear; Ramp, Rippling, Brex, Deel, Gusto, Check, Mercury
treasury; Apple, Framer, Raycast, Arc, Cursor, Attio, Linear's README; Granola, Increase, Modern
Treasury, Plain, Clay, Resend, Column, Razorpay) agreed: the best pages make the product do the work on
screen, on sample data, and let the visitor set it off; ours explained instead. The owner chose the
research plan over keeping the second design's sections. What was built, each from its reference, is in
`docs/patterns/site.md`. What keeps it honest:
- "Same week, four states" runs the real rules engine on the reference rule data
  (`src/server/site/state-week.ts`; hand-checked in its test). The four states are the ones the engine
  covers; the report's suggested New York, Washington and Texas were left out.
- "Where the week goes" shows files made by the real exporters (`src/server/site/sample-files.ts`),
  including the clerk's note about the payroll system's own rounding.
- "Rule changes" reads the dated minimum-wage rows (`src/server/site/rule-updates.ts`).
- The owner asked for no timesheet pictures at all: the hero is Linear's app frame without a photo of
  a sheet, Monday's pile has no sheets, and the collage was replaced by Linear's FIG line drawings.
- Left out on purpose: the visitor dropping their own sheet (demo mode makes no outside calls), customer
  logos, quotes and usage counters, WebGL objects and video.
