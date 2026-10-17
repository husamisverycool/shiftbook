# Loading, error, not-found and button-loading states — research for slice O

Fetched 2026-10-17. Purpose: give every loading, error, not-found and "button is working" state in
Granite a published source, so we make no taste-based decisions. Every rule below was read live
(docs site via a scraper) or from the design system's own public source on GitHub (cloned
2026-10-17). Quotes are verbatim. Anything not read live is marked **unverified**.

Evidence kinds:
- **Guideline**: the design system's documentation site.
- **Shipped code**: the component source on the default branch, i.e. what the product does.

Copy only hierarchy and interactions. Never copy names, wording, icons, colours or logos.

---

## 1. Shopify Polaris

Where the docs live now: `polaris-react.shopify.com` did not resolve from this environment
(DNS failure, and the scraper got "connection closed"). The same pages are published from the
Polaris repo, which is the source of the docs site:
- Docs source: https://github.com/Shopify/polaris/tree/main/polaris.shopify.com/content/components/feedback-indicators
  (`skeleton-page.mdx`, `skeleton-body-text.mdx`, `skeleton-display-text.mdx`, `skeleton-tabs.mdx`,
  `skeleton-thumbnail.mdx`, `spinner.mdx`, `banner.mdx`), commit `3f7954ae`, dated 2026-09-10.
- Component source: https://github.com/Shopify/polaris/tree/main/polaris-react/src/components
  (`SkeletonPage`, `SkeletonBodyText`, `SkeletonDisplayText`, `SkeletonTabs`, `SkeletonThumbnail`,
  `Button`, `UnstyledButton`).
- Tokens: https://github.com/Shopify/polaris/tree/main/polaris-tokens/src (size scale used below).
- The Spinner and Banner pages now point to web components at
  https://shopify.dev/docs/api/app-home/polaris-web-components/feedback/spinner and
  `.../feedback/banner`. No web-component skeleton page was found linked from the skeleton docs
  (**unverified** whether one exists).

Token values used below (from `polaris-tokens/src/size.ts`): `100` = 4px, `200` = 8px,
`300` = 12px, `400` = 16px, `600` = 24px, `700` = 28px, `800` = 32px, `1600` = 64px.
Skeleton fill everywhere is `--p-color-bg-fill-tertiary`, described as "The background color of
elements with a smaller surface area and a third level of prominence." Polaris skeletons have
**no animation** in shipped code (no keyframes in any skeleton CSS module).

### 1.1 SkeletonPage

Guideline (`skeleton-page.mdx`):
- "Skeleton page is used with other skeleton loading components to provide a low fidelity
  representation of the user interface (UI) before content appears on the page."
- Best practices: "Be used for pages where all content loads at the same time." / "Give merchants
  an indication of what the page layout will be once loaded. Do this by mimicking its layout
  similarly to the state that will be loaded."
- Content: "Show page titles that never change for a page. For example, keep the title “Products”
  on the product list page, but use skeleton loading for titles that change on the product details
  page. Don’t use placeholder content for titles that will change when the page fully loads."
- "Secondary actions are always represented with skeleton content. You can change the number of
  skeleton actions that best represent the number of actions once loaded."
- Don't: "Use placeholder content that will change when the page fully loads. This will confuse
  merchants and create a jumpy loading experience."
- Related: "When giving feedback for in-context operations, use Progress bar or Spinner component."

Shipped code (`SkeletonPage.tsx`, `.module.css`) — what it draws:
- Props: `title` (real text, shown as the real h1 if given), `primaryAction` (bool),
  `backAction` (bool), `fullWidth`, `narrowWidth`, `children`.
- Outer box: `role="status"`, `aria-label` = i18n `Polaris.SkeletonPage.loadingLabel`
  (English: "Page loading"). Max width 998px (`narrowWidth` 662px, `fullWidth` none).
- Header row: `[back-action block 36×36] [title]` on the left, `[primary-action block]` on the
  right, vertically centred, gap 16px. Header padding 16px block (20px from `md`).
- Title when no `title` given: a block min 120px wide × 28px high, radius 4px.
- Primary action block: min 100px (6.25rem) wide × 36px (2.25rem) high, radius 4px.
- Back action block: 36px × 36px.
- Children (cards with skeleton text) below.

