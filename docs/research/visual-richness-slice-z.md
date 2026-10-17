# Slice z: visual richness — what excellent products publish about giving their UI character

Fetched live on 2026-10-17 (Firecrawl), unless marked otherwise. Owner, this slice: the app looks
"bland, stale, flat, untitled-document-esque"; make it more dynamic and interesting, drawn purely from
documented practice of excellent products — not taste, not radical. Contract unchanged: shadcn/ui +
Tailwind defaults are the base (Tailwind's default palette may be used); never copy a product's logo,
icons, illustrations, wording or brand colours; every choice cites a source. This page builds on
`docs/research/design-gravity-slice-l.md` and decision 0029 (frame, pages, tables, figures, charts
already adopted) and does not repeat them.

Markers: **[verified]** = quoted from a page fetched this session; **[observed]** = seen in a
screenshot taken this session (layout only, nothing copied); **[UNVERIFIED]** = from memory or a
search excerpt only, not read in full — do not rely on it without re-checking.

## Sources read (all fetched 2026-10-17)

| # | Source | URL | Published / updated |
|---|---|---|---|
| L1 | Linear — "How we redesigned the Linear UI (part Ⅱ)" | https://linear.app/now/how-we-redesigned-the-linear-ui | March 28, 2024 |
| L2 | Linear — "A calmer interface for a product in motion" | https://linear.app/now/behind-the-latest-design-refresh | March 12, 2026 |
| L3 | Linear docs — Preferences (Interface and theme) | https://linear.app/docs/account-preferences | current |
| L4 | Linear changelog — "Linear preview: New sidebar & team icons" | https://linear.app/changelog/page/14 (entry 2022-01-20) | January 20, 2022 |
| S1 | Stripe — "Designing accessible color systems" | https://stripe.com/blog/accessible-color-systems | date not shown on page [UNVERIFIED: 2019] |
| S2 | Stripe Apps — Design your app | https://docs.stripe.com/stripe-apps/design | current |
| S3 | Stripe Apps — Style your app | https://docs.stripe.com/stripe-apps/style | current |
| S4 | Stripe Apps — Chart layout pattern (search excerpt) | https://docs.stripe.com/stripe-apps/patterns/chart-layout | current |
| S5 | Stripe Support — Dashboard home page charts | https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights | modified 2026-05-11 |
| G1 | Vercel Geist — Colors | https://vercel.com/geist/colors | current |
| G2 | Vercel Geist — Avatar | https://vercel.com/geist/avatar | current |
| G3 | Vercel Geist — Theme Switcher | https://vercel.com/geist/theme-switcher | current |
| M1 | Mercury — "December 2022 — iOS dark mode, reset 2FA & more" | https://mercury.com/blog/december-2022-product-updates | December 13, 2022 |
| A1 | Atlassian — Color (overview, roles) | https://atlassian.design/foundations/color (requested as /color-new; redirected) | current |
| A2 | Atlassian — Data visualization color | https://atlassian.design/foundations/color/data-visualization-color | current |
| P1 | GitHub Primer — Avatar | https://primer.style/product/components/avatar/ | current |
| P2 | GitHub Primer — Data visualization | https://primer.style/product/ui-patterns/data-visualization/ | current |
| P3 | GitHub Docs — Managing your theme settings | https://docs.github.com/en/get-started/accessibility/managing-your-theme-settings | current |
| C1 | IBM Carbon — Data viz color palettes | https://carbondesignsystem.com/data-visualization/color-palettes/ | current ("work in progress") |
| C2 | IBM Carbon — Simple charts | https://www.carbondesignsystem.com/building-blocks/data-visualization/simple-charts | current |
| Q1 | Shopify Polaris (web components) — Avatar | https://shopify.dev/docs/api/app-home/v1.0/web-components/media-and-visuals/avatar | v1.0 |
| Q2 | Shopify Polaris (web components) — Icon | https://shopify.dev/docs/api/app-home/v1.0/web-components/media-and-visuals/icon | v1.0 |
| MD | Material 3 — Color system: how the system works | https://m3.material.io/styles/color/system/how-the-system-works | current |
| H1 | Apple HIG — Color | https://developer.apple.com/design/human-interface-guidelines/color | change log latest Dec 16, 2025 |
| N1 | shadcn/ui — Theming | https://ui.shadcn.com/docs/theming | current |
| N2 | shadcn/ui — Chart | https://ui.shadcn.com/docs/components/chart | current (Recharts v3) |
| T1 | Tailwind CSS v4.3.3 default palette | `node_modules/tailwindcss/theme.css` (local, the version this app ships) | 4.3.3 |
| X1 | Sign-in pages, screenshots 1920×1080: linear.app/login, vercel.com/login, dashboard.stripe.com/login, app.mercury.com/login, app.ramp.com/sign-in | (live) | 2026-10-17 |

Not found / not readable: a Ramp design or brand post about its product UI (searched ramp.com,
builders.ramp.com — nothing relevant); an Attio design post on record avatars (only the SDK Badge
docs surfaced, via search excerpt); a Stripe document about a Dashboard dark mode; Linear's
`/docs/themes` (404); Primer color-role and CounterLabel pages (not fetched this session).

---

## 1. One accent colour — how it is chosen, where it goes, where it does not

**What they publish**

- Linear builds every theme from three inputs. [verified, L1] "instead of having to define 98
  specific variables for each theme, we defined three: base color, accent color, and contrast." The
  contrast input exists for accessibility: "This allows us to automatically include super
  high-contrast themes for users who need it for accessibility reasons." Generation is in LCH:
  "LCH has the benefit that it's perpetually uniform, meaning a red and a yellow color with lightness
  50 will appear roughly equally light to the human eye."
- Linear deliberately keeps the accent out of the neutral chrome. [verified, L1] "return to a more
  neutral and timeless appearance. The latter was achieved by limiting how much chrome (blue in our
  case) was used in the calculations applied to our color system." And the 2026 refresh [verified,
  L2]: "Linear already allows users to create custom themes by selecting base UI and accent colors
  and adjusting contrast."
