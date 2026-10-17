# Pattern: Settings pages (shared component)

Status: adopted — decision 0029 rule 11, made exact on 2026-10-17 after the owner asked again that every
part be modelled precisely on its reference
Reference product and screen: Linear — Settings › Preferences (sections of rows in rounded panels), Team
permissions and Team access (a heading with one muted line, then the panel; a row with only a label and a
text action), Notifications (the page's title with one muted line; rows with a 32px tile, the name over
its state), Security's SAML domains and API keys (a list in the panel: a tile or avatar, the name over
when it was added, the action at the right; a part of a panel holding a nested list), Invite members'
approved domains (an empty panel: one muted row), IP restrictions (the section's add button at the
heading's right), Profile's "Leave workspace" (a light-theme panel: white on the page, a light border; a
destructive text action), the SAML setup dialog (label over a full-width input, the hint under it, a
hairline, the primary action at the bottom right); Vercel — account Email (a note at the panel's foot)
Source URL: https://linear.app/docs/account-preferences
Source URL: https://linear.app/docs/members-roles
Source URL: https://linear.app/docs/notifications
Source URL: https://linear.app/docs/saml-and-access-control
Source URL: https://linear.app/docs/api-and-webhooks
Source URL: https://linear.app/docs/invite-members
Source URL: https://linear.app/docs/login-methods
Source URL: https://linear.app/docs/scim
Source URL: https://linear.app/docs/profile
Source URL: https://vercel.com/docs/accounts
Researched: 2026-10-17 from the screenshots those pages publish (2× captures; measured pixel by pixel,
halved to CSS pixels). Confidence: high for the structure and the measurements below; Linear's own
colours are not used.

## Hierarchy
1. **Page:** the shared page header (decision 0029 rule 2: "Settings" above the title, the title, a
   muted line when the page has one); then the sections in **one centred column, the same width on every
   settings page**.
2. **Section:** a heading, one muted line under it (when the page has something to say), an optional
   action at the heading's right (Linear's "+ Restriction"; an outlined small button with a plus).
3. **Panel** under the section heading: a rounded bordered box on the card colour, holding either
   - **rows**, a hairline between each that stops at the panel's padding (Linear's Preferences); or
   - **free content** — a form's fields, label over a full-width field with its hint under it (Linear's
     SAML setup); or parts of a composite setting, each part between hairlines, a list nested in a part
     (Linear's SAML panel).
   Two panels in one section sit 12px apart (Linear's "Interface theme" under "Font size").
4. **Row:** an optional 32px tile (an icon or a provider's mark) or an initials avatar; the **label**
   (medium) over a **muted line**; the **control** at the right, vertically centred — a select, a switch,
   an input, a figure, or a text action. A row with no muted line keeps the same height (Linear's "Change
   team visibility").
5. **Empty panel:** one row, the muted line saying nothing is there yet (Linear's "No approved email
   domains").
6. **Panel foot** (forms and choices saved with a button): a hairline across the panel, a muted note at
   the left (who changed it last; Vercel), the actions at the right, the primary last (Linear's SAML
   setup). A list whose section records who changed it last ends with the same foot holding only the note.

## Look (measured on Linear's 2× screenshots; Linear sets its type at 13px, Granite at 14px, so lengths
tied to type are scaled by 14/13 and the rest kept)
| Part | Linear (CSS px) | Granite |
|---|---|---|
| Column | 640 wide, centred | 688 wide (`max-w-188` with the page's 32px side padding), centred |
| Section heading | 15px medium | 16px medium (`text-base font-medium`) |
| Section's muted line | 13px, 24–25px from the heading's cap to its cap | 14px muted, 2px under the heading (26px cap to cap) |
| Heading block → panel | last baseline to panel 22.5–27.5 | 18px gap (24–25px baseline to panel) |
| Panel | 1px border, radius ≈ the controls', card a step lighter than the page (dark); white with a light border on a near-white page (light) | `rounded-lg border bg-card` (10px, the controls' radius) |
| Panel padding | 16 left and right | `px-4` |
| Row | 60 tall (59 + 1px hairline), label cap 15 from the top, 14 from the last line to the hairline | `min-h-15 py-2.5`, the same 15/14 measured |
| Hairline between rows | 1px, the border colour, inset 16 each side | `divide-y` inside `px-4` |
| Row label / muted line | 13px medium / 12px, 19px cap to cap | 14px medium / 13px muted on an 18px line, 20px cap to cap |
| Tile | 32 square, rounded, 10 before the label | `size-8 rounded-md bg-muted`, 10px (`gap-2.5`) |
| Control | 32 tall, right edge on the padding | shadcn controls (`h-8`) at the right |
| Text action | plain text, no border ("Customize", "Make private…", "Send test notification") | `ghost` button; destructive ones in the destructive colour ("Leave workspace") |
| Panels in one section | 13 apart | 12 (`gap-3`) |
| Section → next heading | 53.5 from panel to cap | 48px gap (54px panel to cap) |
| Page header → first section | 63.5 title cap to heading cap | 32px gap (`gap-8`) under the shared header |
| Panel foot | hairline across, 16 padding, primary at the right | `border-t px-4 py-3`, note 13px muted at the left |

## Interactions
- Rows are not clickable as a whole unless the row is a choice (a radio row is its label).
- Text actions and buttons keep shadcn's focus ring; keyboard order follows the reading order.

## States
- Read only: the controls are disabled or absent; the page header's muted line says who changes them.
- Saving: the action says it is working; a saved form says so next to its action, live.

## Never copy
Linear's or Vercel's colours, icons, wording or logos; the type sizes are scaled to Granite's own.

Deviations allowed: none