Official example "With dynamic content" (`polaris.shopify.com/pages/examples/skeleton-page-with-dynamic-content.tsx`):
`SkeletonPage primaryAction` → two-column layout. Main column: card with `SkeletonBodyText`
(3 lines); two cards each with `SkeletonDisplayText size="small"` + `SkeletonBodyText` (3 lines).
Side column (one third): card with sections [`SkeletonDisplayText small` + 2 lines] and [1 line];
subdued card with sections [`SkeletonDisplayText small` + 2 lines] and [2 lines].

### 1.2 SkeletonBodyText

Guideline (`skeleton-body-text.mdx`):
- Should "Be used with Skeleton page when page content loads all at once."
- Should "Be used on its own, inside any content container component (like a card), and when
  content loads after the main page load."
- "Try to match the number of lines to the content being loaded so it gives an accurate
  representation."
- "Show static content that never changes on a page and use skeleton loading for dynamic content.
  Skeleton body text can sometimes be used to represent non-typographic content such as forms.
  Don’t use placeholder content that will change when the page fully loads."
- Example "Single line content": "Use this component to represent a short, single line of text,
  like a timestamp."

Shipped code: prop `lines` (default **3**). Each line: height 8px (`space-200`), full width,
radius 4px, 12px gap between lines (`space-300`). The **last line is 80% wide** when there is more
than one line (`&:last-child:not(:first-child) { width: 80%; }`).

### 1.3 SkeletonDisplayText

Guideline: "Give merchants an indication of what the page content will be once loaded" / "Use real
content for display text that never changes". Example sizes: small = "content headings";
medium/large = "large metrics on the reports list page, or for page titles".

Shipped code: props `size` (`small | medium | large | extraLarge`, default `medium`),
`maxWidth` (default **120px**). One bar, radius 4px. Heights (mobile → `md` and up):
small 24px → 28px; medium and large 28px → 32px; extraLarge 36px → 44px.

### 1.4 SkeletonTabs

Guideline: "Give merchants an indication of what the page content will be once loaded".
"Fitted" example: "Use when tabs contain a few (2 or 3) items within a narrow column."

Shipped code: props `count` (default **2**), `fitted`. Each tab: padding 8px 12px, 4px gap;
inside, a bar 64px wide (`width-1600`) × 12px high, radius 4px. Fitted: tabs share width equally
from `md` and bars fill the tab.

### 1.5 SkeletonThumbnail

Guideline: "Try to match the size of the thumbnail to the content being loaded so it gives an
accurate representation."
Shipped code: `size` default `medium`. Squares: extraSmall 24px, small 40px, medium 60px,
large 80px; radius `border-radius-200`.

### 1.6 Spinner vs skeleton (Polaris)

`spinner.mdx`:
- "For loading states, spinners should only be used for content that can’t be represented with
  skeleton loading components, like for data charts."
- Best practices: "Notify merchants that their request has been received and the action will soon
  complete." / "Not be used to give feedback for an entire page load." / "White can only be used
  with small spinners on actionable components like buttons."
- Accessibility label: "Accurately explain the state of the requested action. For example,
  “Loading”, “Submitting”, “Processing”." / "Use as few words to describe the state as possible."

Loading guidance page (`polaris.shopify.com/content/patterns-legacy/loading.mdx`; front matter
`noIndex: true`, i.e. a legacy page still in the repo — treat as guidance, not current component
API). Rules quoted:
- "Switch to the next view quickly … it’s typically best to move toward that context immediately,
  rather than load first and switch later."
- "Use highly accurate loading layouts … Mismatched layouts confuse merchants and waste their time.
  Test skeleton content with different breakpoints".
- "Show real content … It’s important that we make an effort to show as much real content as
  possible."
- "Show active controls … Render it inactive only if it mustn’t be interacted with, but use that as
  a last resort."
- "Make sure that the feedback is noticeable within 100 milliseconds".
- "When an element’s size is unknown, such as a product index with a variable number of items, then
  it's typically better to add too many placeholder items than too few. It's less jarring when
  elements suddenly shrink than when they suddenly expand."
- "Avoid using spinners as placeholders" / "Avoid empty views with spinners".
- "People are likely to be frustrated and abandon their tasks if loading times exceed 10 seconds."

### 1.7 Button `loading` (Polaris)

Docs example "Loading state": "Use when a button has been pressed and the associated action is in
progress." Shipped code (`Button.tsx`, `UnstyledButton.tsx`, `Button.module.css`):
- `loading` makes the button `disabled` (`isDisabled = disabled || loading`) and sets
  `aria-busy="true"`.