- Apple names exactly where an app accent applies. [verified, H1, "App accent colors"] "you can
  specify an accent color to customize the appearance of your app's buttons, selection highlighting,
  and sidebar icons." On restraint [verified, H1]: "If you apply color, reserve it for elements that
  truly benefit from emphasis, such as status indicators or primary actions. To emphasize primary
  actions, apply color to the background rather than to symbols or text … Refrain from adding color
  to the background of multiple controls." And on monochrome apps [verified, H1]: "in apps with
  primarily monochromatic content or backgrounds, choosing your brand color as the app accent color
  can be an effective way to tailor your app experience and reflect your company's identity."
  Consistency [verified, H1]: "Avoid using the same color to mean different things … if you use your
  brand color to indicate that a borderless button is interactive, using the same or similar color
  to stylize noninteractive text is confusing."
- Atlassian assigns the brand colour a role, not a decoration. [verified, A1] `brand`: "Use for
  primary actions or elements that communicate the Atlassian brand." `neutral`: "Use for default text
  and secondary UI elements, such as secondary buttons or navigation elements." Selection and focus
  are separate from brand [verified, A1]: "Use `color.border.focused` only for focus indicators.
  Don't use link, brand, or focused tokens to communicate selection." and "Pair selected colors with
  another visual cue, such as a checkmark, underline, border, or change in shape."
- shadcn's own token table says where `primary` goes. [verified, N1] `primary` /
  `primary-foreground`: "High-emphasis actions and brand surfaces." Used by: "Default `Button`,
  selected states, badges, and active accents." `ring`: "Focus rings and outlines." `sidebar-primary`:
  "Active items, icon tiles, badges, and sidebar CTAs." `chart-1 … chart-5`: "The default chart
  palette." Note: shadcn's `accent` token is NOT a brand colour — it is "Interactive hover, focus, and
  active surfaces" (ghost buttons, menu highlight, hovered rows). Keep it neutral.
- Material 3 derives everything from one source colour. [verified, MD] "A single source color is used
  to generate five key colors, which are used to make tonal palettes. Tones from the palettes are then
  assigned to color roles." Example pairing [verified, MD]: "the algorithm assigns the color tone
  primary40 to the primary role and the tone primary100 to the on primary role." Contrast levels
  [verified, MD]: medium "Provides a minimum contrast ratio of 3:1", high "a 7:1 contrast ratio".
- Atlassian's single-colour chart rule ties charts to the brand colour. [verified, A2] "For data
  visualization requiring only one color, use `color.chart.brand` as the default color choice."
- Stripe limits colour for accessibility and gives brand expression one small place. [verified, S2]
  "Custom styling of UI elements is intentionally limited … we limit the colors you can use for each
  element because color contrast is an important aspect of accessible UI." and "To make your app
  visually distinctive, use the app indicator, a color bar and icon at the top of the app … Unlike
  other UI elements, you can select any color for the app indicator."
- [observed, X1] On all five sign-in pages the only saturated element in the form is the primary
  button (Linear, Stripe, Mercury: a blue-violet fill; Ramp: its brand chartreuse; Vercel: black);
  Stripe and Vercel also colour the "sign up / create account" link.

**How many shades, and contrast**

- Stripe: shades are organised so contrast is predictable by step distance. [verified, S1] "Any two
  colors are guaranteed to have sufficient contrast for small text if they are at least five levels
  apart, and at least four levels apart for icons and large text." And tinted backgrounds: "each
  color also passes when displayed atop the lightest color value in any hue. Since we commonly use
  these lightly tinted backgrounds to offset or highlight sections…" Badge recipe [verified, S1]: "By
  shifting both the background and the text color up one level, we were able to maintain text
  contrast across all badge colors."
- WCAG thresholds as the systems state them. [verified, A1] "Must pass 3:1 contrast: Any UI essential
  to understanding the experience and text 24px or larger … Must pass 4.5:1: Text smaller than 24px."
  [verified, S1] "a minimum contrast ratio of 4.5 for small text, and 3.0 for large text."
