# Pattern: Settings › Onboarding — the policies workers acknowledge

Status: adopted — decision 0043 (2026-10-17)
Reference product and screen: Linear settings (`_components/settings.md`: one column, a section
heading with its add action, rows in a bordered panel, each row's label over a muted line and its
control at the right); Rippling's employee-handbook practice for the content rules (sent to new hires
to acknowledge; an update rolls out to everyone); Gusto's custom documents for admins (title, the
text, who must sign) — its help page loads by script and could not be read, so its fields are taken
from Rippling's description only
Source URL: https://linear.app/docs/account-preferences
Source URL: https://www.rippling.com/blog/employee-handbook-for-small-business
Source URL: https://support.gusto.com/article/139521470100000/upload-and-share-custom-documents-with-your-team-for-admins
Researched: 2026-10-17 (`docs/research/vms-profiles-gap.md` part 3). Confidence: medium for the
layout (Linear's own), low for the policy rules (Rippling's article, not a product screen).

## Hierarchy
1. The settings title "Onboarding", as every settings page (rule 2).
2. Section **Policies** — heading with one muted line ("Workers read and acknowledge these when they
   join; a change asks everyone again"), **Add policy** at the heading's right.
3. Its panel: one row per policy in force — the title (medium) over a muted line (required or
   optional · version · from date · "{n} still to acknowledge" when any); at the right, **Edit** and a
   "…" menu with **Remove**. Until the agency saves one, the three built-in policies are listed with a
   muted "built in" note.
4. Section **Scheduled changes** (only when there are any): a row per version that starts later —
   title, "from {date}", "removed" when it removes the policy.

## Interactions
- **Add policy / Edit**: a dialog — title and text in English (required), title and text in Spanish
  (optional; workers who prefer Spanish read it), "Required" switch, "In force from" date (today or
  later). Save makes a new version; workers who acknowledged an older one are asked again from its
  date (worker app Home: a card "A policy changed"; the policies step opens first).
- **Remove**: a confirm dialog with the date it stops; nothing already acknowledged is deleted.
- Owner and Coordinator change policies; everyone else reads the page.

## States
- Loading: the settings outline (`_components/loading.md`).
- Built in only: the three policies, editable (the first save keeps them as version 1).
- A save refused: each field says what to fix under it.

Deviations allowed: none