- Label text colour becomes transparent (`.loading { color: transparent; }`); icon and disclosure
  get `visibility: hidden` — so the **button keeps its exact width**.
- A small Spinner is absolutely centred over the button, accessibility label "Loading"
  (`Polaris.Button.spinnerAccessibilityLabel`).

### 1.8 Errors (Polaris)

Banner (`banner.mdx`):
- "Banners relevant to an entire page should be placed at the top of that page, below the page
  header. They should occupy the full width of the content area."
- "Banners related to a section of a page (like a card, popover, or modal) should be placed inside
  that section, below any section heading."
- "Be limited to a few important calls to action with no more than one primary action."
- Critical: "Use to communicate problems that have to be resolved immediately for merchants to
  complete a task."
- Accessibility: "Critical and warning banners have a `role=”alert”` and are announced by
  assistive technologies when they appear." Don't: "Move focus to banners if they appear on page
  load, or outside the merchant’s current workflow".

Error messages (`polaris.shopify.com/content/content/error-messages.mdx`):
- "Explain what’s wrong and what the merchant needs to do"; "Don’t overapologize or bring “us”/”we”
  into the conversation unless Shopify caused the problem"; "Avoid error jargon like “invalid”".
- Anatomy: Heading (optional) — "Clearly state the effect of the error"; Body — "Explain how to fix
  it"; CTA (optional) — "Provide a one-step solution".
- "Admin unavailable" Do: heading says the page isn't available, body says check the address or try
  again later, button "Retry". Don't: blame the user, or send them to the home page.
- "Errors without solutions" Do: say something went wrong and to refresh to try again.
  Don't: apologise and offer only "Learn more".

---

## 2. IBM Carbon

Source URLs (all fetched 2026-10-17):
- Loading pattern: https://carbondesignsystem.com/patterns/loading-pattern/ → redirects to
  https://www.carbondesignsystem.com/building-blocks/core/patterns/loading
- Inline loading: https://www.carbondesignsystem.com/building-blocks/core/components/inline-loading/guidelines
- Empty states: https://carbondesignsystem.com/patterns/empty-states-pattern/ → redirects to
  https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states
- Loading component page (`.../components/loading/guidelines`): rate-limited, not read —
  **unverified** beyond what the pattern page quotes.

### 2.1 Skeleton states
- "Skeleton states are simplified versions of components used on an initial page load to indicate
  that the information on the page has not fully loaded yet. They should only appear for only a few
  seconds, disappearing once components and content populate the page."
- "Skeleton states use motion to convey that the page is not stuck and that data is still being
  loaded."
- "Only use skeleton states on container-based components like tiles and structured lists or
  data-based components like data tables and cards. In most cases, action components (e.g. buttons,
  input fields, checkboxes, toggles) do not need to have a skeleton state."
- "Never represent toast notifications, overflow menus, dropdown items, modals, and loaders with
  skeleton states. Elements inside a modal may have a skeleton state, but the modal itself should
  not."

### 2.2 Loading indicators (full-screen vs inline)
- "Loading indicators signal a user action is processing. … If a process will take more than a
  moment or two to complete, use a progress indicator instead."
- Full-screen: "should be used when the entire page is processing. This is often applied after data
  is submitted or saved by the user." When to use: "An action temporarily disables the application";
  "Processing takes more than a few seconds"; "Data from user input is being saved or submitted".
- Inline: "Use the inline loading component when a single component is processing."

### 2.3 Progressive loading
- "The primary batch should show a page's basic structure (the skeleton state versions of the
  container-based components), data-based text (the skeleton state version of text) and non-data
  text."
- "Not all items need a skeleton state and instead can be expressed as negative or white space
  until they load."
- When to use: "A page view is slow to load" (dashboards); "A user changes filters or facets in a
  table view".

### 2.4 Inline loading component
- When to use: "for any action that cannot be performed instantly and will only require a short
  time to process."
- When not to use: "Don’t use inline loading for full page loads, use skeleton states instead." /
  "Don’t trigger inline loading on more than one item or action at a time, unless on initial page
  load or refresh."
- Placement: "When inline loading temporarily replaces content, it should appear in the same spot as
  the content it replaced and maintain the same alignment."
- Label: "if the status is active while a form is being saved, then the label should say
  “Saving …”." / "when saving is finished, it would read “Saved”."
- States: inactive, active, finished, error. "The success state is active for 1.5 seconds before
  calling an optional function `onSuccess`." Error: "the inline loading component becomes inactive
  and an inline notification or error handling within the form should appear."