- Geist's 10-step scale names each step's job [verified, G1]: colours 1–3 "component backgrounds"
  (default, hover, active), 4–6 "Borders" (default, hover, active), 7–8 "High contrast backgrounds"
  (and hover), 9–10 "Text and icons" ("Secondary text and icons", "Primary text and icons").
  Practical consequence: an accent needs about five roles — solid background, solid hover, text on
  solid, subtle tint background (+ its text), and a ring — which is what Section 12 specifies.

## 2. Neutrals — warm vs cool, background layers

- Linear moved its default greys warmer in 2026. [verified, L2] "The old palette was a cool,
  blue-ish hue, and the aim was to inch toward a warmer gray that still feels crisp, but less
  saturated. Go too warm, though, and the interface risks looking muddy, so getting it right involved
  a fair bit of iteration."
- Linear's surfaces are generated, not hand-picked. [verified, L1] LCH "allowed us to deal with
  different elevations for our surfaces (e.g. background, foreground, panels, dialogs, and modals)."
  Early exploration "mostly worked with opacities of black and white … the relationship … between the
  elements and their respective elevation and hierarchy."
- Linear dims navigation so content leads. [verified, L2] "The navigation sidebar used to appear
  bright enough that it remained visually prominent even after a user had reached their destination.
  In the updated interface, it's a few notches dimmer, allowing the main content area—where users
  work—to take precedence." Borders [verified, L2]: "By rounding out their edges and softening the
  contrast, the polished interface gives users structure on the page without cluttering their view."
- Geist: two page backgrounds, the second used sparingly. [verified, G1] "There are two background
  colors for pages and UI components. In most instances, you should use Background 1—especially when
  color is being placed on top of the background. Background 2 should be used sparingly when a subtle
  background differentiation is needed." Gray vs gray-alpha [verified, G1]: "Gray for text, icons,
  fills, borders, and dividers by default. Gray-alpha only when the background should show through,
  such as in shadows or overlays."
- Stripe Apps: two surfaces. [verified, S3] `surface` "Used for the background of apps";
  `container` "Used for cards and sections within an app".
- Apple: three levels. [verified, H1] "Primary for the overall view · Secondary for grouping content
  or elements within the overall view · Tertiary for grouping content or elements within secondary
  elements."
- shadcn base colours available today [verified, N1]: "Neutral, Stone, Zinc, Mauve, Olive, Mist, and
  Taupe." Granite uses Neutral (pure grey, chroma 0). Tailwind `stone` is the warm grey, `zinc`/`slate`
  the cool ones [T1: stone hue ≈ 49–60°, zinc ≈ 286°].
- [observed, X1] Ramp's sign-in theme colours are warm (`#F4F2F0` light / `#2A2827` dark in the page
  metadata); Mercury's sign-in background is a cool lavender-grey; Linear and Vercel are near-neutral
  off-white. So "warm vs cool" is a product choice; only Linear documents the reasoning.

## 3. Category colours (tags, teams, clients) — when allowed

- Atlassian defines a separate role for meaningless colour. [verified, A1] `accent`: "Use for colors
  that don't have any specific meaning tied to them. You should be able to exchange one accent color
  for another, and the experience would remain unchanged. Accent colors: gray, red, green, blue,
  yellow, orange, teal, purple, magenta, and lime." Rule [verified, A1]: "Don't use an accent when
  the color has semantic meaning."
- Linear introduced coloured team icons in 2022 … [verified, L4, Jan 20 2022] "we've added icons to
  teams. Hopefully, this will make it easier to recognize teams and give them a unique identity. You
  can choose any color, though we've gone ahead to assign icons and generate random colors for them …
  To differentiate team icons from project icons, the color of team icons is applied to the
  background of the icon."
- … and in 2026 removed the coloured backgrounds. [verified, L2, Mar 12 2026] "The refresh reduces
  icon usage, scales their sizes down, and removes unnecessary visual treatments like colored team
  icon backgrounds." Reading: keep the category colour, drop the filled tile.
- Attio's app SDK exposes twelve named badge colours. [search excerpt, https://docs.attio.com/sdk/components/badge]
  `'amber' | 'blue' | 'cyan' | 'green' | 'grey' | 'lavender' | 'lime' | 'orange' | 'pink' | 'purple' |
  'red' | 'yellow'`. [UNVERIFIED — excerpt only; Attio's own guidance on when to use them not read.]
- Stripe badge recipe for coloured tags (one level up for both bg and text) — see Section 1 [S1].

## 4. Avatars and initials — people and organisations

- Shape carries meaning. [verified, P1] "Circle Avatars represent individual people. Square Avatars
  represent non-human entities, such as bots, AI agents, teams, or organizations." "On GitHub, Avatars
  are either rounded squares or circles."
- Sizes. [verified, P1] "Avatars start at 16px and increment by base-4 until 32px. At 32px, the scale
  switches to base-8 up to 48px. 64px is the largest size in this scale." (16, 20, 24, 28, 32, 40, 48,
  64; default 20.) [verified, G2] "Pick a size that matches adjacent type: 20–24px next to
  text-label-14, 32px next to text-label-16, 48–64px in headers and onboarding states."
