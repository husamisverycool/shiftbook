# 0002 — Document storage behind one interface

Status: accepted
Date: 2026-10-15

## Context
SPEC §3: "object storage for documents". Uploads, page images, payroll files and invoice PDFs need
somewhere to live; no bucket exists in development.

## Decision
`DocumentStore` (put / get / removePrefix). Development and demo use `LocalDocumentStore` (a folder,
`.storage/`, ignored by git). Keys always start with the agency id and are validated (no `..`, no
escaping the root). A bucket adapter (S3-compatible) replaces it at deploy time.

## Alternatives considered
Storing files in Postgres: simple, but large blobs bloat backups. Writing a bucket adapter now:
nothing to test it against.

## Consequences
Downloads go through route handlers that look the row up under row-level security first, so a key
is never reachable without the agency's own row.