- Interactions: "Any interactive elements associated with the button should be disabled while it is
  loading. … the button itself displays a loading state and is disabled until the action is
  complete. This ensures users cannot interact with the button again during the process."

### 2.5 Accessibility (loading)
"A screen reader should notify a user if an application is loading, busy, gets stuck, or if a
process fails." (links WCAG wiki "Notification of Loading/Busy").

### 2.6 Error / empty states
- Types table: "Error management empty states — Permissions issue / Systems issue / Configuration
  required — User understands the problem and if there are corrective actions available, knows what
  action to take".
- Anatomy: Image (optional); Title ("A short and concise explanation"); Body ("Explain clearly the
  next action"); Primary action (optional); Secondary call to action (optional, a link).
- "Empty states should replace the element that would ordinarily show. For example, an empty state
  for a table would replace the table and the column headers and footer should not be present."
- "Empty state elements should be left-aligned as a block." (exception: small tiles centre the
  image).
- Error do/don't: "If there are corrective actions, give the user an actionable next step." /
  "Don't lead the user into a dead end. Always aim to provide a path to a solution."
- "A pattern providing guidance for error states is currently being planned." — Carbon has **no
  published error-page pattern** yet.

---

## 3. GitHub Primer

Source URLs (fetched 2026-10-17):
- Button: https://primer.style/components/button → https://primer.style/product/components/button/
- Button accessibility: https://primer.style/product/components/button/accessibility/
- Loading pattern: https://primer.style/product/ui-patterns/loading/
- Blankslate: https://primer.style/product/components/blankslate/
- Empty states: https://primer.style/product/ui-patterns/empty-states/
- Degraded experiences: https://primer.style/product/ui-patterns/degraded-experiences/
- Skeleton loaders page `https://primer.style/product/components/skeleton-loaders/` redirected to
  the Primer home page — docs page **unverified**; component behaviour below is from source.
- Shipped code: https://github.com/primer/react (`packages/react/src/Button/ButtonBase.tsx`,
  `ButtonBase.module.css`, `Skeleton/SkeletonBox.tsx`, `SkeletonText/SkeletonText.tsx`),
  commit dated 2026-10-16.

### 3.1 Button `loading`

Guideline (button page):
- "Use the `loading` prop to show a spinner inside the Button while an action is in progress. It
  also sets `aria-disabled` and preserves focus automatically."
- "When a Button has a leading visual, trailing visual, or trailing action, the spinner replaces
  **only that visual slot**, and the button label remains visible." With a leading visual: "The
  spinner replaces the leading icon." Trailing visual: "The spinner replaces the trailing icon."
  Trailing action: "The spinner replaces the trailing action (e.g. a dropdown indicator)."
- Props: `loading` — "When true, the button is in a loading state." `loadingAnnouncement` — "The
  content to announce to screen readers when loading. This requires `loading` prop to be true".

Guideline (accessibility page, "Button loading state"):
- "For loading buttons, don't remove them from the DOM or add `disabled` to avoid disrupting focus
  and keyboard navigation."
- "Instead, add `aria-disabled="true"` to indicate the loading state. Include a visually hidden,
  ARIA live region (using `aria-live="polite"`) message like "Saving profile" to communicate
  status. The live region must be present on page load, but the message inside the live region
  should only be rendered while the Button is in a loading state."
- "If an error prevents process from being completed, focus should be brought to an `<h2>` (or next
  relevant heading) of the error banner."

Shipped code (`ButtonBase.tsx`):
- Order of replacement: no visuals → spinner takes the **label's grid area** (label hidden);
  leading visual → spinner replaces it; else trailing visual / counter → replaced; else trailing
  action → replaced. Icon-only button → spinner replaces the icon.
- `aria-disabled={loading ? true : undefined}`, `data-loading`, `onClick={loading ? undefined :
  onClick}` (clicks ignored, button stays focusable).