- Initials. [verified, G2] "Pass src first and fall back to letter (1–2 uppercase chars) when the
  image is missing. Reserve placeholder for the loading shell, never as a permanent fallback." "Keep
  letter uppercase and derived from the entity name. No emoji, no punctuation, no ?." [verified, Q1]
  "Typically one or two characters … Characters beyond the first two might be truncated."
- Colour from the name, stable everywhere. [verified, Q1] "Avatars … provide consistent color
  assignment for initials based on the name provided." Example caption: "avatars with identical
  initials always display the same background color." (Polaris keys on the initials; the algorithm is
  not published — a hash of the string is the implied mechanism [UNVERIFIED as to exact method].)
- Accessibility. [verified, Q1] "use empty alt text if the name appears next to the avatar as text."
  [verified, G2] Geist already prefixes letter avatars with "Avatar with initials:" for screen readers.
- Groups. [verified, G2] "For two or more stacked avatars, use <AvatarGroup> so the cluster gets
  correct overlap, sizing, and a single accessible label." "By default the first member sits on top
  of the stack."
- Use in lists. [verified, Q1] "Use smaller sizes for compact contexts like tables and lists, and
  larger sizes for profile pages where the person is the primary focus." "Place avatars adjacent to
  the names or entities they represent."
- Linear's 2024 redesign "emphasized the faces of your teammates" in notifications [verified, L1].

## 5. Icons in navigation and headers

- Monochrome by default; colour only to carry meaning. [verified, Q2] Icon `color` is "base" or
  "subdued"; `tone` is info/success/warning/critical/caution/neutral/auto — "Tones should convey
  information, not serve as decoration." "Use icons to support actions and status, not decorate …
  Avoid adding icons purely for visual interest." "Pair icons with text labels whenever possible."
- [verified, S3] "For an icon that contrasts with the other children of its container, use fill.
  Otherwise, icons match the text around them."
- [verified, L2] sidebar annotated with "smaller icons, muted inactive text"; "reduces icon usage,
  scales their sizes down".
- [verified, A1] "There are no dedicated hovered and pressed tokens for icons. Instead, we recommend
  using a subtle neutral background to indicate state changes."
- Apple differs: the macOS app accent applies to "sidebar icons" [verified, H1]. For a web back office
  the Linear/Polaris/Stripe rule (neutral icons, accent only on the active item if at all) is the
  better-documented fit; note the disagreement.

## 6. Charts

- **Single series = brand colour; the rest neutral.** [verified, A2] "use `color.chart.brand` as the
  default color choice." "To highlight one piece of data from a data set, use `color.chart.neutral`
  for the less important information so that the important data can stand out." Do: "Use a single
  color as the default for data visualizations. Only add more colors when needing to differentiate
  between data categories."
- **Comparison period.** [verified, S5] Stripe Home: "Pick a comparison range from the third dropdown
  menu" (after date range and time unit). [verified, P2] "Mark lines must always use different stroke
  styles. The first line must always use a solid style, and the following must use other styles to
  easily differentiate them without the use of color." ⇒ current period solid accent, previous period
  dashed neutral (`chart.neutral` per A2). How Stripe draws its comparison line is [observed in
  earlier slice l screenshots; not re-verified today].
- **Area fill.** [verified, C2] "Area charts are similar to line charts, but the areas below the lines
  are filled with colors or patterns." [verified, P2] contrast for "Area fill below line in stacked
  area chart" is "n/a" — the fill may be faint; the line carries the 3:1. Gradients [verified, C1]:
  "Use a gradient on single category visualizations only if needed. Multiple gradients are often
  inaccessible and are discouraged in our system. Gradients should not be used to represent any
  meaningful progression or divergence." Mercury's balance chart area gradient: [UNVERIFIED — not
  documented in Mercury's writing; M1 only says "customize your data view to different intervals,
  track daily changes with the tooltip"]. shadcn's charts library has an "Area Chart - Gradient"
  example [UNVERIFIED this session].
- **Hover: point, crosshair, tooltip.** [verified, P2] chart anatomy: "Point — A point is a visual cue
  that is highlighted on hover. Yes (used for line charts only)"; "Crosshair — A crosshair is a visual
  cue shown in line charts to help users connect the point to the axis label. Yes (used for line
  charts only)"; "Tooltip — Tooltips are shown on hover to display data at a given point on a chart …
  Yes". [verified, N2] shadcn's `ChartTooltipContent` has `indicator` "dot, line or dashed",
  `hideLabel`, `hideIndicator`; `accessibilityLayer` "adds keyboard access and screen reader support".
  [verified, A2] hover: "Use chart hovered tokens … An alternative approach is to fade out data that
  isn't being interacted with."
