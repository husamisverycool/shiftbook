# Motion research — slice N

Fetched 2026-10-17. Purpose: give every hover, transition, duration and easing in the app a
published source, so we make no taste-based motion decisions. Each number below was read from a
live page or from the design system's own public source code on GitHub (default branch, cloned or
fetched on 2026-10-17). Values are quoted as published. Anything not read live is marked
**unverified**.

Two kinds of evidence:
- **Guideline**: the design system's documentation site.
- **Shipped code**: the design system's own component styles, i.e. what the product actually does.
  Used where the guidelines are silent (most hover details live only in code).

---

## 1. IBM Carbon Design System

Source URLs:
- https://carbondesignsystem.com/elements/motion/overview/ (redirects to
  https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview)
- https://carbondesignsystem.com/elements/motion/choreography/ (redirects to
  .../building-blocks/foundations/motion/choreography)
- Shipped code: https://github.com/carbon-design-system/carbon (`packages/styles/scss/...`,
  `packages/react/src/components/Tooltip/Tooltip.tsx`), commit dated 2026-10-16.

### Duration tokens (guideline)

| Token | Published usage | Value |
| --- | --- | --- |
| `duration-fast-01` | Micro-interactions such as button and toggle | 70ms |
| `duration-fast-02` | Micro-interactions such as fade | 110ms |
| `duration-moderate-01` | Micro-interactions, small expansion, short distance movements | 150ms |
| `duration-moderate-02` | Expansion, system communication, toast | 240ms |
| `duration-slow-01` | Large expansion, important system notifications | 400ms |
| `duration-slow-02` | Background dimming | 700ms |

### Easing curves (guideline)

| Easing | Productive | Expressive |
| --- | --- | --- |
| Standard | `cubic-bezier(0.2, 0, 0.38, 0.9)` | `cubic-bezier(0.4, 0.14, 0.3, 1)` |
| Entrance | `cubic-bezier(0, 0, 0.38, 0.9)` | `cubic-bezier(0, 0, 0.3, 1)` |
| Exit | `cubic-bezier(0.2, 0, 1, 0.9)` | `cubic-bezier(0.4, 0.14, 1, 1)` |

### Usage rules (guideline, quoted)
- Productive vs expressive: productive motion is for "moments when the user needs to focus on
  completing tasks. Microinteractions in Carbon such as button states, dropdowns, revealing
  additional information, or rendering data tables". Expressive is for "significant moments such
  as opening a new page, clicking the primary action button … System alerts and the appearance of
  notification boxes". "Reserve expressive motion for occasional, important moments."
- Standard easing: "when an element is visible from the beginning to the end of a motion.
  Expanding tiles and the sorting of table rows are good examples."
- Exit easing: "when removing elements from view, such as closing a modal or toaster." Exception:
  "if an element leaves the view but stays nearby, ready to reappear upon user action, use
  standard easing instead. A good example of this is a side panel."
- Duration and size: "the larger the change in distance (traveled) or size (scaling) of the
  element, the longer the animation takes." "Productive motion is significantly faster than
  expressive motion."
- Evaluation checklist: "Do micro-interactions use `ease-out` on user input?" and "Do
  micro-interactions fall within a static duration ranging from 90–120 ms?"
- Hover: listed under "Give feedback, such as hover states and active state component behaviors
  like opening a dropdown menu".
- Choreography: "staggering the entrance of table content by 20 ms significantly reduces the
  cognitive load … the delay should be adjusted to ensure that total time is still within
  500 ms." Load sequence: 1 static content (UI shell, navigation) → 2 static body (headers,
  text) → 3 dynamic content (table content, query results) → 4 primary action → 5 animated
  content (data visualizations).
- Layering: "When the new content panel is on a higher layer, motion is 'sliding' … Also always
  dim the content below when new layer is introduced above." Same layer: "pushing", revealing
  content "with a mask".
- Semantic consistency: expanding a data table row and opening a dropdown "should use the same
  motion style (productive) and easing (entrance, standard)", with "slightly different durations
  due to their difference in size".
- Adaptive: "Always provide alternatives for interface state transitions … Make sure there is
  always a way to communicate similar messages statically."

### Shipped component transitions (code)