- `aria-labelledby` points at the label span while loading ("because the accessible name becomes
  unset when the button is in a loading state").
- `loadingAnnouncement` default **"Loading"**, rendered as a visually hidden `AriaStatus` and added
  to `aria-describedby` while loading.
- A wrapper is rendered whenever `loading` is defined (even `false`) so focus is not lost when the
  state flips.
- Styling: while `data-loading='true'` the button is **not** given disabled colours (disabled styles
  apply to `[aria-disabled='true']:not([data-loading='true'])`).

### 3.2 Loading pattern (Primer)
- "Some of our components already have loading states built in. Rely on component-specific patterns
  before designing your own loading experiences."
- Content skeleton: "For large areas of loading content, the loading content may be replaced by a
  vague representation of the content."
- Wait times: "**Less than 1 second:** Don't show a loading state." / "**1–3 seconds:** Use an
  indeterminate loading state." / "**3–10 seconds:** Use a determinate loading state if possible" /
  "**More than 10 seconds:** … treating the process as a background task if possible."
- Lifecycle "Process failed": "This step should include an error message that explains what went
  wrong and what the user's next time may be. For example, if the user can retry the process,
  include a button to do so."
- "Whenever possible, show each item in a collection as soon as it loads."
- "A loading indicator should be placed nearest to the content they are standing in for. Avoid
  creating a jarring layout shift when the loaded content replaces the loading indicator."
- Large areas: "Position your loading state in the center of the region, but ensure it's still
  visible within the viewport." Small areas: "consider replacing a series of adjacent loading
  indicators with a single loading indicator."
- Accessibility: "Have a single loading announcement for a collection of SkeletonLoaders";
  "set `aria-busy="true"` on the live region until the updates are complete";
  "If the completed process results in navigating to a new page, just rely on the browser's default
  focus behavior for new pages."; "If the process fails and a validation message is shown, move
  focus to the first focusable element in the error message."
- Filter results: "a screen reader should announce how many results were returned from filtering.
  For example: "No items match the filter", or "5 items match the filter"." / "The element with
  `role="status"` must always be rendered, not just when the message should be announced."
- Motion: "Animated loading indicators … should not be disabled when for users that prefer reduced
  motion. However, the animation in loading indicators should be kept as subtle as possible."

### 3.3 Skeleton components (shipped code; docs page unverified)
- `SkeletonBox` (status `alpha` in `SkeletonBox.docs.json`): props `height` (default `1rem`),
  `width`, `delay` — "Set to 'short' to delay by 300ms, 'long' to delay by 1000ms, or provide a
  custom number of milliseconds." Renders nothing until the delay passes. Radius `borderRadius-small`;
  shimmer = mask gradient sweeping, `animation-duration: var(--base-duration-1000)`, infinite,
  **only under `prefers-reduced-motion: no-preference`**.
- `SkeletonText` (alpha): props `size` (`display | titleLarge | titleMedium | titleSmall |
  bodyLarge | bodyMedium | bodySmall | subtitle`, default `bodyMedium`), `lines` (default **1**),
  `maxWidth`. Each line's height = the font size of the text it replaces, with the leading split
  above and below so a line of skeleton occupies exactly one line of text. Multi-line: the **last
  line is min 50px, max 65% wide**.

### 3.4 Blankslate and errors
- Blankslate: "used as placeholder to tell users why content is missing." Parts: `Visual`,
  `Heading` (`as` h1–h6), `Description`, `PrimaryAction`, `SecondaryAction`; variants `narrow`,
  `spacious`, `border`, `size`.
- Degraded experiences — Blankslate for degraded content: "**Leading visual**: Use the alert icon.
  Default to using `fgColor-muted` …"; "**Primary text**: You may optionally use the primary text
  for a title that succinctly describes the error."; "**Secondary text**: Use the secondary text to
  describe what's wrong and how (or if) the user can do anything to get around the issue.";
  "**Secondary action**: Use the secondary action for any action or link to places with more
  information." "We have yet to identify a case where a primary action would be appropriate.
  Theoretically, a primary action may be appropriate if it initiates an action that will resolve the
  problem."
- "Never suppress rendering of the global navigation header. Rendering a page without global
  navigation header could make a user feel stuck."
- "We don't want users to think they've suffered data loss. If we know a user created something,
  don't show a generic "empty state"."
- "By default, replace the affected content with an error message. Show a warning icon before the
  message".
- Empty states, for errors: "concisely summarize the problem"; "explain what they can do to fix the
  problem"; "If an error code is shown (for example, HTTP 500), make sure it's for relevant for
  diagnostic purposes"; "Vague messages like "There was a problem" can be frustrating."; "Error
  states are unlikely to ever have a secondary action." (empty-states page — note this conflicts
  with the degraded-experiences page which allows one; see mapping).

---

## 4. Atlassian Design System

Source URLs (fetched 2026-10-17):
- Skeleton usage: https://atlassian.design/components/skeleton/usage
- Skeleton examples: https://atlassian.design/components/skeleton/examples
- Error messages: https://atlassian.design/foundations/content/designing-messages/error-messages

