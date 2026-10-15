# 0005 — Local text recognition to black out identifying numbers

Status: accepted
Date: 2026-10-15

## Context
SPEC §21: SSN-shaped and date-of-birth text must be removed from images before any model call.

## Decision
`tesseract.js` with the bundled English model (`@tesseract.js-data/eng`, 4.0.0_best_int) runs on the
server; SSN-shaped and birth-date text is painted over with sharp. Only the redacted page is sent to
a model or shown in the review panel; the original is kept in storage. Model answers are also
scrubbed of SSN-shaped text, with a note on the document. Inside the Next.js server bundle the model
folder is located through the project's node_modules (module resolution returns a virtual path),
and recognition errors reject the reading instead of crashing the server.

## Alternatives considered
A cloud OCR service: sends the unredacted image out, the very thing to avoid.

## Consequences
Reading a photo takes a few seconds of local CPU first. OCR misses on very poor handwriting are
possible; the model is also told never to return identifying numbers, and its answers are scrubbed.
