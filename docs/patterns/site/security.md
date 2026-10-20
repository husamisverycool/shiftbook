# Pattern: Website security (tabulado.com/security)

Status: adopted — slice aa (2026-10-20)
Reference product and screen: Mercury's security page (a short promise, then groups of plain control
statements in the order an owner worries about them, and a FAQ), Resend's security page (an honest
status row with "in progress" labels instead of seals, a detailed controls list, responsible
disclosure), Linear's security hero.
Source URL: https://mercury.com/security
Source URL: https://resend.com/security
Source URL: https://linear.app/security
Researched: 2026-10-20 (`docs/research/website-slice-aa.md`). Confidence: medium.

## Hierarchy
1. Hero (Linear, Mercury): a short promise and one sentence.
2. Status row (Resend): only what is true, labelled exactly (an independent security test and SOC 2:
   not yet).
3. Groups of controls (Mercury's order): Social Security numbers; before any AI reading; your
   agency's data walled off; sign-in; the activity log; money; the demo. Each a heading and two to four
   short statements.
4. Responsible disclosure (Resend, Mercury): where to write, when a contact address is set.
5. Frequently asked questions (Mercury, Resend): an accordion.
6. Closing call to action (Linear).

## Interactions
- As the pricing page's accordion.

## States
- No contact address set (TABULADO_CONTACT_EMAIL): the responsible-disclosure section is not shown.

Deviations allowed: none
