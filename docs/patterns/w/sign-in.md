# Pattern: Worker sign-in by text message (`/w/sign-in`)

Status: adopted — slice t (2026-10-17)
Reference product and screen: Granite's own emailed-code sign-in (decision 0033, Linear's and
Vercel's emailed code) with the phone number in place of the email; NIST SP 800-63B §5.1.3 for the
text-message code
Source URL: https://linear.app/docs/login-methods
Source URL: https://pages.nist.gov/800-63-3/sp800-63b.html
Researched: 2026-10-17 (`docs/research/workers-app-slice-t.md` §6). Confidence: high.

## Hierarchy
1. The mark and the heading.
2. **Mobile number** field (US numbers) and **Text me a code**.
3. After sending: "We texted a code to (•••) •••-1234", a six-digit **Code** field (one-time-code
   autocomplete), **Sign in**, and **Send a new code**.
4. A number used at more than one agency: after the code, the agencies as a list to choose from.
5. Demo: under a hairline, "Continue as" with the demo workers (as the agency sign-in's Continue as).

## Interactions
- Enter submits each step. The code field accepts a pasted code with spaces.

## States
- Unknown number: the same "We texted a code" answer (nothing tells whether a number is on file).
- Wrong code: "That code didn't work"; five wrong tries end the code; too many requests from one place:
  "Too many tries. Try again in a few minutes."
- Expired or spent code: "That code expired. Send a new code."

Deviations allowed: none
