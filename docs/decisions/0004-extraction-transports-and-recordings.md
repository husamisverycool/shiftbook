# 0004 — Extraction transports and recorded readings

Status: accepted
Date: 2026-10-15

## Context
Photos and PDFs are read by Claude (two independent passes). Demo mode must make no outside calls
yet use the same code path as a live agency (SPEC §18).

## Decision
One `ExtractionTransport` interface:
- `AnthropicTransport`: the API (structured output, server-side fallback on a policy decline).
- `RecordedTransport`: replays answers saved in `demo/recordings/<sha256 of the exact request>.json`.
- `RecordingTransport`: wraps the live one and saves answers.

Demo mode uses `RecordedTransport`; a missing recording fails that document at once with a plain
message (never a guess). `scripts/record-demo-extractions.ts` records the sample documents once,
with the key in the environment. Prompts include the sorted client list so request hashes are stable.

## Alternatives considered
Model answers written by hand from the answer key: would show perfect readings the model never
produced. Calling the API in demo mode: breaks "no outside calls".

## Consequences
Until recordings exist, demo photos show "no recorded reading". Recordings must be re-made when a
prompt, the model or the image preparation changes (the hash changes).
