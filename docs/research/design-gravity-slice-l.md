# Slice l: design with more gravity — reference research (fetched 2026-10-16)

Owner, 2026-10-16: more gravity and some creativity, drawn purely from excellent, documented products,
not radical. Two research passes read the published design systems of Shopify Polaris, GitHub Primer,
Atlassian, IBM Carbon, Vercel Geist, Stripe, Linear, Mercury, Ramp, Apple's Human Interface Guidelines
and Material Design 3 (through Google's Android docs). Their notes follow in full (parts A and B). The
rules Shiftbook adopts from them are in decision 0029; this page keeps the evidence.

Fetched in this session besides the two passes:
- https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide — the setup guide: a heading
  with dismiss and collapse buttons, an intro line, "0 out of 3 steps completed", steps as rows with a
  checkbox and an expand toggle, one step expanded at a time with its description, actions and a small
  picture; "Mark tasks as complete when merchants finish them to reinforce progress"; it belongs on the
  homepage.
- https://docs.stripe.com/dashboard/basics — the sidebar's first section is Home, Balances,
  Transactions, Customers, Product catalog, then "Shortcuts", then "Products"; "The Home page provides
  analytics and charts about your business performance. It also surfaces important notifications";
  `?` lists the keyboard shortcuts.
- https://ui.shadcn.com/docs/components/sidebar — the sidebar's `inset` variant wraps the page in
  `SidebarInset`; `SidebarGroup` with an optional `SidebarGroupLabel` groups related navigation.
- https://carbondesignsystem.com/components/data-table/style/ — the column header row sits on
  `$layer-accent` (a tint of the table's surface) with 14px semibold text; rows are 40px by default;
  zebra rows are an option, not the default.

Not readable from here (not cited): classic polaris.shopify.com pages (they redirect), m3.material.io
(JavaScript only), Mercury's help center (403), Linear's status-icon page (404), Carbon's page header
(404).

---

# Part A — Admin design systems (Polaris, Primer, Atlassian, Carbon)


Quoted text is verbatim from the fetched pages. Source IDs map to the exact URLs listed under each section. These are layout and behaviour rules only: do not copy any system's names, icons, wording or colours.

**Not fetched**
- **Classic Polaris:** all polaris.shopify.com and polaris-react.shopify.com URLs now redirect (301) to https://shopify.dev/docs/api/polaris, which has no component guidance. web.archive.org is blocked here. So these are **unverified**: Layout one-half/one-third/annotated sections, the Typography scale, Box spacing tokens, Skeleton, Data-visualization, Bulk-actions, and the badge tones `attention`, `new` and `progress`. I used the current Polaris docs on shopify.dev instead.
- **Carbon "Page header":** returns 404 on the current site.
- **Carbon "data spacing":** no such page found. I used the Dashboards page instead.

---

## 1. Shopify Polaris (current docs, shopify.dev)

- **Page header [P1].**
  - "Always provide a title that describes the current page."
  - "Include breadcrumbs when the page is part of a flow."
  - "Include no more than one primary action and 3 secondary actions per page."
  - "Include page actions in the header only if they are relevant to the entire page."
  - "Don't include any actions at the bottom of the page."
  - Widths: `small` for forms, `base` (has an aside), `large` for dashboards.
  - A page-state banner goes in a slot that "renders between the page header and the sections".
- **Layout [P3].**
  - Use a full-width page for index pages whose lists "have many columns".
  - "The Shopify admin is built on a 4px spacing grid."
  - "Avoid changing information density within a single page."
  - "The majority of your app's content should live in a container, such as a card."
  - Cards: "at most one primary styled action".
  - "Avoid using primary style buttons in tables."
- **Detail page [P2].** "Use the primary column for information that defines the resource. Use the secondary column for supporting information such as status, metadata, and summaries."
- **Section (card) [P4][P10].**
  - "Put content that qualifies the heading, like a count … in `accessory`. Put the state of the whole section, like a status badge, in `supplemental`."
  - Header: "two actions inline at most".
  - Headings: "Avoid vague headings like 'Details'." "All card headings in a list should look the same."
- **Badge [P5].**
  - Tones: info, success, warning, critical, caution, neutral. An optional icon reinforces "status meaning".
  - Use "`large` size … like a primary status indicator at the top of a page".
  - "Keep labels to 1-2 words." "Always use past tense for status labels."
  - "Use consistent tones for the same status across your app."
  - In tables, give badges "their own column".
- **Banner [P6].**
  - "One piece of information or required action per banner."
  - "Info, warning, and critical banners should include a call to action with specific next steps."
  - Page-wide banners go outside sections; contextual ones go inside.
- **Empty state [P7].**
  - "Say why it's empty, then what to do."
  - "Offer one clear primary action."
  - "Distinguish empty from filtered."
  - The graphic is optional: "a single icon or image".
- **Numbers and text [P8][P9].**
  - Tabular numerals so figures "line up in columns".
  - "Use a larger fontSize for the figure a merchant should read first, such as a total." Example: a "larger, bolder order total beneath a subdued subtotal".
  - "A tone on every figure makes none of them stand out."
  - "Subdued text works well for timestamps and metadata, but avoid using it for critical information."
- **Tables and metrics [P11][P12][P13][P16].**
  - Keep to the "minimum columns needed". Paginate above "50-100 rows".
  - "Use checkboxes for bulk selection, reveal row actions on hover, and include pagination." Confirm destructive bulk actions in a modal.
  - Metrics card "highlights important numbers, statistics, or trends"; "Include trend indicators when historical comparison adds context". The index template lists it as a recommended composition.
  - Settings group options "into logical groups that provide contextual help alongside form controls" [P15].

**Sources**
- P1 https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/page
- P2 https://shopify.dev/docs/api/app-home/latest/patterns/templates/details
- P3 https://shopify.dev/docs/apps/design/layout
- P4 https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/section
- P5 https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/badge
- P6 https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/banner
- P7 https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/empty-state
- P8 https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number
- P9 https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/text
- P10 https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/heading
- P11 https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table
- P12 https://shopify.dev/docs/api/app-home/latest/patterns/compositions/index-table
- P13 https://shopify.dev/docs/api/app-home/latest/patterns/compositions/metrics-card
- P15 https://shopify.dev/docs/api/app-home/latest/patterns/templates/settings
- P16 https://shopify.dev/docs/api/app-home/latest/patterns/templates/resource-index

## 2. GitHub Primer

- **PageHeader [G1][G2].**
  - Parts: context bar, title bar, description, navigation.
  - Leading visual: "octicons, avatars".
  - Trailing visual "can denote status".
  - Trailing action: "subtler actions aligned directly next to the title".
  - A back button can be the leading action.
  - "Default title (medium) is the most common page title size."
- **UnderlineNav (tabs) [G3].**
  - "Each tab should load unique content with a dedicated URL." A tab is preselected.
  - An optional count sits next to the label.
  - "Avoid more than 2 levels of tab hierarchy."
  - Not for "stepped flows".
- **Blankslate and empty states [G4][G5].**
  - Parts: graphic, primary text, optional secondary text, "one primary action", optional link.
  - Errors: the graphic "should not attempt to bring delight … Default to using the alert icon".
  - "Vague messages like 'There was a problem' can be frustrating."
- **DataTable [G6].**
  - The header holds a title, subtitle, actions and a filter.
  - "Right-align numeric values and use the [tabular] font variant."
  - "It's easier to scan many rows than … many columns."
  - "Leave empty cells blank … don't use a character like 'x' or '-'."
  - Skeletons "match the real content as closely as possible".
  - "20 rows is a good place to start."
  - "Allow the title in the page header to act as a table title."
- **Label and StateLabel [G7][G8][G18].**
  - "You can't rely on the scheme/variant alone." Prefix meaning in the text, for example "Pass: …".
  - Contrast: text at least 4.5:1, icon at least 3:1.
  - Each status variant has an associated icon. Labels "must be used consistently across the product".
- **Timeline [G9].** Vertical items with badges; "condensed" items for minor events. Breaks are decorative only.
- **Typography [G10][G11].**
  - Scale: title-large 32/600, **title-medium 20/600**, title-small 16/600, body 14 (12 small), caption 12.
  - "Refrain from utilizing color as a primary method of emphasis."
- **Colour roles [G12][G13].**
  - accent: "Links, selected, active, and focus states, and neutral information"
  - success
  - attention: "Warning states, active processes"
  - danger
  - done: "Completed"
  - Foreground tokens include default, muted and severe. The usage page does not describe severe.
  - Muted background plus border gives "subtle emphasis".
- **Banner [G14].**
  - "Do not display more than one banner … on a single page at the same time."
  - "Don't use heading styling or multiple type sizes in banners."
  - At most 2 actions.
  - Critical banners stay until resolved.
  - "Only use success messages if the success is not easily apparent in the UI."
  - Place "near the relevant section or above the page headline". In dialogs, place it below the header.
- **Loading [G15].** "Less than 1 second: Don't show a loading state." Use skeletons for large areas. "Avoid creating a jarring layout shift."

**Sources**
- G1 https://primer.style/product/components/page-header/guidelines/
- G2 https://primer.style/product/components/page-header/
- G3 https://primer.style/product/components/underline-nav/guidelines/
- G4 https://primer.style/product/components/blankslate/guidelines/
- G5 https://primer.style/product/ui-patterns/empty-states/
- G6 https://primer.style/product/components/data-table/guidelines/
- G7 https://primer.style/product/components/label/accessibility/
- G8 https://primer.style/product/components/state-label/accessibility/
- G9 https://primer.style/product/components/timeline/
- G10 https://primer.style/product/getting-started/foundations/typography/
- G11 https://primer.style/product/primitives/typography/
- G12 https://primer.style/product/getting-started/foundations/color-usage/
- G13 https://primer.style/product/primitives/color/
- G14 https://primer.style/product/components/banner/guidelines/
- G15 https://primer.style/product/ui-patterns/loading/
- G17 https://primer.style/product/getting-started/foundations/layout/
- G18 https://primer.style/product/components/state-label/

## 3. Atlassian Design System

- **Page header [A1].**
  - Parts: breadcrumbs, title, actions, search/filter bar.
  - "Use one page header per page."
  - Not inside a "popup, dialog, or drawer".
  - Sentence case.
- **Lozenge [A2][A3].**
  - For "workflow status, … system state, … priority, … permissions". It has "higher visual prominence than a tag", which is for "descriptive metadata".
  - Current appearances:
    - Neutral: "draft"
    - Success
    - Warning: "pending", "needs review"
    - Danger: "failed", "blocked"
    - Information: "in progress"
    - Discovery: "new"
  - The legacy names `default`, `inprogress`, `moved`, `new`, `removed` and `success` are **not** on the current pages. Mapping them to the new names would be my own inference.
  - Filled icons are for urgent states, "Don't overuse".
  - Sentence case. "Don't use color alone." Maximum width 200px.
- **Empty state [A4].**
  - Parts: optional spot illustration, header, description, buttons.
  - Widths: 464px default, 304px narrow.
  - Tone: first use is motivating, all done is celebratory, no results is neutral.
- **Section message [A5].**
  - "Persistent, but can disappear when the person takes action."
  - "Don't rely on color alone to convey the severity."
  - "Avoid dead ends."
  - Use "About user permissions" rather than "Learn more".
- **Dynamic table [A6].**
  - "Never rely on highlighted rows to convey important meaning."
  - "Never put additional controls like links or buttons in table headings."
  - Edit labels are unique per row: "Edit component 3".
- **Typography [A7].**
  - Headings (bold): 32, 28, 24, 20, 16, 14, 12px. "XL and L are suitable for page titles in apps."
  - Body default: 14px.
  - **Metric** tokens, "when you want to emphasize certain numbers": 28/32, 24/28 and 16/20 bold.
  - "Use heading styles, rather than bold or a change of font size."
  - One h1. Don't skip levels.
- **Elevation [A8].**
  - Levels: sunken, default, raised, overlay.
  - "To create flat cards, pair [default surface] with a border."
  - Raised: "limit to one section or focal point". "Don't use to group content when a border or white space would suffice."
  - Overlay is for "modals, dialogs, dropdown menus".
  - A border is the default cue when content scrolls under something.
- **Spacing [A9].**
  - 8px base unit. Tokens: 2–80px (2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80).
  - 0–8px for small UI and "table cells".
  - 12–24px inside cards.
  - 32–80px "for layout elements".
- **Colour [A10][A11].**
  - Roles: neutral, brand, information, success, warning, danger, discovery, plus accent.
  - "Don't use an accent when the color has semantic meaning."
  - Contrast: 4.5:1 for text under 24px; 3:1 for essential UI.
  - "Never rely on color alone to convey meaning."

**Sources**
- A1 https://atlassian.design/components/page-header/usage
- A2 https://atlassian.design/components/lozenge/usage
- A3 https://atlassian.design/components/lozenge/examples
- A4 https://atlassian.design/components/empty-state/usage
- A5 https://atlassian.design/components/section-message/usage
- A6 https://atlassian.design/components/dynamic-table/usage
- A7 https://atlassian.design/foundations/typography
- A8 https://atlassian.design/foundations/elevation
- A9 https://atlassian.design/foundations/spacing
- A10 https://atlassian.design/foundations/color
- A11 https://atlassian.design/foundations/accessibility

## 4. IBM Carbon

- **Data table [C1][C2].**
  - Rows: xs 24, sm 32, **md 40 (the default)**, lg 48, xl 64px. "Use consistent component sizes throughout a layout."
  - Header, toolbar, batch-action bar and pagination heights match the row height.
  - Title and description in sentence case. Column titles are "one or two words".
  - The toolbar holds "up to five actions".
  - Batch actions: when a row is selected, "the batch action bar appears at the top of the table". Row actions "should be disabled" in batch mode.
  - **Zebra** striping is an optional modifier "to make scanning horizontal information easier", not the default.
  - "Avoid placing data tables inside … smaller containers."
- **Tile [C3].**
  - "A different color than the UI background."
  - Tiles "do not have elevation". "Do not add a drop shadow to tiles."
- **Tag [C4].** Read-only tags are for categories, not status.
- **Empty states [C5].**
  - Parts: optional image, title, body, primary action, secondary link.
  - Write the title as "a positive statement", for example "Start by adding data assets".
  - Types: no data, user action (no results or done), error.
- **Status indicators [C6].**
  - Elements: symbol, shape, colour and type. "For WCAG compliance, at least three of these elements must be present."
  - An icon indicator is "an icon, a shape, a meaningful color, and a descriptive inline label".
  - Differential indicators need a "+"/"-" sign, a caret or an arrow.
  - For consolidated status, use "the highest-attention color".
  - "Avoid using status indicators when no user action is required."
- **Notification [C7].**
  - Inline notifications go "at the top of the primary content area or close to the item needing attention".
  - Parts: icon, title, body, close.
- **Dashboards [C8].**
  - "The most important data should have the highest contrast and occupy the largest area."
  - F-pattern layout.
  - "Limit the number of metrics."
- **Type [C9].** The productive set has a 14px base and "fixed headings" for "higher density of information housed inside containers".
- **Spacing [C10].** Tokens: 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160px.

**Sources**
- C1 https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines
- C2 https://www.carbondesignsystem.com/building-blocks/core/components/data-table/specifications
- C3 https://www.carbondesignsystem.com/building-blocks/core/components/tile/guidelines
- C4 https://www.carbondesignsystem.com/building-blocks/core/components/tag/guidelines
- C5 https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states
- C6 https://www.carbondesignsystem.com/building-blocks/core/patterns/status-indicators
- C7 https://www.carbondesignsystem.com/building-blocks/core/components/notification/guidelines
- C8 https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards
- C9 https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets
- C10 https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview

## 5. Colour accessibility (all four agree)

Never colour alone: text plus an icon or shape [A2, A11, G7, C6, P9]. Contrast: text 4.5:1, icons 3:1 [G8, A10]. Emphasise with weight or size, not colour [G10]. Check dark mode separately [A8].

---

## 6. Synthesis: 14 low-risk changes for gravity

Screen types: L = list, D = detail, S = settings, Db = dashboards/analytics, W = wizards, Dg = dialogs, Si = sign-in.

1. **Structured page header.**
   - Title, a large status badge, and one muted metadata line.
   - Back link or breadcrumb on detail pages.
   - At most 1 primary and 3 secondary actions on the right; none at the bottom.
   - Sources: [P1][P2][G1][A1].
   - Applies to: L, D, S, Db. Wizards get title and breadcrumb only. Not in dialogs [A1].
2. **Detail-page tabs under the header.**
   - Each tab has its own URL and a count. One level only. Never for stepped flows.
   - Source: [G3].
   - Applies to: D, S.
3. **Metric strip above lists and dashboards.**
   - 3–4 flat cards. Each has a muted label, a 24–28px bold tabular number, and an optional delta with a sign or arrow.
   - Each card links to the filtered list. Keep the number of metrics small.
   - Sources: [P13][P16][A7][C6][C8].
   - Applies to: L, Db.
4. **Number typography.**
   - Tabular numerals, right-aligned.
   - Totals larger and bolder than subdued subtotals.
   - No tone on every figure.
   - Sources: [P8][G6].
   - Applies to: L, D, Db, Dg.
5. **Two-column detail layout.**
   - Main column for what defines the record.
   - Side column for status, key facts, summaries, and a condensed activity timeline.
   - Sources: [P2][G9][G17].
   - Applies to: D. Settings use the side column for help [P15].
6. **Section cards with real headers.**
   - Descriptive heading, a count, a status badge on the right, and at most 2 actions.
   - Tables run full-bleed inside.
   - Flat surface + 1px border, no shadow.
   - Sources: [P4][P10][A8][C3].
   - Applies to: D, S, Db.
7. **One status vocabulary.**
   - Every status is icon + tone + 1–2-word label (past tense, sentence case), from a single data table.
   - Status gets its own table column. Use at least 3 of: symbol, shape, colour, text.
   - Sources: [P5][A2][C6][G8].
   - Applies to: all.
8. **Tone discipline.**
   - Fixed set: neutral, info, success, warning, critical, new.
   - Categorical tags look different from status.
   - Never use decorative colours for meaning.
   - Sources: [A3][A10][C4].
   - Applies to: all.
9. **Blocking-issue banner.**
   - One per page, between the header and the content. One message with one specific action.
   - Not dismissible until resolved. Descriptive link text.
   - Contextual messages go inside the relevant card.
   - Sources: [P1][P6][G14][A5][C7].
   - Applies to: L, D, Db, W. In dialogs, place it under the header [G14].
10. **Designed empty, loading and error states.**
    - Empty: one icon, a "why" heading, a "what next" body, and one primary action.
    - Filtered-empty explains how to change the filter.
    - Errors use an alert icon and no playfulness.
    - Skeletons match the real layout; no loader for waits under 1 second.
    - Sources: [P7][G5][C5][A4][G15][G6].
    - Applies to: L, D, Db, Dg.
11. **Heading scale on a 14px base.**
    - Page title 20–24px semibold; section heading 16px semibold; body 14px; metadata 12px muted.
    - One h1.
    - Sources: [G11][A7][C9][G10].
    - Applies to: all. Sign-in may use the larger page-title size [A7].
12. **Muted vs default text.**
    - Muted only for timestamps, IDs and helper text. Never for critical facts.
    - Contrast at least 4.5:1.
    - Sources: [P9][G12][A10].
    - Applies to: all.
13. **One spacing scale on a 4/8px grid.**
    - 4–8px inside cells and badges; 12–24px inside cards; 32px or more between regions.
    - Same density across a page.
    - Sources: [P3][A9][C10].
    - Applies to: all.
14. **Table and bulk-action conventions.**
    - One row height shared by the header, toolbar and pagination: 40px default, 32px compact.
    - Zebra stripes optional; choose one approach app-wide.
    - Headers of 1–2 words; blank empty cells; secondary-styled row actions with labels unique to each row.
    - Selecting rows swaps in a batch bar with count and Cancel. Destructive batch actions are confirmed in a modal.
    - About 20–50 rows per page.
    - Sources: [C1][C2][G6][A6][P3][P11][P12].
    - Applies to: L, and tables inside D.

---

# Part B — Modern product design (Geist, Stripe, Linear, Mercury, Ramp, Apple, Material 3)


Researched 2026-10-16. Every page below was fetched and read with WebFetch, or through the official JSON or HTML data behind it, unless it is marked **not fetched**. Firecrawl was out of credits.

The pages we could not read:
- **m3.material.io:** it needs JavaScript to show content. We used Google's official Android Material 3 docs instead.
- **Mercury Help Center:** it returned HTTP 403.
- **Linear issue-status docs:** they returned 404.
- **Geist icons guidance:** the icons page only names the icon set.

Patterns only, never assets. Quotes are verbatim; "≈" marks a paraphrase.

---

## 1. Vercel Geist

- **G1 Type families.** Source: https://vercel.com/geist/typography
  - Heading: "Used to introduce pages or sections." Sizes run from 72 down to 14.
  - Label: "Designed for single-lines." Label 14 is "the most common text style". On Label 13: "Tabular is used when conveying numbers."
  - Copy: for multi-line text, with taller line height. Copy 14 is the most common.
  - Mono pairs one step smaller (label-13-mono beside label-14).
  - Only the sizes are published, in the token names.
- **G2 Ten-step color scale.** Source: https://vercel.com/geist/colors
  - 100/200/300: default, hover and active backgrounds.
  - 400/500/600: default, hover and active borders.
  - 700/800: high-contrast backgrounds.
  - 900: "Secondary text and icons". 1000: "Primary text and icons".
  - Background-200 is used "sparingly". Gray-alpha only where the background should show through.
- **G3 Materials.** Radius plus relative lift. Source: https://vercel.com/geist/materials
  - On the page: base and small 6px; medium and large 12px.
  - Floating: tooltip 6px with the "Lightest shadow"; menu and modal 12px; fullscreen 16px with the "Biggest lift".
  - No shadow values are published.
- **G4 Badge.** Source: https://vercel.com/geist/badge
  - "One badge per row." One or two words, static, never clickable.
  - Color meanings: green healthy, red errors, amber warnings, blue informational, gray neutral.
  - "Don't add checkmarks or X icons for status." Each color has a subtle variant.
- **G5 Status Dot and Gauge.**
  - The dot is for lifecycle state; "Color is not the only signal". Source: https://vercel.com/geist/status-dot
  - Gauge thresholds "should match the same numeric breakpoints used elsewhere". Always add a label. Source: https://vercel.com/geist/gauge
- **G6 Entity row and Description list.**
  - Entity: avatar, label, muted metadata, at most one or two controls on the right, more in a dots menu. Button labels are Verb + Noun. Source: https://vercel.com/geist/entity
  - Detail-page metadata is a `<dl>` key/value list, not a two-column table. Source: https://vercel.com/geist/description
- **G7 Table.** Source: https://vercel.com/geist/table
  - "Apply `tabular-nums`… to numeric columns so digits align."
  - Headers are nouns, and sortable headers are buttons.
  - Show "—", not "N/A".
  - Relative times switch to dates after 7 days.
  - The empty state sits outside the table.
- **G8 Empty State.** Source: https://vercel.com/geist/empty-state
  - Separate variants for blank slate, no results and error.
  - One primary CTA, labeled Verb + Noun. Avoid "Get Started".
  - The description "adds new information".
- **G9 Note.** Source: https://vercel.com/geist/note
  - "Inline contextual feedback next to the field, card, or section it describes."
  - No dismiss button, and "One Note per concept."
  - A Banner covers page-level messages.
- **G10 Skeleton.** Source: https://vercel.com/geist/skeleton
  - Use it for known layouts and match the final size.
  - Respect reduced motion.
  - Use a Spinner for single actions, and never use a skeleton as an empty state.
- **G11 Avatar.** Source: https://vercel.com/geist/avatar
  - "20–24px next to `text-label-14`, 32px next to `text-label-16`."
  - Initials fallback of "1–2 uppercase chars".

## 2. Stripe

- **S1 Tokens.** Source: https://docs.stripe.com/stripe-apps/style
  - Backgrounds: `surface` "background of apps"; `container` "cards and sections".
  - Borders: `neutral` "default color for all borders and dividers".
  - Text: `primary`, `secondary`, `disabled`.
  - Semantic: `info`, `success`, `attention`, `critical` ("Should be used sparingly").
  - Text roles: heading, subheading, body, caption.
  - Spacing: 2, 4, 8, 16, 24, 32, 48px.
- **S2 Badge.** Read-only. Source: https://docs.stripe.com/stripe-apps/components/badge.md?app-sdk-version=9
  - Neutral, Info and Positive/Negative have "no action required".
  - Warning: "Needs immediate action, optional to resolve".
  - Urgent: "strong requirement to resolve".
- **S3 Banner.** Types are default, caution and critical. It spans its container and is for "important information requiring user input and persistent display". Source: https://docs.stripe.com/stripe-apps/components/banner.md?app-sdk-version=9
- **S4 Overview and detail pages.**
  - Both use a primary column, an optional secondary column and titled modules, with a skeleton while `pending`. Source: https://docs.stripe.com/stripe-apps/components/overviewpage.md?app-sdk-version=9
  - Detail header: title, description, breadcrumbs and actions. Source: https://docs.stripe.com/stripe-apps/components/detailpage.md?app-sdk-version=9
    - Breadcrumbs are ancestors only.
    - "Position your primary action first, followed by secondary and destructive."
    - Two columns suit "a main activity feed and a sidebar of metadata" and "line items on the left and a summary on the right".
- **S5 Charts.** Source: https://docs.stripe.com/stripe-apps/patterns/chart-layout
  - Chart type follows the user's question: line for trend, bar for category totals, meter for a breakdown, and a sparkline that "sits inline next to a KPI value".
  - "Show the current value above the chart." KPI anatomy: a secondary-color caption, then a bold value, then a 24×80 sparkline.
  - Heights: 180px in a module, 320px for a featured chart. At most three charts in a row (about 200px minimum width).
  - Keep the same height across loading, empty, error and populated states.
- **S6 Timeline.** "View the **Timeline** section to see a record of state changes." Source: https://docs.stripe.com/global-payouts/manage-payouts
- **S7 Lists.**
  - Status and currency cell types. A row click opens the detail page. An "x–y of z results" caption. Source: https://docs.stripe.com/stripe-apps/components/datatable.md?app-sdk-version=9
  - Filter chips sit above the table and match the column labels. "Clear filters" appears "only when at least one filter is active". Source: https://docs.stripe.com/stripe-apps/patterns/filter-controls
- **S8 Empty states.** Source: https://docs.stripe.com/stripe-apps/patterns/empty-state
  - The title states what's missing. The description is under 14 words. The action matches the title.
  - "Don't show a 'create first item' call to action when items exist but are filtered out."
  - A single empty section gets a dashed 1px box.
- **S9 Loading.** Source: https://docs.stripe.com/stripe-apps/patterns/loading
  - Delay the spinner by 200–300ms.
  - "Don't wrap `Tabs` in a loading state."
  - Buttons use a `pending` state.
  - Put actions in the header. Source: https://docs.stripe.com/stripe-apps/patterns/action-buttons
- **S10 Home.** Sources: https://docs.stripe.com/dashboard/basics and https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
  - Home has "analytics and charts" and "surfaces important notifications".
  - It offers date range, interval and comparison-range controls.

## 3. Linear

- **L1 2024 redesign.** Source: https://linear.app/now/how-we-redesigned-the-linear-ui
  - Goal: "reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements".
  - Themes are generated in LCH from base, accent and contrast, with elevation levels for panels, dialogs and modals.
  - Less blue chrome, and darker text in light mode.
  - A display cut of the font for headings.
- **L2 2026 refresh.** Sources: https://linear.app/now/behind-the-latest-design-refresh and https://linear.app/changelog/2026-03-12-ui-refresh
  - The sidebar is "a few notches dimmer" and inactive text is muted. "Don't compete for attention you haven't earned."
  - Headers are consistent, and there are fewer and smaller icons.
  - Dividers are softer and fewer: "Structure should be felt not seen."
  - The gray is warmer and less saturated.
- **L3 Navigation.** Source: https://linear.app/enablement/guide/navigating-linear
  - Sidebar sections: Inbox, My Issues, Workspace, Your teams, Favorites.
  - Shortcuts: ⌘K, `/` search, `G`+letter jumps, and `?` for the full list.
  - Unread items show "a count or dot". Source: https://linear.app/changelog/2024-12-18-personalized-sidebar
- **L4 Display options.** Grouping and ordering. Display properties are not filters. Empty groups are optional. "Set as default." Source: https://linear.app/docs/display-options
- **Not used.** Status icon docs were not fetched (404). https://linear.app/method covers product process, not UI.

## 4. Mercury and Ramp

- **M1 Mercury Transactions page.** Source: https://mercury.com/blog/updated-transactions-page
  - A cashflow chart (current month by default) and a top-5 sources chart sit above the table. Both follow the table's filters.
  - Saved "Data Views", plus grouping and bulk edit.
- **M2 Mercury Insights.** Source: https://mercury.com/blog/introducing-insights
  - Shows "burn, runway, and key spend categories", with money-in and money-out tabs.
  - "When you adjust the filters, charts and tables update instantly."
  - Periods can be compared side by side.
- **R1 Ramp.** No public design-system docs exist. We excluded third-party "Ramp-inspired" pages.
  - "Every chart is clickable", going from a spike to its transactions. Source: https://ramp.com/reporting
  - Saved reports can be grouped into dashboards. Source: https://support.ramp.com/real-time-reporting

## 5. Apple HIG (web-applicable parts)

- **A1 Typography.** "Adjust font weight, size, and color… to emphasize important information." "Minimize the number of typefaces." Avoid Light and Thin weights. Source: https://developer.apple.com/design/human-interface-guidelines/typography
- **A2 Color.** Source: https://developer.apple.com/design/human-interface-guidelines/color
  - "Avoid using the same color to mean different things." "Avoid relying solely on color."
  - In content that is mostly monochrome, the brand color works as the accent.
  - The page's Liquid Glass section reserves color for "status indicators or primary actions". We apply the principle only.
- **A3 Layout.** Source: https://developer.apple.com/design/human-interface-guidelines/layout
  - Put the most important items at the top.
  - "Align elements to make them easier to scan."
  - Group with "negative space, container shapes, or separator lines".
  - Use progressive disclosure.
- **A4 Sidebars.** "No more than two levels of hierarchy." Use "succinct, descriptive labels to title each group". Source: https://developer.apple.com/design/human-interface-guidelines/sidebars
- **A5 Charts.**
  - Use a chart only to highlight something; otherwise use a table. Add a "headline or summary". "Prefer consistency across multiple charts." Source: https://developer.apple.com/design/human-interface-guidelines/charting-data
  - Bars start at zero, and ticks use familiar steps. Gridlines stay light: "the data itself to be most prominent". Align the chart's leading edge with nearby content. Source: https://developer.apple.com/design/human-interface-guidelines/charts

## 6. Material Design 3 (via Google's Android docs)

- **M3-1 Type roles.** Source: https://developer.android.com/develop/ui/compose/designsystems/material3
  - The scale has 15 styles: display 57–36, headline 32–24, title 22–14 in Medium, body 16–12, label 14–11 in Medium.
  - "Your product will likely not need all 15."
  - Headline is "reserved for short, important text or numerals". Title is "medium-emphasis text that is shorter in length". Source: https://developer.android.com/reference/kotlin/androidx/compose/material3/Typography
- **M3-2 Surfaces.** Elevation is shown "mainly using tonal color overlays". Source: the Android Material 3 page above.
  - `surfaceContainer` covers "cards, sheets, and menus", with High/Highest variants for "higher emphasis". Source: https://developer.android.com/reference/kotlin/androidx/compose/material3/ColorScheme

---

## Conflicts and which source to prefer

1. **Skeleton or spinner.**
   - Geist uses skeletons for known layouts. Stripe uses delayed spinners, but its pages use skeletons while pending.
   - **Prefer:** skeletons for first loads, a spinner or pending button for single actions, and the 200–300ms delay.
2. **Title Case or sentence case.**
   - Geist uses Title Case. Stripe uses sentence case for empty-state titles.
   - **Prefer sentence case.** Stripe is the reference for most money screens, and sentence case is the shadcn default. The owner should confirm this once.
3. **Shadow, tone or border.**
   - Geist uses shadows. Material 3 uses tones. Linear wants structure "felt not seen".
   - **Prefer:** tonal layering plus a 1px border, shadows only on floating layers, and Geist's radii.
4. **Icons in status badges.** Geist says no icons; Apple says not color alone. The badge text satisfies both: **text plus color, no icon.**
5. **Size of key figures.** Material 3 offers display sizes up to 57px, while Stripe's KPI is only a bold value. **Prefer Stripe's restraint:** one modest, semibold, tabular "figure" style.
6. **Warning levels.** Stripe warning maps to amber, urgent/negative to red. Use red sparingly.

---

## Synthesis: 15 high-impact, low-risk changes

1. **A role-based type scale with at most six styles.**
   - Styles: page title, section heading, label, body, caption, and one "figure" style for key numbers.
   - Weights: Regular, Medium and Semibold only.
   - Sources: https://vercel.com/geist/typography, https://docs.stripe.com/stripe-apps/style, https://developer.android.com/develop/ui/compose/designsystems/material3, https://developer.apple.com/design/human-interface-guidelines/typography
   - Applies to: all screens.
2. **Tabular numerals** for all money, hours and counts. Mono type only for IDs.
   - Sources: https://vercel.com/geist/table, https://vercel.com/geist/typography
   - Applies to: lists, detail pages, analytics.
3. **Two text tiers.** Primary text for content; muted text for labels, metadata, captions and axes.
   - Sources: https://vercel.com/geist/colors, https://docs.stripe.com/stripe-apps/style
   - Applies to: all screens.
4. **A restrained accent.** Color only on the primary action and the current selection, with at most one filled button per header. All other chrome stays neutral.
   - Sources: https://developer.apple.com/design/human-interface-guidelines/color, https://linear.app/now/how-we-redesigned-the-linear-ui, https://docs.stripe.com/stripe-apps/components/detailpage.md?app-sdk-version=9
   - Applies to: all screens, including sign-in and dialogs.
5. **One fixed semantic status set: neutral, info, success, warning, critical.**
   - At most one short badge per row.
   - An inline note for a section problem; a banner for a page-level problem that needs action.
   - Sources: https://docs.stripe.com/stripe-apps/components/badge.md?app-sdk-version=9, https://vercel.com/geist/badge, https://vercel.com/geist/note, https://docs.stripe.com/stripe-apps/components/banner.md?app-sdk-version=9
   - Applies to: lists, detail pages, compliance, receivables, settings.
6. **Surface layering.**
   - Cards sit on the page background with a 1px neutral border. Softer dividers.
   - Radii: 6px for controls, 12px for cards, menus and dialogs, 16px for full-screen sheets. Shadows only on floating layers.
   - Sources: https://vercel.com/geist/materials, https://docs.stripe.com/stripe-apps/style, https://developer.android.com/reference/kotlin/androidx/compose/material3/ColorScheme, https://linear.app/now/behind-the-latest-design-refresh
   - Applies to: all screens.
7. **A summary metric row.**
   - Each metric is a caption, then a figure, then a sparkline and the change against a comparison period.
   - Charts below at 180/320px, at most three per row, bars from zero, light gridlines, and a one-line headline.
   - Sources: https://docs.stripe.com/stripe-apps/patterns/chart-layout, https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights, https://developer.apple.com/design/human-interface-guidelines/charting-data, https://developer.apple.com/design/human-interface-guidelines/charts
   - Applies to: analytics/margin, home, the tops of the receivables and invoices lists.
8. **A detail-page header with key facts.**
   - Breadcrumb, title, status badge, a one-line description, then actions with primary first and destructive last.
   - Two columns: line items or activity on the left, a key/value list on the right.
   - Sources: https://docs.stripe.com/stripe-apps/components/detailpage.md?app-sdk-version=9, https://vercel.com/geist/description
   - Applies to: detail pages.
9. **An activity timeline.** State changes with the actor's avatar and a relative time that becomes a date after 7 days.
   - Sources: https://docs.stripe.com/global-payouts/manage-payouts, https://vercel.com/geist/table, https://vercel.com/geist/avatar
   - Applies to: detail pages, activity log, approvals.
10. **List-page toolkit.**
    - Filter chips labeled like the columns, with "Clear filters" shown only when a filter is active.
    - Saved views, charts that follow the filters, row click to detail, an "x–y of z" caption, and "—" for empty values.
    - Sources: https://docs.stripe.com/stripe-apps/patterns/filter-controls, https://mercury.com/blog/updated-transactions-page, https://vercel.com/geist/table, https://linear.app/docs/display-options
    - Applies to: list pages.
11. **Proper empty states.**
    - First use, no results and errors are treated differently.
    - The title says what's missing, the description is under 14 words, and there is one matching call to action.
    - A single empty section gets a dashed box.
    - Sources: https://docs.stripe.com/stripe-apps/patterns/empty-state, https://vercel.com/geist/empty-state
    - Applies to: lists, detail sections, analytics.
12. **Loading without layout shift.** Skeletons shaped like the final content, a 200–300ms delay, navigation and tabs stay visible, and buttons show a pending state.
    - Sources: https://vercel.com/geist/skeleton, https://docs.stripe.com/stripe-apps/patterns/loading
    - Applies to: all screens, including wizards.
13. **A quieter, grouped sidebar.** Short group labels, at most two levels, a slightly dimmer background, muted inactive items, and a count or dot on items that need attention.
    - Sources: https://linear.app/now/behind-the-latest-design-refresh, https://developer.apple.com/design/human-interface-guidelines/sidebars, https://linear.app/changelog/2024-12-18-personalized-sidebar
    - Applies to: the app layout.
14. **People as avatars.** A 1–2 letter initials fallback, 20–24px inline and 32px in headers. Rows show at most two actions, with the rest in a menu.
    - Sources: https://vercel.com/geist/avatar, https://vercel.com/geist/entity
    - Applies to: workers, approvals, activity, settings/team.
15. **Keyboard-first.** ⌘K, `/` search, `G`+letter jumps, and a `?` shortcut sheet. Create and edit happen in a focused overlay.
    - Sources: https://linear.app/enablement/guide/navigating-linear, https://docs.stripe.com/dashboard/basics, https://docs.stripe.com/stripe-apps/patterns/full-page-apps
    - Applies to: all screens, wizards and dialogs.

**Sign-in and settings** need only changes 1, 3, 4, 6 and 12, plus key/value lists (G6) and inline notes (G9).

---

# Part C — The products' own screenshots (studied 2026-10-16, after the owner's review)

The owner's review of the first pass: it "looks vibe coded" — the shapes came from the rules above
mixed by us, not from any one product. So each piece below is taken from a real screenshot published
by the product itself (read, never copied into the app; no image is kept in the repository).

- **Linear — app structure.** https://linear.app/now/behind-the-latest-design-refresh (figures
  "01: App / 02: Location bar / 03: View bar / 04: Content"; sidebar before/after; softer borders).
  The content is a rounded panel nested in the app's dim frame; a thin location bar on top of it,
  then a view bar (Filter, Display), then the content. Sidebar sections ("Workspace", "Favorites",
  "Your teams") are muted text labels at the items' own size with a disclosure triangle; the current
  item is a filled rounded row.
- **Linear — list view.** https://linear.app/docs/filters ("Linear interface showing filters applied
  to the active issue"), https://linear.app/docs/custom-views ("Shows view sidebar on an issue view").
  The view's name is small (a 14px medium title in the top bar), not a page headline. Filters are
  segmented chips ("Assignee | is any of | 3 assignees | ×"). Groups are full-width tinted bands with
  the group's icon, name and count ("2 / 11"). Rows run edge to edge, about 44px, hairline dividers:
  muted identifier, status icon, title in medium weight, properties as outlined pills on the right.
  The view sidebar: segmented tabs (Overview, Insights), the view's title with its description, then
  label/value pairs (Visibility, Owner), then a breakdown list with counts.
- **Stripe — invoices list.** https://docs.stripe.com/invoicing/dashboard (invoice duplication
  screenshot). A large bold title ("Invoices") with Filter, Export and the one primary button on the
  right; underline tabs for the statuses (All invoices, Draft, Outstanding, Past due, Paid); the
  table runs full width with no box around it; column headers are small capitals, semibold; the
  amount comes first, bold, with the currency muted; the status is a small tinted badge (no dot, no
  icon); empty values are "—"; each row ends in a "…" menu.
