# 0010 — Background reading through a database job queue

Status: accepted
Date: 2026-10-15

## Context
Uploads must be accepted instantly while photos take seconds to read; no extra queue service.

## Decision
Each upload adds a row to `jobs`; workers claim one with `FOR UPDATE SKIP LOCKED`. The upload action
and the upload page start reading with Next.js `after()` (after the response). A job still "running"
after 10 minutes (a crashed or restarted server) is picked up again. Errors that retrying cannot fix
(no recorded reading, a model refusal) fail the job at once; others retry up to 3 times.

## Alternatives considered
A separate queue service (Redis, SQS): another moving part to host. Reading inside the request: the
upload would wait for every photo.

## Consequences
Reading happens in the web process. A dedicated worker process can call the same
`processQueuedDocuments` later without code changes.
