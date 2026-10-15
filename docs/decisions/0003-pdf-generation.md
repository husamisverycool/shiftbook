# 0003 — Invoice PDFs with @react-pdf/renderer

Status: accepted
Date: 2026-10-15

## Context
SPEC §12 needs invoice PDFs, generated on the server, deterministic, without a browser.

## Decision
`@react-pdf/renderer` renders `src/pdf/invoice.tsx` (pattern `docs/patterns/_documents/invoice.md`)
to a buffer. The template receives fully formatted strings; no money arithmetic happens in it.
Built-in Helvetica fonts, so no font files are fetched.

## Alternatives considered
Headless Chromium print-to-PDF: heavy and slow on a server. pdfkit: imperative layout code, harder
to keep to the pattern's hierarchy.

## Consequences
Tests read the PDF's text back with pdfjs (`src/server/files/pdf-text.ts`).
