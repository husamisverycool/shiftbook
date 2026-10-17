# Pattern: Loading — page outlines and buttons that show they're working (shared)

Status: adopted — slice o (2026-10-17)
Reference product and screen: Shopify Polaris SkeletonPage family (page outline); GitHub Primer
Button `loading` (a button at work); Primer's wait-time guidance; Carbon loading pattern
Source URL: https://github.com/Shopify/polaris/tree/main/polaris-react/src/components/SkeletonPage
Source URL: https://github.com/Shopify/polaris/tree/main/polaris-react/src/components/SkeletonBodyText
Source URL: https://primer.style/components/button
Source URL: https://primer.style/ui-patterns/loading
Source URL: https://carbondesignsystem.com/patterns/loading-pattern/
Researched: 2026-10-17 (`docs/research/states-slice-o.md`). Confidence: high (each system's source).

## Hierarchy
1. **A page loading** (Polaris SkeletonPage: "mimic the loaded layout"): the frame stays; inside
   the content panel, the page's own outline at the page's own width — a list area's title as real
   text (Polaris: "keep fixed titles as real text"), otherwise a title bar; a block where the primary
   action goes; tab bars when the page has tabs; then the body in the page's shape:
   - list: rows of bars separated by hairlines (as the loaded rows);
   - record: the ancestors bar, title bar, one facts line, then the record on the left and
     label-over-value pairs on the right;
   - settings: the one centred column with panels of rows;
   - dashboard: a row of figures, then chart cards.
   Bars are `bg-muted` rounded blocks: body text 8px high with 12px gaps, the last line of a group
   80% wide (Polaris SkeletonBodyText); headings at most 120px wide. They pulse slowly
   (`_components/motion.md`: Carbon's 3000ms) and stop under reduced motion.
2. **A button at work** (Primer Button `loading`): a spinner takes the place of the leading icon (or
   of the label when there is no icon, keeping the width); the button is `aria-disabled` and ignores
   presses; a hidden live region says "Loading".
3. Wait times (Primer): under a second nothing changes; a spinner or outline from one second.

## Never
A spinner for a whole page (Polaris: spinners are "not … for an entire page load"); outlines for
menus, dialogs or toasts (Carbon); a page outline that shifts when the page arrives.

Deviations allowed: none
