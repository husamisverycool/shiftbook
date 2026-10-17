# 0034 — The product is called Granite

Date: 2026-10-17. Status: accepted (owner).

## Context
The owner renamed the product: "new name for everything should be Granite … the name should not be
Shiftbook anymore", with the artwork for its mark and wordmark, the icon to be taken out of it on its
own.

## Decision
1. **The name.** Every word a person reads says Granite: the screens and their titles, the sign-in
   pages, emails ("<agency> via Granite"), the authenticator app's account label and the passkey's
   site name for new set-ups, the compliance duties Granite closes, the documentation people read
   (README, SPEC, CLAUDE.md, the pattern files, the hosting settings).
2. **The mark** is taken from the owner's artwork by measurement, not by eye: 24 rectangular bars
   every 15° around a circle, alternately long and short, the long ones at 12, 3, 6 and 9 o'clock.
   On a radius of 100 the long bars start at 52.43, the short at 65.24, every bar 13.38 wide (from
   the artwork's 2000-pixel image: centre (203.02, 202.44), outer radius 165.56, inner radii 86.8 and
   108.01, width 22.16; the rebuilt mark covers the artwork's to within its blurred edges). The
   **wordmark** is traced from the same artwork (99.3% of its pixels in common), so no font is
   guessed. Files: `public/brand/granite-mark.svg`, `public/brand/granite-logo.svg`, the browser-tab
   icon `src/app/icon.svg` (dark on light tabs, light on dark ones); in the app,
   `GraniteMark` / `GraniteLogo` / `BrandMark` (`src/components/shiftbook/brand-mark.tsx`), drawn in
   the text colour.
3. **Where the mark goes**, as the reference products place theirs: above the heading on the
   sign-in pages (Linear, Notion — bare, no tile behind it; this replaces decision 0031's small
   rounded square with a book icon) and as the browser-tab icon. The sidebar keeps the agency's own
   menu (Linear's workspace menu shows the workspace, not Linear), and client-facing documents
   (invoices, statements) stay the agency's.
4. **What keeps the old name**, because nobody reads it and changing it would break running
   installations: settings names (`SHIFTBOOK_MODE`, `SHIFTBOOK_APP_URL`, …), database and role
   names, folder names in the code, cookie and link prefixes. Records written before the rename
   (decision records, research notes, screen records, earlier plans) stay as they were written.
5. **Answer keys.** Three sentences flow into the approved answer keys (the Illinois equal-pay
   note "The 600-hour heads-up is Shiftbook's …" and the payroll files' rounding notes "Shiftbook
   computed …"). They change only with the owner's approval of the matching answer keys.

## Consequences
Authenticator apps that were set up before keep showing the old label until set up again; existing
passkeys keep the site name they were made with (both are labels only).
