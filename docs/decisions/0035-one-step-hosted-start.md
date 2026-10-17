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

1. **The mode**: `SHIFTBOOK_MODE` must be exactly `demo` or `live`; anything else (unset, `Live`, a
   typo) stops the start. A built app's own default is live (decision 0025), but a guess either way
   on a host is worse than a plain refusal.
2. **Database accounts** from `DATABASE_ADMIN_URL` (must be a superuser: only one may grant
   BYPASSRLS). It makes or updates `shiftbook_owner` (BYPASSRLS) and `shiftbook_app` (NOBYPASSRLS),
   both `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`, makes the database `granite` owned by
   the first if missing (and refuses one owned by anyone else), and adds pgcrypto. Each account's
   password is HKDF-SHA256 of the administrator's connection with the account's name, so it is the
   same at every start, is never stored, and changes when the administrator's password does; the
   statements that carry it run with statement logging off, so an error never writes it to the
   database's log. When both URLs are given, they are used as they are, after checking the app's
   account is neither a superuser nor BYPASSRLS.
3. **Files** in `SHIFTBOOK_STORAGE_DIR`, else `<volume>/storage`; with a volume attached they must
   be on it. Live mode will not start with neither: uploads would vanish at the next deploy.
4. **The address**: `SHIFTBOOK_APP_URL`, else `https://$RAILWAY_PUBLIC_DOMAIN`.
5. **Migrations**, as `shiftbook_owner`.
6. **Demo**: refuses a database that holds a real agency (`is_demo` false), then loads the demo
   agency when it (or its Owner) is missing; an existing demo is left as visitors left it (the
   banner's Reset still clears it). **Live**: the encryption key is `SHIFTBOOK_ENCRYPTION_KEY`, or
   the one at `<volume>/keys/encryption-key`, outside the folder any storage key can name; the start
   refuses when both exist and differ. Only a database with no key check yet may get a new key,
   made once (written whole to a temporary file, flushed, then linked into place, mode 0600). The
   table `host_key_check` (migration 0041; owner only, no grant to the app) keeps an HMAC-SHA256 of
   a fixed label made with the key; a start whose key gives another value, or that finds no key at
   all, refuses to run, so a lost or swapped volume never seals new data with a new key.
7. **Reminders**: with no `CRON_SECRET`, a secret is made for this start and the process calls
   `/api/approvals/reminders` on itself every 15 minutes, so no outside scheduler is needed.
8. **The app**: `next start` on `$PORT` (3000 when unset), signals passed through, and started
   without `DATABASE_OWNER_URL` (it bypasses row-level security, and the app never uses it) or
   `DATABASE_ADMIN_URL`.

Revised the same day, before any deploy, after the second-opinion review: items 1, the account
limits and log setting in 2, the volume rule in 3, the demo refusal and the key check in 6, and the
owner's connection in 8 were added, and the guide now generates the domain before the first deploy
and backs up the app's volume too.

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
  secrets, Social Security numbers), and the app then refuses to start rather than carry on with a
  new key. Railway's volume backups, or moving the key into `SHIFTBOOK_ENCRYPTION_KEY` with a copy
  kept elsewhere, protect against that; the launch guide says so in plain words.
- The image ships its development tools (`tsx` runs the start script) and runs as root, which
  Railway's volumes expect; the start script hands the app no database connection beyond its own.
- One copy of the app at a time (a Railway volume allows no replicas); the reminder timer relies
  on that, and the reminder route sends each reminder once however often it is called.
- Another host needs either a superuser connection or the two URLs set by hand, and either a
  volume or `SHIFTBOOK_STORAGE_DIR` on lasting disk.
