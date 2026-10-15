# 0001 — Local Postgres for development and tests

Status: accepted
Date: 2026-10-15

## Context
SPEC §3 names Postgres. The cloud container has no managed database, and tenant isolation
(row-level security) must be tested against a real Postgres, not a mock.

## Decision
`scripts/dev-db.sh` runs a private Postgres 16 on 127.0.0.1:54329 (trust auth, local only) with two
roles: `shiftbook_owner` (schema owner, bypasses RLS, used only by migrations and the demo seed)
and `shiftbook_app` (no RLS bypass, used by the app). Tables use FORCE ROW LEVEL SECURITY fenced by
the transaction setting `app.agency_id` (`withAgency`). Integration tests rebuild a separate
`shiftbook_test` database from the migrations on every run.

## Alternatives considered
PGlite / in-memory Postgres: fast, but row-level security and roles differ from the real engine.
SQLite: not Postgres.

## Consequences
Tests prove isolation on the real engine. Hosted environments supply `DATABASE_URL` and
`DATABASE_OWNER_URL`; the owner deploys.
