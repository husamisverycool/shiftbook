# 0013 — Client approval links

Status: accepted
Date: 2026-10-16

## Context
A client's approver opens their hours from an email, without an account (SPEC §2, §10). Research:
`docs/research/client-approval-slice-d.md` part 2 §1–3.

## Decision
- Token `sbap_` + base64url of 32 random bytes (`crypto.randomBytes`); only its SHA-256 is stored,
  in a unique column. NIST SP 800-63B-4 asks for salted hashing only below 112 bits.
- The link is in the path: `/{locale}/approve/{token}`. Those pages send `Referrer-Policy:
  no-referrer`, `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and load nothing from other
  sites. Shiftbook's own logs never print a token (the prefix makes redaction reliable).
- Opening the link only reads (mail scanners open links on their own: Microsoft Safe Links;
  RFC 9110 §9.2.1). Approve, dispute and "email me a new link" are POST server actions that check
  the token again; nothing happens on page load.
- Row-level security hides every agency's rows until the agency is known, so the first lookup goes
  through one `SECURITY DEFINER` function that takes the hash and returns only the link's id and
  agency. Everything after runs inside that agency's fence as usual.
- A link lasts the agency's `approval_link_days` setting and stops working for decisions once the
  period's files exist. Each reminder makes a new link; changing the approver or withdrawing an
  approval revokes earlier ones. "Email me a new link" sends only to the address on file, at most
  once per five minutes per link.
- An approval records the typed name, the confirmation text and its version, the time, internet
  address, browser, and a SHA-256 of what was shown (ESIGN § 7006(5): a process adopted with the
  intent to sign).

## Alternatives considered
A keyed HMAC of the token (a secret to manage, the demo included, for no gain at 256 bits); the
token in the fragment (needs client-side code, and mail gateways rewrite whole links anyway);
single-use links (mail scanners would use them up).

## Consequences
The host's own request logs can see links; expiry limits that. Anyone holding a forwarded link can
act until it expires; the confirmation email to the approver and the notice to the agency make that
visible.