| Component (file) | Transition |
| --- | --- |
| Button (`button/_mixins.scss`) | `background`, `box-shadow`, `border-color`, `outline`: `$duration-fast-01` (70ms) `motion(entrance, productive)` |
| Link (`link/_link.scss`) | `color $duration-fast-01 motion(standard, productive)` |
| Tile (`tile/_tile.scss`) | `$duration-moderate-01 motion(standard, productive)` (base); several parts `$duration-fast-02`; expandable tile `max-height $duration-moderate-01 motion(standard, productive)` |
| Data table row (`data-table/_data-table.scss`) | `background-color $duration-fast-01 motion(entrance, productive)` |
| Dropdown/list box (`list-box/_list-box.scss`) | menu item `background $duration-fast-01 motion(standard, productive)`; chevron `transform $duration-fast-01 motion(standard, productive)`; menu `max-height $duration-fast-02 motion(standard, productive)` |
| Overflow menu (`overflow-menu/_overflow-menu.scss`) | `outline`, `background-color` (items also `color`): `$duration-fast-02 motion(entrance, productive)` |
| Tabs (`tabs/_tabs.scss`) | `color`, `border-bottom-color`, `outline`: `$duration-fast-01 motion(standard, productive)` (colour change, not a sliding indicator) |
| Toggle (`toggle/_toggle.scss`) | track `background-color $duration-fast-01 motion(exit, productive)`; knob `transform $duration-fast-01 motion(exit, productive)` |
| Modal (`modal/_modal.scss`) | overlay opacity in: `$duration-moderate-02 motion(entrance, expressive)`; out: `$duration-moderate-02 motion(exit, expressive)`. Container: `translate3d(0, -24px, 0)` → `0`, same durations and easings |
| Toast actions (`notification/_toast-notification.scss`) | `outline $transition-base, background-color $transition-base`, where `$transition-base: 250ms` (`_motion.scss`) |
| Skeleton (`utilities/_skeleton.scss`) | `animation: 3000ms ease-in-out skeleton infinite`; keyframes sweep `scaleX(0→1)` with opacity 0.3→1 at 0–20% |
| Focus (`utilities/_focus-outline.scss`, checkbox, tile) | `outline: 2px solid $focus` (no motion on the ring itself) |
| Tooltip (React `Tooltip.tsx`) | `enterDelayMs = 100`, `leaveDelayMs = 300` |
| Reduced motion | Toggle, tile, modal, overflow menu, skeleton: `@media screen and (prefers-reduced-motion: reduce) { transition: none; }` / `animation: none` |

---

## 2. Shopify Polaris

Source URLs:
- https://polaris.shopify.com/tokens/motion — **now redirects to https://shopify.dev/docs/api/polaris**
  (observed 2026-10-17); the token page no longer renders. Values were therefore read from the
  Polaris source: https://github.com/Shopify/polaris — `polaris-tokens/src/themes/base/motion.ts`
  and docs content `polaris.shopify.com/content/design/motion/*.mdx`,
  `polaris.shopify.com/content/design/interaction-states.mdx`; component styles under
  `polaris-react/src/components/` (commit dated 2026-09-10).

### Duration tokens (code)

| Token | Value |
| --- | --- |
| `motion-duration-0` | 0ms |
| `motion-duration-50` | 50ms |
| `motion-duration-100` | 100ms |
| `motion-duration-150` | 150ms |
| `motion-duration-200` | 200ms |
| `motion-duration-250` | 250ms |
| `motion-duration-300` | 300ms |
| `motion-duration-350` | 350ms |
| `motion-duration-400` | 400ms |
| `motion-duration-450` | 450ms |
| `motion-duration-500` | 500ms |
| `motion-duration-5000` | 5000ms |

### Easing tokens (code, with their published descriptions)

| Token | Value | Description (verbatim) |
| --- | --- | --- |
| `motion-ease` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | "Responds quickly and finishes with control. A great default for any user interaction." |
| `motion-ease-in` | `cubic-bezier(0.42, 0, 1, 1)` | "Starts slowly and finishes at top speed. Use sparingly." |
| `motion-ease-out` | `cubic-bezier(0.19, 0.91, 0.38, 1)` | "Starts at top speed and finishes slowly. Use sparingly." |
| `motion-ease-in-out` | `cubic-bezier(0.42, 0, 0.58, 1)` | "Starts and finishes with equal speed. A good default for transitions triggered by the system." |
| `motion-linear` | `cubic-bezier(0, 0, 1, 1)` | "Moves with constant speed. Use for continuous and mechanical animations, such as rotating spinners." |

