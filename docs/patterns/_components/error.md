# Pattern: A page that failed, and a page not found (shared)

Status: adopted — slice o (2026-10-17)
Reference product and screen: GitHub Primer error guidance and Blankslate (the failed content's
place); GitHub's 404 page (keeps the site's frame); Atlassian error-message writing guidelines;
Next.js `error.js` / `not-found.js`
Source URL: https://primer.style/ui-patterns/messaging
Source URL: https://primer.style/components/blankslate
Source URL: https://github.com/404
Source URL: https://atlassian.design/content/writing-guidelines/writing-error-messages
Source URL: https://nextjs.org/docs/app/api-reference/file-conventions/error
Researched: 2026-10-17 (`docs/research/states-slice-o.md`). Confidence: high for Primer and Next.js;
medium for GitHub's signed-in 404 (the signed-out page was read).

## Hierarchy
1. **A page that failed**: the frame stays (Primer: the global navigation is never hidden); in the
   content panel's place, centred, the empty-state shape (`_components/empty-state.md`): the alert
   icon, a short title (Atlassian: 3–4 words), one line saying what to do, and one button, "Try
   again", that loads the page again (Next.js `retry`).
2. **Not found** (a record that does not exist, or an address that matches no page): the frame
   stays (GitHub's 404 keeps the site's header); centred, a muted icon, "Page not found", one line,
   and one button to Home.

## Never
"Sorry" or "please" (Atlassian); technical details or codes on screen; a dead end without a button.

Deviations allowed: none