### 4.1 Skeleton
- "Use skeletons to reserve space for content while data is loading. Match the size and shape of the
  expected content so the page does not jump when loading completes."
- "Use shimmering skeletons when loading may take noticeable time. Avoid using shimmer for very short
  loading states, repeated dense lists, or places where the motion would distract from nearby
  content."
- "Keep custom colors subtle so the placeholder reads as loading content instead of a status, chart,
  or interactive element."
- "Remove skeletons as soon as content is ready. If progress or completion state matters, use a
  loading or progress pattern instead."
- Props shown in examples: `width`, `height`, `borderRadius`, `color`, `isShimmering`.

### 4.2 Error messages ("Try again")
- "An error message, different from a warning message, appears **after** someone has taken an
  action."
- Title: "Include an informative, scannable title."; "Avoid explaining what to do."; "Limit titles to
  three to four words where possible"; "Write in sentence case".
- Body: "Include: the reason for the error and the problem, how someone should act and what happens
  if they don’t act."; "If you don’t know the reason for an error, don’t make one up – just say that
  something’s gone wrong and offer a solution for what people can do."; "Keep messages to 1 to 2
  sentences."; "Avoid putting technical information in the message".
- CTA: "use imperative verbs … instead of vague terms such as “OK”."; "Limit your CTA to 1 or 2
  words."; "An option to dismiss or cancel lets people feel reassured that they can opt out."
- Tone: "Use _we_ instead of _you_"; "Avoid using “please” and “sorry”."
- "Offer a backup solution: Stick to the most likely cause or the simplest solution in the first
  sentence … and offer an alternative backup solution in the second sentence in case the error keeps
  occurring (for example, contacting support)."
- The exact "Try again" wording in Atlassian examples is inside images on this page, not text —
  **unverified** as quoted text. (Next.js and Polaris do publish the retry button; see §6 and §1.8.)

---

## 5. Do Stripe's and GitHub's 404 pages keep the app frame?

- **GitHub (signed out), observed 2026-10-17** by fetching a non-existent path on github.com: the
  response is HTTP 404 and the page keeps the **full site header** (navigation menu, search, sign
  in) and the **site footer**; the body shows the 404 illustration, a search box ("Find code,
  projects, and people"), and links to support and status. Signed-in behaviour (whether the
  logged-in app header stays) is **unverified** — no documentation found and we cannot sign in.
- Supporting guideline: Primer "Never suppress rendering of the global navigation header. Rendering
  a page without global navigation header could make a user feel stuck." (degraded experiences).
- **Stripe Dashboard 404**: requires sign-in; no public documentation found — **unverified**. Do not
  cite Stripe for the not-found frame.
- Incidental observations (not in the brief, same date): Vercel's docs 404 and Linear's docs 404
  both render inside their docs frame. Docs sites, not apps — weak evidence only.

---

## 6. Next.js App Router file conventions

Source URLs:
- https://nextjs.org/docs/app/api-reference/file-conventions/loading (scraped live, "Last updated
  September 23, 2026")
- error.js and not-found.js: the live pages were rate-limited; read from the docs source that
  builds them: https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/error.mdx
  and `.../not-found.mdx` (fetched 2026-10-17).
- Installed version in this repo: `next` **16.4.1** (`node_modules/next/package.json`); its
  `dist/client/components/error-boundary.d.ts` exposes both `reset` and `retry`.

### 6.1 loading.js
- "show an instant loading state from the server while the content of a route segment streams in.
  The new content is automatically swapped in once complete."
- "In the same folder, `loading.js` will be nested inside `layout.js`. It will automatically wrap the
  `page.js` file and any children below in a `<Suspense>` boundary."
- "`loading.js` wraps `not-found.js`, `page.js`, and nested `layout.js` files in a `<Suspense>`
  boundary. It does **not** wrap the `layout.js`, `template.js`, or `error.js` in the same segment."
- Navigation: "The Fallback UI is prefetched, making navigation immediate unless prefetching hasn't
  completed." / "Navigation is interruptible" / "Shared layouts remain interactive while new route
  segments load."
- "If the layout accesses uncached or runtime data (e.g. `cookies()`, `headers()`, or uncached
  fetches), `loading.js` will not show a fallback for it." Without Cache Components: "Navigation
  blocks until the layout finishes rendering." Fix: "move uncached data fetching from `layout.js`
  into `page.js`, or wrap the runtime data access in your layout in its own `<Suspense>` boundary."
