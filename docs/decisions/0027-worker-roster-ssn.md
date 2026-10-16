# 0027 — The worker roster: envelope-encrypted SSNs, an audited reveal, documents

Status: accepted
Date: 2026-10-16

## Context
SPEC §17 asks for a worker roster with an encrypted SSN of which only the last four show; a reveal
needs the Owner, a reason, and is audited; language preference; payroll numbers per system;
documents. §21: SSNs encrypted at the application layer with a key outside the database, never in
logs, prompts or exports except the audited reveal. §24 step 10: "An Owner can reveal one SSN with a
reason and the audit log shows it."

## Decision
- **Envelope encryption** (`src/server/workers/ssn.ts`): a fresh 256-bit data key per SSN seals the
  nine digits (AES-256-GCM, bound to the worker); the data key is sealed with the key-encryption key
  from the environment (`SHIFTBOOK_ENCRYPTION_KEY`, decision 0025), bound to the worker too. The row
  keeps the sealed value, the last four in clear, and a keyed index (HMAC-SHA256 under a key derived
  from the key-encryption key per agency) that finds a duplicate within the agency (Toast: a new SSN
  that is already on another profile does not save) without revealing anything.
- **Validation**: nine digits; the SSA's never-issued area 000 and 666, group 00, serial 0000 are
  refused; area 900–999 is accepted (ITINs, and every test number). Toast refuses 9xx; our test data
  must be 9xx (CLAUDE.md), and agencies do pay ITIN holders.
- **Reveal** (Toast's Retrieve SSN): the Owner only, with a business reason (required, kept), one
  worker at a time; who looked is listed to the Owner only (the other roles' pages carry none of it); the number goes to the screen in the response of that one action and nowhere
  else (not in the page's data, not in a log line). Each reveal and each change is an audit event
  (`reveal` / `update` on the worker, the reason with it, never the number); the dialog lists them.
- **Where SSNs never go**: the worker list, exports and payroll files (they use payroll numbers),
  emails, error messages, the activity log's before/after (the last four at most).
- **Documents**: a worker's files are kept in the agency's document store (the compliance documents'
  table and checks: type by extension, size limit, SHA-256), linked to the worker with a kind and an
  effective date; removing one unlinks it (the file stays for the record). The kinds are Form W-4,
  a state withholding form, a direct deposit form and other: no Form I-9 or identity-document copies
  (decision J4, slice j: the I-9 is dates only). A file name holding an SSN is refused. A worker's
  file holds the SSN (a W-4, a state form) or bank details, so it is opened like a reveal: the Owner
  only, with a business reason, recorded as a `reveal` event on the worker (the file named, never
  its contents), then a two-minute download address signed for that person and that file
  (`src/server/workers/file-grant.ts`, `/api/files/worker/[id]`). The compliance files' route never
  serves a worker's file. Everyone else (the accountant included: SPEC §2, "everything except
  SSNs") sees the list.
- **Guessing through the duplicate check**: the "already on another worker" answer could confirm a
  guessed number. Each refused duplicate is recorded on the worker whose number it is (listed in
  their Retrieve SSN dialog), and one person may enter at most 30 SSNs an hour (counted from the
  log, refusals included). Entering is serialized per agency (an advisory lock), so two people
  saving the same number at once get "duplicate", not an error.
- **No SSN in free text that is kept or exported**: a reveal's reason, a file name and a payroll
  number refuse SSN-shaped text (`src/lib/ssn-text.ts`): the log is append-only and payroll numbers
  go into payroll files.
- **Status**: Active or Ended (with the date); a worker is never deleted (Toast: profiles are not
  deleted; employment ends).

## Alternatives considered
- Postgres `pgcrypto` with a key passed per query: the key would travel to the database and appear in
  its logs and statement stats.
- One data key per agency: one leak opens every number; per-SSN keys cost nothing here.
- A cloud KMS: the deployment target's own KMS can replace the environment key later without changing
  the stored format (only the wrapped data keys are re-wrapped).

## Consequences
- Rotating the key-encryption key means re-wrapping each data key and recomputing each keyed index
  (the index key is derived from the key-encryption key), both from the unsealed number (a script);
  the SSNs' own ciphertexts stay as they are.
- Losing the key loses every SSN: it is kept with the other environment secrets, never in the database.
