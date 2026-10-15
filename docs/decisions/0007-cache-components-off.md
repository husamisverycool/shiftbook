# 0007 — Next.js Cache Components off

Status: accepted
Date: 2026-10-15

## Context
Next.js 16 offers Cache Components (partial prerendering with cached segments).

## Decision
`cacheComponents: false`. Every Shiftbook page shows live, per-agency data, and cached segments
would need loading placeholders for which we have no design reference.

## Alternatives considered
Turning it on and marking every page dynamic: adds complexity for no gain in slice (a).

## Consequences
Pages render per request. Revisit if a later screen benefits from caching.
