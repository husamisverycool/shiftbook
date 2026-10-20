# 0047 — Railway redeploys on any change in the repository

Date: 2026-10-20. Status: accepted.

## Context
The hosting service that serves tabulado.com and app.tabulado.com was set up by Railway as the
`@shiftbook/rules` package, so it watched only `packages/rules/**` and skipped every push that changed
the app or the website ("No changes to watched files"). The site stayed on an old design while newer
commits were on the branch.

## Decision
`railway.json` at the repository root sets `build.watchPatterns` to `["**"]`. Railway's
config-as-code overrides the dashboard value, so any change on the connected branch redeploys. Nothing
else about the build or deploy is set in the file; the dashboard keeps those.

## Consequences
Every push redeploys, including documentation-only pushes. That is fine at this size; a narrower list
can come later if build minutes matter.
