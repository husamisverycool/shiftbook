# Website design research — slice aa (2026-10-20)

How the best-designed B2B marketing sites build a home page, a pricing page and a security page, so
Tabulado's website copies their hierarchy and interactions (never logos, names, icons, wording or
colours). Pages were read through Firecrawl (text, HTML class names, a branding summary); no
screenshots, so shadows, tilt and section padding are unverified. Content research is in
`docs/research/website-content-slice-aa.md`.

## Per site

- **Linear** (https://linear.app, /pricing, /security). Order: skip link → nav (Product and Resources
  menus, Pricing, Log in, Sign up) → hero (8 words, ~64px, Inter; per-line reveal from
  `opacity:0; blur(10px); translateY(20%)`) → hero product built from real app elements → logo row →
  two-tone statement → feature chapters (heading `max-width:18ch`, paragraph, live UI, feature rows) →
  changelog strip → final CTA (`max-width:16ch`) → six-column footer. Mobile menu: two bars animating
  in 160ms. Pricing: four cards, "All X features +", comparison table, no FAQ. Security: hero + card
  groups + certification text cards.
- **Stripe Billing** (https://stripe.com/billing). Hero sentence with an emphasised lead clause; the
  product as layered UI inside fake browser frames; a large accordion of chapters, each with its own
  visual; FAQ; numbered footnotes; footer language picker ("United States (English)") — the only
  visible language picker found.
- **Mercury** (https://mercury.com, /pricing, /security). Hero 3 words, email + "Open account", a
  "Launch demo" link, a legal line under the buttons; demo also in the nav; footnotes. Security page:
  hero → stat → "How we keep your funds safe" → "How we protect your account" → controls → "Your data.
  Your eyes only." → FAQ → CTA; a `security@` address.
- **Ramp** (https://ramp.com). Tabbed feature switchers, bento grids, "Systems that never spoke"
  before-and-after, the hero line repeated as the final CTA.
- **Attio** (https://attio.com, /pricing). Header `border-b bg-…/95 backdrop-blur-md`, menus
  `rounded-2xl … duration-150` from `-translate-y-1`; buttons `h-9 rounded-[10px]`, hover in 50ms out
  300ms. Hero `clamp(64px, 16px + 5.333svh, 80px)`, tracking about −0.03em, `leading-[0.95]`,
  semibold, balanced, entrance from `blur(1.5px) opacity:0`. Two-tone section headings (bold sentence,
  muted continuation), `max-w-[22em]`. Final CTA `clamp(36px, 26px + 2.5vw, 56px)`, `max-w-[12em]`.
  Pricing: four cards, one "Popular", specific button labels, comparison table, 12-question FAQ. Built
  on Tailwind and shadcn, like Tabulado.
- **Resend** (https://resend.com, /pricing, /security). Header `sticky top-0 h-[58px]`, container
  `max-w-7xl px-6`, blur layer fading in on scroll, links `text-sm font-medium duration-150`. Code
  window with an `h-12 border-b` title bar; code beside its rendered result; a nine-item grid of short
  heading/text pairs; tabbed large screenshot; final CTA. Security: badges with "HIPAA (In progress)",
  controls lists, responsible disclosure, FAQ (encryption, DPA, storage, retention, AI subprocessors).
- **Vercel** (https://vercel.com/design.md). Body text 60–68 characters per line; no decorative
  gradients, glows or glass; never reveal every section on scroll; respect reduced motion; colour only
  with meaning; tabular figures; sentence-case headings.
- **Plain** (https://www.plain.com). A security band on the home page linking to security.
- **Gusto** (https://gusto.com, /product/pricing). Tabbed switcher ("Run payroll in five minutes
  flat."), pricing as base + per-person, FAQ ("Do I have to sign a long-term contract?").
- **Warp** (https://www.warp.co/pricing). FAQ: "Are there any hidden fees?", "How does billing work?".
- **Check** (https://www.checkhq.com/platform). What you build versus what Check handles.
- **Column** (https://column.com). Credibility from checkable facts and visible inner workings rather
  than a logo wall — the model for a product with no customers.

## Patterns across them

1. Order: hero → proof → 3–5 product chapters → breadth grid → security → repeated CTA → dense footer.
2. Hero: 3–8 words, one sentence under it, one filled and one quiet button, a large product picture.
3. Headings: heavy and tight (about −0.03em), line height 0.95–1, balanced, capped at 16–22ch;
   two-tone.
4. Product further down: switchers or accordions with a visual per item, zoomed crops, grids.
5. Header: sticky; blur and border appear on scroll; 58–64px.
6. Motion: only the hero animates on load; hover fast; menus ~150ms and 4px.
7. Pricing: few cards, specific labels, plain FAQ, footnotes. Security: hero, control groups, honest
   status, disclosure, FAQ.

## Applied in slice aa

The pattern files `docs/patterns/_layouts/site.md`, `docs/patterns/site.md`,
`docs/patterns/site/pricing.md` and `docs/patterns/site/security.md` name, section by section, which
reference each part copies. Tokens stay the product's: Geist Sans, warm stone neutrals, the person's
accent, Primer motion (100/200/300ms with the existing easings). Product pictures are built from the
app's own components with the demo agency's sample data (Linear), framed as a window (Stripe, Resend).
