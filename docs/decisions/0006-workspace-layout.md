# 0006 — pnpm workspace with a pure rules package

Status: accepted
Date: 2026-10-15

## Context
The pay engine must be pure and deterministic (no I/O, no clock) and testable on its own.

## Decision
`packages/rules` (`@shiftbook/rules`) holds the engine, one file per rule with its citation. ESLint
forbids imports from outside the package, `process`, `fetch`, `Date` and `console` there, and
decimal literals, `/` and `Math.round` in money code. The app consumes it as a workspace package.

## Alternatives considered
A folder inside `src/`: nothing would stop app code (database, clock) leaking into the rules.

## Consequences
Golden tests run the package directly; the app maps database rows to its input types.