### Keyframes (code)

| Token | Value |
| --- | --- |
| `motion-keyframes-appear-above` | `from { transform: translateY(var(--p-space-100)); opacity: 0; } to { transform: none; opacity: 1; }` |
| `motion-keyframes-appear-below` | `from { transform: translateY(calc(var(--p-space-100) * -1)); opacity: 0; } to { transform: none; opacity: 1; }` |
| `motion-keyframes-fade-in` | `to { opacity: 1 }` |
| `motion-keyframes-bounce` | `from, 65%, 85% { scale(1) } 75% { scale(0.85) } 82.5% { scale(1.05) }` |
| `motion-keyframes-pulse` | `from, 75% { scale(0.85); opacity: 1 } to { scale(2.5); opacity: 0 }` |
| `motion-keyframes-spin` | `to { transform: rotate(1turn) }` |

(`--p-space-100` is 4px in Polaris's space scale — **unverified** in this pass.)

### Usage rules (docs content, quoted)
- Principles: "Purposeful", "Responsive" ("The scale of the motion should match the scale of the
  action performed"), "Snappy" ("Motion should feel quick and subtle. A snappy animation starts
  rapidly, and slows down towards the end"). Don't: "Use abrupt, instant, or distracting motion".
- Feedback: "Don't … Use overly elaborate or lengthy animations for simple feedback."
- Transitions: "Don't … Animate all elements on a page simultaneously … Animating a single element
  is often enough".
- Timing: "Motion is fast enough to not cause delay, but slow enough to be understood."
- Interaction states: "Be subtle, but clear … Avoid elaborate transitions that create visual noise
  or intense color changes." (Page is flagged "currently being reworked … aligned with Polaris
  v12".)

### Shipped component motion (code)

| Component | Motion |
| --- | --- |
| Button | No `transition` declared in `Button.module.css` → hover/press colour changes are instant |
| Tooltip overlay | `animation: appear-below|appear-above 50ms ease-out`, delay `100ms`; `prefers-reduced-motion` → `animation: none`. `hoverDelay` prop has no default |
| Popover | open: `opacity` + `transform: translateY(offset → 0)` over `100ms` `motion-ease`; no-animation variant: opacity `100ms` |
| Modal dialog | `transform` + `opacity` `200ms` `motion-ease`, from `translateY(200px)`, opacity 0 |
| Backdrop | `fade-in 200ms` |
| Sheet | `transform 300ms motion-ease` |
| Toast | `transform` + `opacity` `400ms motion-ease-out`; enter/exit timing function `motion-ease-in`; exit duration `200ms` |
| IndexTable (rows/bulk actions) | appear `100ms ease-out`, disappear `100ms ease-in`; various `opacity 100ms motion-ease` |
| Checkbox | border/box-shadow `100ms ease-out`; check mark `opacity/transform 150ms ease-out` |
| Frame loading bar | `transform 500ms linear` |

---

## 3. Material Design 3

Source URLs:
- https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration
- https://m3.material.io/foundations/interaction/states/state-layers
- Shipped code: https://github.com/material-components/material-web (`tokens/versions/latest/sass/`,
  `ripple/internal/`, `focus/internal/`, `tokens/_md-comp-focus-ring.scss`), commit dated 2026-10-16.

Note on page: "In the expressive update, components and motion now use the motion physics system,
which uses springs … The easing and duration system is still used for transitions and can be used
by teams that haven't yet updated to GM3 Expressive, but is no longer maintained." (Spring values
were not collected — **unverified**.)

### Easing tokens (guideline)

| Token | CSS |
| --- | --- |
| `md.sys.motion.easing.emphasized` | "N/A (Use Standard as a fallback)" |
| `md.sys.motion.easing.emphasized.decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1.0)` |
| `md.sys.motion.easing.emphasized.accelerate` | `cubic-bezier(0.3, 0.0, 0.8, 0.15)` |
| `md.sys.motion.easing.standard` | `cubic-bezier(0.2, 0.0, 0, 1.0)` |
| `md.sys.motion.easing.standard.decelerate` | `cubic-bezier(0, 0, 0, 1)` |
| `md.sys.motion.easing.standard.accelerate` | `cubic-bezier(0.3, 0, 1, 1)` |