- **Sparklines next to a figure.** [S4, search excerpt of Stripe's chart-layout pattern] "A compact
  line with no axes or labels. Sits inline next to a KPI value to give directional context at a
  glance … Don't use when users need to read precise values. Sparklines show shape, not numbers."
  Heights: "180 — Matches the chart area in standard Dashboard metric cards", "320 — Featured chart on
  a detail page"; the KPI example is a caption/secondary label, a bold figure, then a 24×80 sparkline.
  Carbon lists "Sparkline" as a simple chart [verified, C2]. Primer disagrees for GitHub: "We don't
  currently support the creation of new: Donut charts, Sparklines" [verified, P2].
- **Series palettes.** Carbon [verified, C1]: "The colors of this palette should be applied in
  sequence strictly … carefully curated to maximize contrast between neighboring colors." Atlassian
  [verified, A2]: "Limit the number of colors … to 5-6 by grouping additional categories together";
  "Our chart colors meet WCAG AA 3:1 contrast ratios when used on any of our elevation surfaces";
  "Don't place text on chart colors". Primer [verified, P2]: "All chart marks … must meet a 3:1
  contrast ratio against the background"; "no more than five lines"; "Axis labels must have a 4.5:1
  contrast"; "Graph lines do not need to meet graphical color contrast"; lines "must have a 2px
  width". shadcn [verified, N1/N2]: `chart-1 … chart-5` tokens, referenced as `var(--chart-1)`.
  Granite's current chart tokens are five greys (oklch 0.87 → 0.269, chroma 0, `src/app/globals.css`).
- **Status colours in charts** stay separate from categorical [verified, A2]: success/warning/danger
  "use established color associations … may be hard for users with color deficiencies to tell apart."

## 7. Big-number figures

Decision 0029 rule 13 already sets figures at 24–28px semibold with tabular digits (Stripe, Mercury).
New documented detail: Stripe's KPI pattern stacks caption-size secondary label → bold figure →
sparkline [S4, excerpt]. Mercury: the balance graph sits with its headline figure and a hover tooltip
"track daily changes with the tooltip" [verified, M1]. Neither publishes exact type sizes
[UNVERIFIED beyond decision 0029's screenshot measurements].

## 8. Dark mode — definition and toggle

- Same roles, different values. [verified, A1] "Each color design token maps to a different value for
  each theme." [verified, MD] "apps receive both light and dark themes through a single set of color
  roles." [verified, N1] "Dark mode works by overriding the same tokens inside a `.dark` selector."
- Don't invert a named palette — use semantic tokens. [verified, M1] "These colors had been
  classified by color names (e.g., "Monochrome/White") — meaning the only way to achieve dark mode
  would have been to invert our palette, creating gauche yellows against drab backgrounds. Instead,
  our designers and engineers created a token-based, semantic color system grouped by usage (e.g.,
  "Background/Primary")."
- Every colour needs light, dark and higher-contrast variants. [verified, H1] "If you define a custom
  color, make sure to supply light and dark variants, and an increased contrast option for each
  variant."
- The toggle: three choices, one place. [verified, G3] "Use Theme Switcher for the canonical Light /
  System / Dark control. Place it once per app, in the footer or settings, not duplicated across
  pages." "Don't rebuild a theme picker with Switch or three icon buttons." [verified, P3] GitHub:
  Settings → Appearance → "Theme mode" — "choose from themes that are light or dark, or … follow your
  system settings"; plus high-contrast and colorblind themes; also reachable from the command palette.
  [verified, L3] Linear: "Select several Light or Dark modes as a preference or choose system
  preference if you'd like the app to switch based on your computer settings."
- Stripe Dashboard dark mode: [UNVERIFIED — no Stripe document found; Stripe documents dark-mode
  appearance variables only for embedded Connect components, https://docs.stripe.com/connect/embedded-appearance-support-dark-mode].

## 9. Sign-in / sign-up pages as they are today [observed, X1, 2026-10-17]

| Product | Layout | Brand panel? | Colour use |
|---|---|---|---|
| Linear | Centred single column on an off-white page; logo mark, "Log in to …" title, a stack of full-width pill buttons (SSO/email/passkey), sign-up line under | No | Only the first button is filled with the accent; all others outlined |
| Vercel | Centred column, large bold title, email field + black primary button, divider, outlined provider buttons; logo top-left, "Sign Up" top-right, terms footer | No | Primary is black; the sign-up link is blue |
| Stripe | Centred white card with shadow over a white page; a large decorative multicolour brand graphic bleeds behind the card on the right; logo top-left; card footer band "New to …? Create account" | Decorative background, not a split panel | Accent on primary button, focus ring, checkbox, links |
| Mercury | Centred white card on a pale cool-grey page; logo top-left, "Open Account" top-right; card divided by a hairline into password login and passkey section | No | Accent (light blue-violet) only on the primary button and focus ring |
| Ramp | Centred column, no card, white page; logo top-left; title, a notice box, one field, full-width primary button | No | Brand colour fills the single primary button |

None of the five uses a split layout with a brand panel; all are centred single columns, three without
a card. Character comes from (a) the accent on exactly one button, (b) the logo mark, and in one case
(c) a decorative brand graphic — which Granite cannot copy and would have to commission.

## 10. Motion / delight — out of scope (handled in slice n).

## 11. "Don't overdo it" — documented restraint

- [verified, L2] Principle title: "Don't compete for attention you haven't earned … not every element
  of the interface should carry equal visual weight … ones that support orientation and navigation
  should recede." "Structure should be felt not seen." Closing: "If most people don't immediately
  notice what changed, that's probably a good sign."
- [verified, L1] "A redesign should not completely disassemble the product to its atomic parts."
- [verified, H1] "Refrain from adding color to the background of multiple controls." "too much color
  can be overwhelming and make control labels more difficult to read."
- [verified, A2] "Don't use more than one color in your data visualization if the additional colors
  don't serve any communication purpose."
- [verified, Q2] "Tones should convey information, not serve as decoration."
- [verified, C1] "Multiple gradients are often inaccessible and are discouraged … Never use a gradient
  in place of a sequential palette."
- [verified, S1] "Accessible doesn't mean vibrant" — WCAG covers contrast, not distinguishability;
  "Understanding how vibrant each color appears can helps to distinguish hues from one another."
- [verified, S3] `critical` "Should be used sparingly."
- [verified, G1] "Background 2 should be used sparingly."

---

## 12. Recommended changes for Granite (prioritised, non-radical)

Each is a token or component-level change inside shadcn/Tailwind; each needs its pattern file updated
before code (CLAUDE.md design rules). Priority 1 = biggest effect on "flat / untitled document".

1. **Adopt one accent in shadcn's `--primary`, `--ring`, `--sidebar-primary`, `--chart-1`** — and
   nowhere else. Allowed: the one primary button per view, focus rings, text links, checked
   checkbox/switch/radio, the active sidebar item's indicator, the current tab underline, the
   single-series chart mark. Not allowed: headings, nav icons, status badges, page backgrounds,
   secondary buttons, `--accent` (stays neutral: hover rows/menus). Sources: N1 token table; H1 accent
   = "buttons, selection highlighting, and sidebar icons" + "Refrain from adding color to the
   background of multiple controls"; A1 brand role + "Use color.border.focused only for focus
   indicators"; L1 limiting accent in chrome; X1 every sign-in page colours exactly one button.
2. **Selected ≠ focused ≠ brand.** Active nav item: neutral tinted background + medium weight (what
   shadcn `sidebar-accent` does) with an accent-coloured icon or 2px indicator; focus: accent ring
   only. Source: A1 "Keep selected and focused states distinct … Pair selected colors with another
   visual cue".
3. **Charts get colour and hover (Home, Margin, Receivables).** Current period: accent line, 2px
   (P2), with a faint same-hue area fill fading to transparent — a single gradient on a single series
   only (C1, C2, P2 "Area fill … n/a"). Previous period: dashed neutral line (S5 comparison range; P2
   "first line … solid … following … other styles"; A2 `chart.neutral`). Hover: point + vertical
   crosshair + tooltip showing both periods (P2 anatomy; N2 `ChartTooltip` with `indicator="line"`;
   M1 tooltip). Turn on `accessibilityLayer` (N2). Gridlines stay hairline grey (P2 "Graph lines do not
   need to meet graphical color contrast").
4. **Sparklines beside key figures** on Home and Margin: caption label → figure → 24×80 sparkline in
   the accent, no axes (S4; C2). Keep the 180px/320px chart heights (S4). [Primer disagrees for its
   own product, P2 — note in the pattern file.]
5. **Avatars with initials for people and organisations.** People (workers, users, contacts):
   circle. Clients, agencies, VMS/payroll connections: rounded square (P1). 1–2 uppercase letters from
   the name, never "?" (G2, Q1). Colour chosen by a stable hash of the full name into a fixed set of
   Tailwind hue pairs — `{hue}-100` background with `{hue}-800` text in light, `{hue}-900` background
   with `{hue}-200` text in dark (Stripe's tint-plus-text recipe, S1; consistency, Q1). Sizes from
   Primer's scale: 20–24px in table rows and lists, 32px in record headers' people lists, 48px in a
   record page title (P1, G2). Empty `alt` when the name is beside it (Q1). Stacked groups for
   "assigned to" lists (G2). All pairs measured ≥ 6.4:1 (table below). Exclude the hues used by status
   tones (red, amber, green/emerald) so avatar colour never reads as status (A1 "Don't use an accent
   when the color has semantic meaning").
6. **Category colour for clients/job-order tags as a small dot or tinted icon, not a filled tile.**
   Users may pick from a fixed list of Tailwind hues (Atlassian's ten accent hues map 1:1 to Tailwind:
   gray, red, green, blue, yellow, orange, teal, purple, pink-for-magenta, lime — A1); default
   assigned automatically (L4). Show it as a dot beside the name or as the avatar tint — Linear
   removed "colored team icon backgrounds" in 2026 (L2). Badges that carry status keep the five
   status tones only (decision 0029 rule 5).
7. **Dark mode with a Light / System / Dark control in Settings → Preferences** (and the command
   menu), default System. Build it by filling shadcn's existing `.dark` tokens — every accent role in
   Section 13 has a dark value — never by inverting colours (G3, P3, L3, N1, M1, H1). Charts and
   avatar tints switch with the theme (A2 "Chart color tokens currently support two color themes").
8. **Slightly dimmer sidebar, content first.** Keep the inset sidebar; make inactive item text
   `muted-foreground`, icons 16px neutral, and the sidebar surface one step off the content panel
   (shadcn `sidebar` token) so the white panel leads. Sources: L2 sidebar "a few notches dimmer",
   "smaller icons, muted inactive text"; G1 Background 1 vs 2; S3 surface vs container.
9. **Consider a warm neutral base (`stone`) — optional, owner's call.** Linear moved from "a cool,
   blue-ish hue" to "a warmer gray that still feels crisp" and warns "Go too warm … muddy" (L2); shadcn
   ships `Stone` as a base colour (N1). Stone-50 vs white is 1.04:1 and stone-100 1.09:1 — identical
   separation to neutral — so no contrast cost. Only one source documents it, so lowest priority.
10. **Sign-in / sign-up: keep the centred single column**, put the accent on the one primary button
    and the focus ring, a neutral page background with the form in a card (Mercury, Stripe) or without
    (Linear, Vercel, Ramp). Do NOT add a split brand panel — none of the five references uses one
    (X1). A decorative graphic (Stripe) would need original art and is not recommended.
11. **Icons stay monochrome; tone only for status.** Status icons inside alerts/badges may take the
    status tone; navigation and header icons never take colour (Q2, S3, L2). This is what keeps items
    1–6 from turning into decoration.
12. **Write the restraint into each pattern file**: one accent-filled control per view; at most 5
    chart series (A2, P2); one gradient per chart, single series only (C1); category colours never on
    status (A1). Source quotes in Section 11.

## 13. Three candidate accent hues (Tailwind v4.3.3 default palette)

**How chosen.** Documented constraints, not taste: (a) the accent must not collide with a status
meaning — Atlassian: "Don't use an accent when the color has semantic meaning" (A1); Carbon's alert
palette assigns red = danger, orange = serious warning, yellow = warning, green = success (C1); Granite
already uses success/warning/critical tones (decision 0029 rule 5). That rules out red, orange, amber,
yellow, green and emerald for a payroll/billing app whose screens are full of status badges. (b) The
pair "white text on accent" must reach 4.5:1 at 14px (A1, S1). Amber fails this anyway: white on
amber-600 = 3.19:1. (c) Each hue must exist as a documented brand/primary or monochrome data-viz
option in a reference system: blue — Carbon's monochrome option 1 (C1) and Atlassian's brand role
(A1 image caption "the button background uses color.background.brand.bold"; that this token is blue
is [UNVERIFIED — seen in the image, not stated in text]); indigo — an Apple system
colour (H1) and the blue-violet primary seen on three of the five sign-in pages (X1); teal — Atlassian
accent hue, Carbon monochrome option 4, Apple system teal (A1, C1, H1). Note: "blue signals trust in
finance" is common lore but no source read this session documents it [UNVERIFIED — not used as a
reason]. Tailwind indigo-600 `#4f39f6` / blue-600 `#155dfc` / teal-700 `#00786f` are Tailwind's own
values, not any product's brand colour [UNVERIFIED that no product uses them exactly; they differ from
the colours observed in X1].

**Ranking.** 1 Indigo — distinct from every status tone including info-blue, highest text contrast,
matches the documented blue-violet primaries. 2 Blue — the most widely documented "brand/primary"
role, but shares its hue with the `info` status tone, so info badges would have to move to sky or
neutral. 3 Teal — distinctive and calm, but sits next to success-green; requires dark text in dark
mode (Material's "on primary" pattern, MD).

Contrast = WCAG 2.x ratio computed from Tailwind's OKLCH values converted to sRGB (channels clipped to
sRGB; browsers gamut-map P3 values slightly differently on sRGB screens, so treat ±0.1 as noise).
Light page = white `#ffffff` / neutral-50; dark page = neutral-950 `#0a0a0a` (shadcn dark `--background`
oklch 0.145), dark card = neutral-900 `#171717`. AA: text 4.5:1, large text and UI parts 3:1.

### Candidate 1 — Indigo (recommended)

| Role | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| Button background (`--primary`) | `indigo-600` #4f39f6 | white text 6.44 ✔ | `indigo-500` #615fff | white text 4.58 ✔ |
| Button hover | `indigo-700` #432dd7 | white text 8.07 ✔ | `indigo-600` #4f39f6 | white text 6.44 ✔ |
| Text on accent (`--primary-foreground`) | `white` | — | `white` | — |
| Link / accent text on page | `indigo-600` | 6.44 on white, 6.17 on neutral-50 ✔ | `indigo-300` #a3b3ff | 9.85 on neutral-950, 8.92 on neutral-900 ✔ |
| Subtle tint bg + its text (selected row, info strip) | `indigo-50` + `indigo-700` | 7.22 ✔ | `indigo-950` + `indigo-200` | 10.74 ✔ |
| Focus ring (`--ring`) | `indigo-500` | 4.58 vs white ✔ (≥3) | `indigo-400` #7c86ff | 6.34 vs neutral-950 ✔ |
| Chart line (`--chart-1`) | `indigo-500` | 4.58 ✔ | `indigo-400` | 6.34 / 5.74 on card ✔ |

Avoid: white text on `indigo-400` (3.12 — fails 4.5).

### Candidate 2 — Blue

| Role | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| Button background | `blue-600` #155dfc | white text 5.26 ✔ | `blue-600` #155dfc | white text 5.26 ✔ (button 3.77 vs page ✔ ≥3) |
| Button hover | `blue-700` #1447e6 | white text 6.82 ✔ | `blue-700` | white text 6.82 ✔ |
| Text on accent | `white` | — | `white` | — |
| Link / accent text | `blue-600` | 5.26 on white, 5.03 on neutral-50 ✔ | `blue-400` #51a2ff | 7.51 on neutral-950, 6.79 on neutral-900 ✔ |
| Subtle tint bg + text | `blue-50` + `blue-700` | 6.26 ✔ | `blue-950` + `blue-300` | 8.13 ✔ |
| Focus ring | `blue-500` #2b7fff | 3.76 vs white ✔ (≥3) | `blue-500` | 5.26 vs neutral-950 ✔ |
| Chart line | `blue-500` | 3.76 ✔ | `blue-400` | 7.51 ✔ |

Avoid: white text on `blue-500` (3.76 — fails 4.5 for 14px labels), so dark mode keeps `blue-600` as
the button. Requires moving the `info` status tone off blue (to `sky` or neutral).

### Candidate 3 — Teal

| Role | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| Button background | `teal-700` #00786f | white text 5.39 ✔ | `teal-400` #00d5be | `teal-950` text 7.76 ✔ |
| Button hover | `teal-800` #005f5a | white text 7.53 ✔ | `teal-300` #46ecd5 | `teal-950` text 9.84 ✔ |
| Text on accent | `white` | — | `teal-950` #022f2e | — |
| Link / accent text | `teal-700` | 5.39 on white, 5.16 on neutral-50 ✔ | `teal-400` | 10.61 on neutral-950, 9.60 on neutral-900 ✔ |
| Subtle tint bg + text | `teal-50` + `teal-700` | 5.17 ✔ (`teal-100`+`teal-800` 6.69) | `teal-950` + `teal-200` | 11.50 ✔ |
| Focus ring | `teal-600` #009689 | 3.66 vs white ✔ (≥3) | `teal-500` #00bba7 | 8.17 vs neutral-950 ✔ |
| Chart line | `teal-600` | 3.66 ✔ | `teal-400` | 10.61 ✔ |

Avoid: white text on `teal-600` (3.66) or `teal-500` (2.42). Teal is the only candidate whose dark
button needs dark text — a documented pattern (MD "on primary") but a visible change between themes.

### Rejected
Amber/orange: white on amber-600 3.19 and orange-600 3.59 fail AA; both read as warning (C1, A1).
Emerald/green: reads as success (C1, A2); white on emerald-600 3.67 fails.

### Supporting palettes measured this session

Avatar / category tint pairs (light `{hue}-100` bg + `{hue}-800` text; dark `{hue}-900` bg +
`{hue}-200` text), status hues excluded: sky 6.54 / 7.13, blue 7.25 / 7.31, indigo 8.18 / 7.68,
violet 7.71 / 7.93, purple 7.51 / 8.02, fuchsia 7.17 / 7.35, pink 6.71 / 6.99, rose 6.59 / 6.81, cyan
6.47 / 7.32, teal 6.69 / 7.51, lime 6.50 / 7.47, stone 13.93 / 13.92 — all pass AA text. (If the
accent is indigo, keep indigo in the set — avatars are not interactive, so no confusion with links
per H1 — or drop it; owner's call.)

Multi-series chart order (only when > 1 series; ≤ 5 per A2/P2; neighbours alternate hue and
lightness per C1), assuming the indigo accent: light `indigo-500` 4.58, `cyan-600` 3.60, `pink-500`
3.58, `amber-600` 3.19, `neutral-500` 4.73 (comparison/other) — all ≥ 3:1 on white; dark `indigo-400`
5.74, `cyan-400` 9.90, `pink-400` 6.49, `amber-400` 10.43, `neutral-400` 6.91 on neutral-900. Not
validated for colour-vision deficiency — P2 and A2 both require a second cue (dash style, markers,
direct labels), so the colour order is not the only differentiator.

## Open items for the owner (one at a time, per CLAUDE.md)
1. Pick the accent: indigo, blue or teal.
2. Warm neutral (`stone`) or keep pure grey (`neutral`)?
3. Dark mode in this slice or a later one?
