# Pattern: Avatars and colour dots (shared)

Status: adopted — decision 0046 (2026-10-17)
Reference product: GitHub Primer Avatar (circle for people, square for organisations, size scale);
Vercel Geist Avatar (1–2 uppercase initials); Shopify Polaris Avatar (the same initials always the
same colour); Linear and Attio (a small colour mark beside a category's name)
Source URL: https://primer.style/components/avatar
Source URL: https://vercel.com/geist/avatar
Source URL: https://polaris-react.shopify.com/components/images-and-icons/avatar
Source URL: https://linear.app/docs/teams
Researched: 2026-10-17 (`docs/research/visual-richness-slice-z.md` §3–4). Confidence: high.

## Hierarchy
1. **Person** (worker, member, client contact): a circle with one or two uppercase initials (first and
   last name), never "?".
2. **Organisation** (client, the agency): a rounded square with its initials.
3. **Colour**: from a stable hash of the record's id into twelve Tailwind tint pairs — sky, blue,
   indigo, violet, purple, fuchsia, pink, rose, cyan, teal, lime, stone — `{hue}-100` background with
   `{hue}-800` letters (dark: `{hue}-900` with `{hue}-200`); no status hue (red, amber, green,
   emerald).
4. **Sizes** (Primer's scale): 20px in table rows and list rows, 24px in menus and the command menu,
   32px in a page header's people, 40px beside a record page's title.
5. **Colour dot**: an 8px dot in the client's colour before the client's name in tables and on the
   schedule.

## Interactions
None: an avatar is not a button; it sits beside the name, which carries the link.

## States
- No name: the record's first letter of its id is never shown; the avatar is omitted.

## Never
An avatar instead of the name (the name always beside it, `alt=""`); colour that says anything about
status.

Deviations allowed: none