(material-web approximates emphasized as `cubic-bezier(.3,0,0,1)` with the note "approximated
with unknown accuracy".)

### Duration tokens (guideline; identical in material-web tokens)

| Token | Value | Token | Value |
| --- | --- | --- | --- |
| short1 | 50ms | long1 | 450ms |
| short2 | 100ms | long2 | 500ms |
| short3 | 150ms | long3 | 550ms |
| short4 | 200ms | long4 | 600ms |
| medium1 | 250ms | extra-long1 | 700ms |
| medium2 | 300ms | extra-long2 | 800ms |
| medium3 | 350ms | extra-long3 | 900ms |
| medium4 | 400ms | extra-long4 | 1000ms |

Group usage: short = "small utility-focused transitions" ("Selection controls have a short
duration of 200ms with Standard easing"); medium = "transitions that traverse a medium area of the
screen"; long = "often paired with Emphasized easing … large expressive transitions"; extra long =
"ambient transitions that don't involve user input".

### Suggested pairs (guideline, verbatim table)

| Easing | Duration | Transition type |
| --- | --- | --- |
| Emphasized | 500ms | Begin and end on screen |
| Emphasized decelerate | 400ms | Enter the screen |
| Emphasized accelerate | 200ms | Exit the screen |
| Standard | 300ms | Begin and end on screen |
| Standard decelerate | 250ms | Enter the screen |
| Standard accelerate | 200ms | Exit the screen |

### Usage rules (guideline, quoted)
- "The Standard easing set can be used for small utility focused transitions that need to be
  quick. The Standard set is also a fallback for platforms that don't support Emphasized easing,
  like iOS and Web."
- Enter: "Emphasized decelerate … begins at peak velocity then comes to a gentle rest."
- Exit permanently: "Emphasized accelerate … By ending at peak velocity, it gives the impression the
  exiting component cannot be retrieved." Exit temporarily (e.g. drawer): "Emphasized easing".
- "Transitions that exit, dismiss, or collapse an element use shorter durations. Exit transitions
  are faster because they require less attention than the user's next task. Transitions that enter
  or remain persistent on the screen use longer durations."
- Size: "Transitions that cover small areas of the screen have short durations. Those that traverse
  large areas have long durations."

### State layers (guideline + tokens)

| State | Opacity (`md.sys.state.*.state-layer-opacity`) |
| --- | --- |
| Hover | 0.08 ("+8%") |
| Focus | 0.1 ("+10%") |
| Pressed | 0.1 ("+10%") |
| Dragged | 0.16 ("+16%") |
| Disabled | 0.38 |

"The state layer is an overlay with a fixed opacity for each state and uses the same color as the
content." "Only one state layer can be applied at a given time."

### Shipped hover/press/focus motion (material-web code)

| Item | Value |
| --- | --- |
| Hover state layer | `transition: opacity 15ms linear, background-color 15ms linear` |
| Press ripple fade-in | `transition-duration: 105ms` |
| Press ripple fade-out | `transition: opacity 375ms linear` |
| Ripple grow | `PRESS_GROW_MS = 450`, `MINIMUM_PRESS_MS = 225` |
| Focus indicator tokens | thickness `3px`, outer offset `2px`, inner offset `-3px` |
| Focus ring animation | width `3px` → active width `8px` and back; duration `md.sys.motion.duration.long4` (600ms) split 25% grow / 75% shrink; easing emphasized; reduced motion → `animation: none` |

---

## 4. Microsoft Fluent 2

Source URLs:
- https://fluent2.microsoft.design/motion (guideline; it publishes no numeric tokens)
- Tokens: https://github.com/microsoft/fluentui — `packages/tokens/src/global/durations.ts`,
  `packages/tokens/src/global/curves.ts`
- Shipped code: `packages/react-components/react-button/.../useButtonStyles.styles.ts`,
  `react-switch/.../useSwitchStyles.styles.ts`, `react-tabs/.../useTabAnimatedIndicator.styles.ts`,
  `react-tooltip/.../Tooltip.types.ts`, `react-positioning/src/createSlideStyles.ts`,
  `react-motion-components-preview/.../Fade/Fade.ts` (master, fetched 2026-10-17).

### Duration tokens (code)

| Token | Value |
| --- | --- |
| `durationUltraFast` | 50ms |
| `durationFaster` | 100ms |
| `durationFast` | 150ms |
| `durationNormal` | 200ms |
| `durationGentle` | 250ms |
| `durationSlow` | 300ms |
| `durationSlower` | 400ms |
| `durationUltraSlow` | 500ms |

### Curve tokens (code)

| Token | Value |
| --- | --- |
| `curveAccelerateMax` | `cubic-bezier(0.9,0.1,1,0.2)` |
| `curveAccelerateMid` | `cubic-bezier(1,0,1,1)` |
| `curveAccelerateMin` | `cubic-bezier(0.8,0,0.78,1)` |
| `curveDecelerateMax` | `cubic-bezier(0.1,0.9,0.2,1)` |
| `curveDecelerateMid` | `cubic-bezier(0,0,0,1)` |
| `curveDecelerateMin` | `cubic-bezier(0.33,0,0.1,1)` |
| `curveEasyEaseMax` | `cubic-bezier(0.8,0,0.2,1)` |
| `curveEasyEase` | `cubic-bezier(0.33,0,0.67,1)` |
| `curveLinear` | `cubic-bezier(0,0,1,1)` |

### Usage rules (guideline, quoted)
- Duration: "Give larger elements more time to animate than smaller elements. Aim for a fast and
  smooth motion without making people wait."
- Linear: "use it only in cases that need a consistent rate, like rotations."
- Enter and exit: "commonly used for menus, dialogs, and other interactive elements".
- Elevation: "commonly used for button states, drag and drop interactions".
- Top level (page navigation): "use a quick fade transition instead of moving or sliding UI
  elements around on and off the screen."
- Staggering: "use short offsets between them … Non-staggered animation should only be used for
  very large groups of elements".
- Accessibility: "Design for and include a 'no motion' setting"; "Keep durations short and the
  movement natural"; "Keep the motion constrained to the element in focus."

### Shipped component motion (code)

| Component | Motion |
| --- | --- |
| Button | `transitionDuration: durationFaster` (100ms), `transitionProperty: 'background, border, color'`, `transitionTimingFunction: curveEasyEase`; reduced motion → `0.01ms` |
| Switch | track `background, border, color` and knob `transform`: `durationNormal` (200ms) `curveEasyEase`; reduced motion → `0.01ms` |
| Tab selected indicator | slides via `transform`, `durationSlow` (300ms) `curveDecelerateMax`; reduced motion → `transitionProperty: none`, `0.01ms` |
| Positioned surfaces (popover/menu/tooltip slide) | `animationDuration: durationSlower` (400ms), `animationTimingFunction: curveDecelerateMid`, slide + fade from the main axis (slide distance passed by caller — value **unverified**) |
| Fade presence component | default `durationNormal` (200ms) `curveEasyEase`; `FadeSnappy` = `durationFast`, `FadeRelaxed` = `durationGentle` |
| Tooltip | `showDelay` default `250`, `hideDelay` default `250` (ms) |

---

## 5. Apple Human Interface Guidelines

Source URLs:
- https://developer.apple.com/design/human-interface-guidelines/motion (change log latest entry:
  September 9, 2025)
- https://developer.apple.com/design/human-interface-guidelines/accessibility (Motion section)

No duration or easing numbers are published for apps. Rules (quoted):
- "Add motion purposefully, supporting the experience without overshadowing it."
- "Make motion optional … avoid using it as the only way to communicate important information."
- "Aim for brevity and precision in feedback animations."
- "In apps, generally avoid adding motion to UI interactions that occur frequently."
- "Let people cancel motion … don't make people wait for an animation to complete before they can
  do anything".
- Reduce Motion (accessibility page): "ensure your app or game responds by reducing automatic and
  repetitive animations, including zooming, scaling, and peripheral motion", including "Replacing
  transitions in x-, y-, and z-axes with fades to avoid motion", "Tightening animation springs to
  reduce bounce effects", "Avoiding animating into and out of blurs".

---

## 6. GitHub Primer and Radix UI Tooltip

### Primer
Source URLs:
- Motion tokens: https://github.com/primer/primitives — `src/tokens/base/motion/easing.json5`,
  `src/tokens/base/motion/timing.json5`, `src/tokens/functional/motion/motion.json5` (commit dated
  2026-10-12). A primer.style page for these tokens was not found by search — the doc-site page is
  **unverified**; the values come from the token source.
- Tooltip: https://github.com/primer/react — `packages/react/src/TooltipV2/Tooltip.tsx` and
  `Tooltip.module.css`.

Base easing: `linear [0,0,1,1]`, `ease [0.25,0.1,0.25,1]`, `easeIn [0.7,0.1,0.75,0.9]`,
`easeOut [0.3,0.8,0.6,1]`, `easeInOut [0.6,0,0.2,1]`. Base durations: 0, 50, 100, 200 … 1000ms
(100ms steps).

| Functional token | Value | Published description |
| --- | --- | --- |
| `motion.duration.micro` | 100ms | "Fast micro-interactions like hover, focus ring, and color shifts." |
| `motion.duration.short` | 200ms | "state changes like expand/collapse, toggles, and visibility changes." |
| `motion.duration.medium` | 300ms | "elements entering or exiting the viewport, such as modals and dropdowns." |
| `motion.duration.long` | 500ms | "complex multi-step animations or large-scale layout shifts. Use sparingly." |
| `motion.easing.hover` | ease `cubic-bezier(0.25,0.1,0.25,1)` | "hover state changes and micro-interactions" |
| `motion.easing.enter` | easeOut `cubic-bezier(0.3,0.8,0.6,1)` | "Decelerating easing for elements entering" |
| `motion.easing.exit` | easeIn `cubic-bezier(0.7,0.1,0.75,0.9)` | "Accelerating easing for elements exiting" |
| `motion.easing.move` | easeInOut `cubic-bezier(0.6,0,0.2,1)` | "elements moving or morphing within the viewport" |
| `motion.easing.linear` | linear | "progress bars or loaders" |
| `motion.transition.hover` | 100ms + hover easing | "hover state changes on interactive elements like buttons and links" |
| `motion.transition.stateChange` | 200ms + move easing | "toggles, expand/collapse, and visibility changes" (usage list includes `tab-switch`) |
| `motion.transition.enter` | 300ms + enter easing | "modals, dropdowns, and tooltips" |
| `motion.transition.exit` | 200ms + exit easing | "closing modals and dismissing dropdowns"; rule: "Shorter than enter to feel snappy." |

Group rule (verbatim): "MUST keep UI interactions ≤300ms. Use micro for hover/focus, short for
state changes, medium for enter/exit. NEVER exceed 500ms for UI interactions." Transition rule:
"MUST respect prefers-reduced-motion."

Primer React tooltip (code): `delay` prop default `short` = 50ms; `medium` = 400ms; `long` = 1200ms.
Closes immediately on mouse leave and blur. Appear animation `tooltip-appear` (opacity 0 → 1),
`animation-duration: 0.1s`, `animation-timing-function: ease-in`, only inside
`@media screen and (prefers-reduced-motion: no-preference)`.

### Radix UI Tooltip
Source URL: https://www.radix-ui.com/primitives/docs/components/tooltip

| Prop | Default |
| --- | --- |
| `Provider.delayDuration` | 700 |
| `Provider.skipDelayDuration` | 300 |
| `Root.delayDuration` | 700 |
| `Content.side` / `sideOffset` | `"top"` / `0` |

Keyboard: `Tab` "Opens/closes the tooltip without delay"; `Escape`, `Space`, `Enter` close
"without delay". Trigger/content `data-state`: `closed | delayed-open | instant-open`. Docs example
animations (`scaleIn 0.5s ease-out`; `0.6s cubic-bezier(0.16, 1, 0.3, 1)` with 10px slide) are
illustrative demos, not documented defaults.

---

## 7. Linear

Source URLs checked:
- https://linear.app/now/behind-the-latest-design-refresh (March 2026 refresh post)
- https://linear.app/now/how-we-redesigned-the-linear-ui (part II)

Neither post publishes any motion duration, easing, or hover-timing value. The refresh post is
about visual hierarchy (dimmer sidebar, compact tabs, fewer borders, warmer greys). **No
verifiable Linear motion specs exist; do not cite Linear for motion.**

---

## 8. WCAG 2.2 SC 2.3.3 and prefers-reduced-motion

Source URLs:
- https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion (redirects to
  .../Reference/At-rules/@media/prefers-reduced-motion; last modified Jun 10, 2026)

- SC 2.3.3 (Level AAA), verbatim: "Motion animation triggered by interaction can be disabled,
  unless the animation is essential to the functionality or the information being conveyed."
- "Motion animation" definition: "addition of steps between conditions to create the illusion of
  movement or to give a sense of a smooth transition". Errata: the definition does *not* exclude
  blurring.
- Sufficient techniques: C39 (CSS `prefers-reduced-motion`), SCR40 (the same query in JavaScript),
  or a user setting that prevents animation.
- Example given: a non-essential page transition "respects the `prefers-reduced-motion` CSS media
  query. When the user enables the reduce motion preference, the page-flipping animation is turned
  off."
- MDN: `reduce` "Indicates that a user has enabled the setting on their device for reduced motion";
  `@media (prefers-reduced-motion)` equals `@media (prefers-reduced-motion: reduce)`. The setting
  asks for an interface "that removes, reduces, or replaces motion-based animations". "Animations
  such as scaling or panning large objects can be vestibular motion triggers." MDN's example swaps
  a scaling animation for an opacity-only "dissolve". Baseline widely available since January 2020.

---

## Which source answers which question

Each question gives the best-documented answer first, then supporting sources. "Guideline" means
the documentation site; "code" means the system's own shipped styles.

**(a) Hover-in on buttons / rows / icons**
- Best documented: **Primer `motion.transition.hover`** — 100ms, `cubic-bezier(0.25,0.1,0.25,1)`
  (CSS `ease`), described as "Use for all hover state transitions". It is the only system with a
  semantic token named for hover.
- Agreeing code: Fluent Button 100ms `curveEasyEase` `cubic-bezier(0.33,0,0.67,1)`; Carbon button
  70ms entrance-productive `cubic-bezier(0, 0, 0.38, 0.9)`, data-table row 70ms entrance-productive,
  link colour 70ms standard-productive. Carbon guideline: micro-interactions "90–120 ms" using
  "ease-out on user input".
- Opposite ends: M3 hover state layer 15ms linear (near-instant); Polaris buttons have no
  transition at all (instant).
- Colour treatment: M3 hover = content-coloured overlay at 8% opacity.

**(b) Hover-out — is it different?**
- No system publishes a separate hover-out duration or easing. Primer, Fluent, Carbon and M3 each
  declare one `transition` on the base element, so leaving runs the same duration and curve in
  reverse. Primer's "Shorter than enter" exit rule applies to elements *leaving the viewport*,
  not to hover. **No source documents a different hover-out.**

**(c) Press / active feedback**
- M3 (guideline + code): pressed state layer 10% opacity; ripple fade-in 105ms, fade-out 375ms
  linear, grow 450ms, minimum press 225ms.
- Carbon: buttons share the 70ms entrance-productive transition across background states.
  Polaris: instant (no transition). Fluent: guideline names "Elevation" for "button states"; code
  uses the same 100ms transition. **No web system documents a scale-down press animation.**

**(d) Focus ring appearance**
- Primer: focus ring belongs to `duration.micro` (100ms) with hover easing.
- Carbon (code): `outline: 2px solid $focus`, with outline included in the 70ms button transition.
- M3: focus state layer 10%; focus indicator 3px thick, 2px outer offset; material-web animates
  the ring 3px → 8px → 3px over 600ms emphasized (expressive; reduced motion removes it).
- WCAG/Apple: the ring must stay visible when motion is reduced (only the animation goes).

**(e) Tooltips (delay, enter, exit)**
- Open delay (documented defaults): Radix 700ms (skip delay 300ms); Fluent show 250ms / hide 250ms;
  Carbon enter 100ms / leave 300ms; Primer 50ms by default (400ms / 1200ms options); Polaris 100ms
  animation delay. Radix: keyboard focus opens "without delay".
- Enter animation: Polaris `appear-below/above` (4px translate + fade) 50ms ease-out; Primer
  opacity 100ms ease-in; Primer token `transition.enter` (300ms) lists `tooltip-show`.
- Exit: Primer closes immediately on mouse leave; Primer token `transition.exit` 200ms lists
  `tooltip-hide`.

**(f) Menus / popovers / selects — open and close**
- Best documented: Primer `transition.enter` 300ms `cubic-bezier(0.3,0.8,0.6,1)` ("dropdown-open",
  "popover-enter"); `transition.exit` 200ms `cubic-bezier(0.7,0.1,0.75,0.9)` ("dropdown-dismiss").
- Code: Polaris popover 100ms `motion-ease` opacity + translateY; Carbon dropdown menu `max-height`
  110ms standard-productive, items 70ms; Carbon overflow menu 110ms entrance-productive; Fluent
  positioned surfaces 400ms `curveDecelerateMid`.
- Rule: Carbon says dropdowns use productive motion with entrance/standard easing.

**(g) Dialogs / sheets — open and close**
- Carbon (guideline + code): modal 240ms (`moderate-02`); in = entrance-expressive
  `cubic-bezier(0, 0, 0.3, 1)`, out = exit-expressive `cubic-bezier(0.4, 0.14, 1, 1)`; container
  slides 24px; dim the layer below ("always dim the content below"). Side panel exit uses standard
  easing ("stays nearby").
- M3: enter emphasized-decelerate 400ms / exit emphasized-accelerate 200ms (standard set fallback
  on web: 250ms / 200ms). Exit shorter than enter.
- Primer: enter 300ms / exit 200ms. Polaris code: modal 200ms ease, from translateY(200px);
  backdrop fade 200ms; sheet 300ms ease.

**(h) Toasts**
- Carbon guideline: `duration-moderate-02` 240ms for "system communication, toast"; exit easing
  "such as closing a modal or toaster"; expressive motion for "appearance of notification boxes".
- Polaris code: toast in 400ms ease-out, exit 200ms with ease-in.

**(i) Page / route content appearing**
- Fluent: "use a quick fade transition instead of moving or sliding" for top-level navigation.
- Carbon: stagger 20ms, total within 500ms; order shell → body → dynamic data → primary action →
  charts. Apple and M3 prefer fades under reduced motion.
- Primer: `duration.long` 500ms lists "page-transition" but says "Use sparingly".

**(j) Skeleton / loading**
- Carbon code: skeleton 3000ms ease-in-out infinite shimmer (scaleX sweep); `animation: none` under
  reduced motion.
- Primer/Polaris/Fluent: linear easing for continuous loaders/spinners. Polaris loading bar
  `transform 500ms linear`.

**(k) List row hover and selection**
- Carbon code: data-table row `background-color` 70ms entrance-productive.
- Primer: hover 100ms ease. M3: hover 8% overlay; selection controls 200ms standard.
- Polaris: IndexTable bulk-action bar appear 100ms ease-out / disappear 100ms ease-in; selection
  should be "subtle" (Polaris says "Don't" animate the whole row on selection).

**(l) Tabs underline movement**
- Fluent code: the selected indicator *slides* (`transform`) over 300ms `curveDecelerateMax`
  `cubic-bezier(0.1,0.9,0.2,1)`; removed under reduced motion.
- Carbon code: no slide; underline colour changes in 70ms standard-productive.
- Primer: `transition.stateChange` (200ms, easeInOut) lists `tab-switch`.

**(m) Switches / checkboxes**
- M3 guideline: "Selection controls have a short duration of 200ms with Standard easing"
  `cubic-bezier(0.2, 0, 0, 1)`.
- Fluent code: switch 200ms `curveEasyEase`. Primer: `transition.stateChange` 200ms lists "toggle".
- Carbon code: toggle 70ms exit-productive. Polaris code: checkbox border 100ms, check mark 150ms
  ease-out.

**(n) Reduced motion**
- WCAG 2.2 SC 2.3.3 (AAA): interaction-triggered motion must be possible to disable; C39 =
  `prefers-reduced-motion` CSS. MDN: "removes, reduces, or replaces" motion; scaling and panning
  are triggers; swap for opacity.
- Apple: replace x/y/z movement with fades; no blur animations.
- Shipped patterns: Carbon/Polaris `transition: none` / `animation: none`; Fluent
  `transitionDuration: '0.01ms'`; Primer enables tooltip animation only under `no-preference`.

### Unverified items
- Polaris token page on polaris.shopify.com (now redirects); values come from the Polaris repo.
- A primer.style page listing the motion tokens (values come from primer/primitives source).
- `--p-space-100` pixel value; Fluent slide distance for positioned surfaces.
- M3 spring ("motion physics") values.
- Any Linear motion values (none published).