- **Stripe — Home.** https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights.
  "Today" as a large bold heading over a hairline; the headline figures are plain type — a label with
  a dropdown, the amount, a small time under it — beside a line chart with light gridlines; a right
  column of figures with "View" links, separated by hairlines. Then "Your overview": a bold heading,
  filter pills ("Date range | Last 7 days", "Daily", "Compare | Previous period"), Add and Edit
  buttons, and the widgets as white cards on a light grey band — each a semibold title with an info
  mark, the figure, "previous period" under it, a line chart, and "Updated …" with "View more".
- **Stripe — app overview page.** https://docs.stripe.com/stripe-apps/patterns/chart-layout ("Chart
  layouts in a full-page app"). Title with the page's action buttons on the right; underline tabs; a
  section heading ("Program summary"); a filter pill; the figures as plain type in a row (label over
  value, the change beside it); charts in cards with their own heading; a right column "Recent
  activity" (name, date, amount per row, hairlines) with "View all activity", then "Quick actions"
  as links.
- **Mercury — Insights and Transactions.** https://mercury.com/blog/introducing-insights,
  https://mercury.com/blog/updated-transactions-page. A large regular-weight title; segmented tabs
  (Overview, Money In, Money Out); outlined filter buttons with chevrons (Data Views, Filters, Date,
  Keyword, Amount) and quiet text actions on the right (Reset, Customize, Export All); the headline
  figure large with smaller cents, labelled above; supporting figures as label/value rows; charts with
  dotted or hairline grids and soft fills.

What none of them shows: a grid of bordered boxes each holding a caption, a number and a grey
sentence; a grey sentence under every page title; colored dots inside status badges; dashed boxes
around empty pages; tinted table header rows.