- "Loading UI components do not accept any parameters." Default is a Server Component.
- Status codes: "Streaming page responses begin with a `200` status code." Calling `notFound()`
  "before this point preserves its `404`" status; after streaming starts Next injects
  `<meta name="robots" content="noindex">`.

### 6.2 error.js
- "`error.js` wraps a route segment and its nested children in a React Error Boundary."
- "`error.js` wraps `loading.js`, `not-found.js`, `page.js`, and nested `layout.js` files in a React
  error boundary. It does **not** wrap the `layout.js` or `template.js` above it in the same segment.
  To handle errors in the root layout, use `global-error.js`." → an `error.tsx` inside `(app)` keeps
  the app frame (sidebar/header from the `(app)` layout).
- Must be a Client Component ("Error boundaries must be Client Components").
- Props: `error` ("Errors from Server Components arrive as an `Error` instance … Narrow it, for
  example with `instanceof Error`"); `error.message` — Server Component errors "show a generic
  message with an identifier" in production; `error.digest` — "can be used to match the
  corresponding error in server-side logs."
- **`retry`**: "An error component can use the `retry()` function to prompt the user to attempt to
  recover from the error. When executed, the function will try to re-fetch and re-render the error
  boundary's children. If successful, the fallback error component is replaced with the result of
  the re-render."
- **`reset`**: "In most cases, you should use `retry()` instead. However, if you have a specific
  reason to clear the error state and re-render the error boundary's children without re-fetching
  the contents, you can use the `reset()` function."
- Version history: "`v16.2.0` `unstable_retry` prop added." / "`v16.3.0` `retry` prop became
  stable." → on 16.4.1 use **`retry`** (not `unstable_retry`, and not `reset` for server-data
  failures). Note: the existing `src/app/[locale]/(app)/convert/error.tsx` calls `reset`, which per
  these docs does not re-fetch.
- The docs' own sample UI is a heading plus a "Try again" button that calls `retry()`.
- `global-error.js` "must define its own `<html>` and `<body>` tags" and does not include global
  styles or theme.

### 6.3 not-found.js
- "The **not-found** file renders UI when the `notFound` function is thrown within a route segment."
- "Before streaming starts, Next.js returns a `404` status code. After streaming starts, the status
  code remains `200` and the not-found UI renders in the response. Next.js injects a
  `<meta name="robots" content="noindex" />` tag in both cases."
- "`not-found.js` renders between `loading.js` and `page.js`. It is wrapped by the `<Suspense>`
  boundary from `loading.js` and the error boundary from `error.js` in the same segment."
- "In addition to catching expected `notFound()` errors, the root `app/not-found.js` and
  `app/global-not-found.js` files handle any unmatched URLs for your whole application." Props: none.
- `global-not-found.js` (experimental, `experimental.globalNotFound`) is for apps with multiple root
  layouts or a root layout under a dynamic segment such as `app/[country]/layout.tsx`. It "bypasses
  your app's normal rendering" (no layout, no frame).
- Implication for Granite (inference, not a published rule): unmatched URLs under `[locale]` are
  handled by the root/global not-found, which has **no app frame**; to keep the frame for a wrong
  record id, call `notFound()` in the page and place `not-found.tsx` inside `(app)` so the `(app)`
  layout wraps it. Whether a catch-all `[...rest]` route under `(app)` is needed to frame unmatched
  URLs is **unverified** against the docs and should be tested.

---

## 7. Mapping for Granite — which reference, which exact rules

