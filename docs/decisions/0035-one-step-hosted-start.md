# 0035 — One-step hosted start

Status: accepted
Date: 2026-10-17

## Context
The owner deploys, and is not technical (CLAUDE.md). Until now a host needed someone to make two
database accounts by hand (`shiftbook_owner` with BYPASSRLS, `shiftbook_app` without), a database,
the pgcrypto extension, a 32-byte encryption key, a reminder schedule and a migration step, and the
app could only listen on port 3000. Uploaded files live on local disk (decision 0002), so a host
that throws its disk away at each deploy would lose them.

The first host is Railway (its own documentation, read 2026-10-17): one Dockerfile at the
repository root is built and run as is; its Postgres service hands out an administrator connection
that other services can reference (`${{Postgres.DATABASE_URL}}`); a volume attached to a service is
mounted when it starts and named in `RAILWAY_VOLUME_MOUNT_PATH`; a generated domain is named in
`RAILWAY_PUBLIC_DOMAIN`; build-time variables reach the build only when the Dockerfile asks for them
with `ARG`, and ours asks for none. Railway's settings UI has no random-secret generator, and its
configuration-as-code file is on its way out, so nothing here depends on either.

## Decision
`Dockerfile` installs, builds and runs `scripts/hosted-start.ts` (also `pnpm start:hosted`), which does,
at every start, in order:

1. **Database accounts** from `DATABASE_ADMIN_URL` (must be a superuser: only one may grant
   BYPASSRLS). It makes or updates `shiftbook_owner` (BYPASSRLS) and `shiftbook_app` (NOBYPASSRLS),
   makes the database `granite` owned by the first if missing, and adds pgcrypto. Each account's
   password is HKDF-SHA256 of the administrator's connection with the account's name, so it is the
   same at every start, is never stored, and changes when the administrator's password does. The
   app gets `DATABASE_URL` and `DATABASE_OWNER_URL` built from them, and the administrator's
   connection is removed from its environment. When both URLs are given, they are used as they are.
2. **Files** in `SHIFTBOOK_STORAGE_DIR`, else `<volume>/storage`. Live mode will not start with
   neither: uploads would vanish at the next deploy.
3. **The encryption key**: `SHIFTBOOK_ENCRYPTION_KEY` when set; otherwise, in live mode, a key made
   once and kept at `<volume>/keys/encryption-key` (mode 0600, written with "fail if it exists"),
   outside the folder any storage key can name. The database (another service) never holds it.
4. **The address**: `SHIFTBOOK_APP_URL`, else `https://$RAILWAY_PUBLIC_DOMAIN`.
5. **Migrations**, then the demo agency in demo mode when it (or its Owner) is missing; an existing
   demo is left as visitors left it (the banner's Reset still clears it).
6. **Reminders**: with no `CRON_SECRET`, a secret is made for this start and the process calls
   `/api/approvals/reminders` on itself every 15 minutes, so no outside scheduler is needed.
7. **The app**: `next start` on `$PORT` (3000 when unset), signals passed through.

`docs/launch-guide.md` walks the owner through Railway click by click; `docs/hosting-settings.md`
lists every setting.

## Alternatives considered
- **A random password per start** (`ALTER ROLE` each time): a deploy's old copy, still running for
  a moment, could not open new connections. Derived passwords avoid that and still never touch
  disk.
- **Connecting as the administrator**: SECURITY DEFINER functions would run as a superuser, and the
  app would see past row-level security. Two accounts keep the fence decision 0001 set up.
- **Asking the owner to make and paste a 32-byte key**: one more place to go wrong for a
  non-technical owner, and Railway cannot generate one. A key on the volume is the safer default
  for them; anyone technical can still set `SHIFTBOOK_ENCRYPTION_KEY` instead (it then wins).
- **Railway's cron service for reminders**: a second service and a shared secret for the owner to
  set up. The in-process timer does the same with nothing to configure.
- **Object storage for files**: the right answer at scale (decision 0002 names the adapter); a
  single volume is enough for the first agencies and needs no keys.

## Consequences
- A first deploy is: add Postgres, add the repository, attach a volume, add one variable,
  generate a domain.
- The volume holds the encryption key: losing the volume loses every sealed value (authenticator
  secrets, Social Security numbers). Railway's volume backups, or moving the key into
  `SHIFTBOOK_ENCRYPTION_KEY` with a copy kept elsewhere, protect against that; the launch guide
  says so in plain words.
- One copy of the app at a time (a Railway volume allows no replicas); the reminder timer relies
  on that, and the reminder route sends each reminder once however often it is called.
- Another host needs either a superuser connection or the two URLs set by hand, and either a
  volume or `SHIFTBOOK_STORAGE_DIR` on lasting disk.