### 7.1 Page-level loading (`loading.tsx` per area / record page) → **Polaris SkeletonPage family**
Reference: Polaris SkeletonPage + SkeletonBodyText + SkeletonDisplayText + SkeletonTabs (§1.1–1.5);
backed by Carbon skeleton states (§2.1) and Atlassian skeleton usage (§4.1).
Rules to follow:
1. Mimic the loaded layout exactly (Polaris "mimicking its layout"; Atlassian "Match the size and
   shape … so the page does not jump").
2. Static text stays real: fixed page titles ("Workers", "Invoices") render as text; dynamic titles
   (a worker's name on a record page) become a title bar (min 120px × 28px).
3. Header: optional back-action block 36×36, title, and primary-action block (min 100×36) on the
   right only if the loaded page has a primary action; secondary actions are always skeleton.
4. Body text blocks: 3 lines by default, 8px bars, 12px gaps, last line 80% wide; match line counts
   to the real content.
5. Headings: one bar, max 120px wide by default.
6. Tabs: if the page has tabs, `count` = real tab count, 64px × 12px bars.
7. Container role `status` with label "Page loading" equivalent (translated) — one announcement for
   the whole skeleton (Primer "single loading announcement").
8. Skeletons only on containers and data (cards, tables, lists) — never on menus, toasts, modals
   themselves, or buttons (Carbon). Lists: render more placeholder rows than fewer (Polaris legacy).
9. No spinner for whole-page loads (Polaris Spinner "Not be used to give feedback for an entire page
   load"; Carbon inline loading "Don’t use … for full page loads, use skeleton states instead").
10. Animation: Polaris skeletons are static; Carbon says skeletons "use motion"; Atlassian advises
    against shimmer for short loads and dense lists. Conflict → owner decision needed (Polaris
    static is the primary reference; Primer shows shimmer only when motion is not reduced).
11. Next.js mechanics: `loading.tsx` sits inside `(app)` so the layout (frame) stays interactive; keep
    uncached data out of layouts or the skeleton will not show.

### 7.2 Inline button loading → **Primer Button `loading`**
Reference: Primer Button + accessibility page (§3.1); Carbon inline loading (§2.4) for labels.
Rules to follow:
1. The spinner replaces only the leading visual; if none, the trailing visual; if none, the trailing
   action; if the button has no visuals, the spinner takes the label's place (label hidden, width
   kept). Icon-only button: spinner replaces the icon.
2. Do not remove the button and do not set `disabled`; set `aria-disabled="true"`, ignore clicks, keep
   focus.
3. Visually hidden live region present from page load; while loading it contains the announcement
   (default "Loading"; better a specific one, e.g. "Saving") and the button's `aria-describedby`
   points to it; `aria-labelledby` points to the visible label.
4. On failure, move focus to the heading of the error banner.
5. Don't show any loading state for actions under 1 second (Primer wait-time table).
Conflicts to resolve with the owner: the slice-O plan says "`aria-busy`, disabled" (that is Polaris
§1.7 and Carbon §2.4 "disabled until the action is complete"); Primer explicitly says not to add
`disabled`. Pick one reference; Primer is the better documented for accessibility.

### 7.3 Error in a page (`error.tsx` per area) → **Primer degraded-content Blankslate inside the
frame, with Next.js `retry`**
Reference: Primer degraded experiences + empty states (§3.4); Next.js `error.js` (§6.2); copy rules
from Atlassian (§4.2) and Polaris (§1.8).
Rules to follow:
1. Keep the global navigation/frame (`error.tsx` inside `(app)`; Primer "Never suppress rendering of
   the global navigation header").
2. Replace the content area (not the header) with: alert icon in muted colour → optional short title
   (3–4 words, sentence case) → secondary text saying what's wrong and what to do (1–2 sentences, no
   "sorry"/"please", no error codes, never blame the user) → one action.
3. The action is a retry button ("Try again" per the Next.js docs sample) wired to `retry()` (not
   `reset()`); Primer allows a primary action "if it initiates an action that will resolve the
   problem", Polaris "Admin unavailable" uses a retry button.
4. Show `error.digest` only if needed for support (Primer: codes only "for diagnostic purposes").
5. Section-level failures (one card) use a banner/inline message placed inside that section below its
   heading (Polaris banner placement), not the whole-page state.
6. Focus: do not move focus to an error shown on page load (Polaris banner Don't); after a failed user
   action, focus the error heading (Primer).

### 7.4 Not found → **GitHub 404 (frame kept) + Next.js `not-found.tsx` inside `(app)`**
Reference: GitHub 404 observed signed-out (§5); Primer "never suppress the global navigation";
Polaris "Admin unavailable" copy rule (§1.8); Next.js not-found (§6.3).
Rules to follow:
1. Keep the app frame: `not-found.tsx` under `(app)`; record pages call `notFound()` before streaming
   so the response is a real 404.
2. Body: heading that the page isn't available, one line telling the person to check the address,
   and a way forward (GitHub offers search; Polaris says don't just send them home). Our closest
   equivalent is a link to the area's list page plus the command menu shortcut (slice P).
3. No blame, no jargon (Polaris error messages).
4. Stripe is **not** a citable reference for the 404 frame (unverified). Signed-in GitHub behaviour is
   unverified; the frame rule rests on the signed-out observation plus the Primer guideline.
