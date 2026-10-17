# Settings for hosting Granite

These go in the hosting service's environment settings — never in the code, never in chat.

## The one-step start (decision 0035)

The `Dockerfile` runs `scripts/hosted-start.ts` (also `pnpm start:hosted`), which makes the database accounts, applies migrations,
loads the demo when needed, keeps uploads and the encryption key on the volume, sends approval
reminders and starts the app on the host's `PORT`. Step-by-step for Railway: `docs/launch-guide.md`.

| Setting | What it is |
|---|---|
| `DATABASE_ADMIN_URL` | A Postgres superuser's connection (on Railway: `${{Postgres.DATABASE_URL}}`). Used at start only, to make `shiftbook_owner`, `shiftbook_app` and the `granite` database; the app never sees it. Not needed when `DATABASE_URL` and `DATABASE_OWNER_URL` are both set. |
| `PORT` | The port the app listens on (the host sets it; 3000 otherwise). |
| `RAILWAY_VOLUME_MOUNT_PATH` | Set by Railway when a volume is attached: uploads go to `<volume>/storage` and a made key to `<volume>/keys`. Live mode will not start without a volume or `SHIFTBOOK_STORAGE_DIR`. |
| `RAILWAY_PUBLIC_DOMAIN` | Set by Railway once a domain is generated: the app's address when `SHIFTBOOK_APP_URL` is not set. |

With the one-step start, `SHIFTBOOK_ENCRYPTION_KEY` and `CRON_SECRET` below are optional. When the key
is unset, it is made on the very first live start and kept on the volume; the database keeps a check
of it (an HMAC, table `host_key_check`), and every later start refuses to run if the key it finds does
not match, if the setting and the volume's key differ, or if the key is gone. Back the volume up, or
copy the key into this setting and keep a copy elsewhere. When `CRON_SECRET` is unset, reminders run
inside the app every 15 minutes. If `SHIFTBOOK_STORAGE_DIR` is set while a volume is attached, it must
be on the volume. The app itself is started without `DATABASE_OWNER_URL` or `DATABASE_ADMIN_URL`.

## Always

| Setting | What it is |
|---|---|
| `DATABASE_URL` | The app's database connection (the limited `shiftbook_app` user — never an administrator: the one-step start refuses an account that is a superuser or bypasses row-level security). Made by the one-step start from `DATABASE_ADMIN_URL`. |
| `DATABASE_OWNER_URL` | The database owner's connection, used only to set up tables (`pnpm db:migrate`). Made by the one-step start from `DATABASE_ADMIN_URL`. |
| `SHIFTBOOK_MODE` | Exactly `demo` or `live` (the one-step start refuses anything else, and refuses `demo` on a database that holds a real agency). `demo` for the public demo (fictional agency, "Continue as" buttons, no emails sent), `live` for real agencies. A built app is a demo **only** when this says `demo`. |

## Live mode (real agencies)

| Setting | What it is |
|---|---|
| `SHIFTBOOK_APP_URL` | The address people open, e.g. `https://app.example.com` (links in emails are built from it). |
| `SHIFTBOOK_ENCRYPTION_KEY` | 32 random bytes written in base64. It protects authenticator secrets and, from slice (k) step 2, Social Security numbers. Keep a copy with the database backups' secrets: losing it loses those. Never put it in the database. |
| `RESEND_API_KEY`, `MAIL_FROM` | Sending email (client approvals, invites, password resets). |
| `CRON_SECRET` | The scheduled approval-reminder call answers only to this. |
| `SHIFTBOOK_TRUSTED_PROXY_HOPS` | How many proxies in front of the app add to `X-Forwarded-For` (usually 1; set `0` when nothing stands in front of the app, or visitors could make up their own address). Used to know each visitor's address (sign-in throttling, approval evidence). |
| `ANTHROPIC_API_KEY` | Reading photographed timesheets (optional; files and spreadsheets work without it). |
| `SHIFTBOOK_STORAGE_DIR` | Where uploaded files are kept, if not the default. |
| `SHIFTBOOK_GOOGLE_CLIENT_ID`, `SHIFTBOOK_GOOGLE_CLIENT_SECRET` | "Continue with Google" (optional; decision 0033). From a Google Cloud OAuth client of type "Web application" whose authorized redirect URI is `<SHIFTBOOK_APP_URL>/api/auth/oidc/google/callback`. The button appears once both are set. |
| `SHIFTBOOK_MICROSOFT_CLIENT_ID`, `SHIFTBOOK_MICROSOFT_CLIENT_SECRET` | "Continue with Microsoft" (optional; decision 0033). From a Microsoft Entra app registration for "accounts in any organizational directory and personal Microsoft accounts", web redirect URI `<SHIFTBOOK_APP_URL>/api/auth/oidc/microsoft/callback`, with the optional ID-token claims `email` and `xms_edov` added (without `xms_edov`, people connect Microsoft from Your account before signing in with it). |

An agency's own single sign-on needs no setting here: its Owner enters the provider's details in
Settings › Single sign-on and registers `<SHIFTBOOK_APP_URL>/api/auth/oidc/sso/callback` with it (the
issuer must be a public https name whose endpoints are on the same host; an agency on Entra ID adds the
optional ID-token claims `email` and `xms_edov` to its app registration). In demo mode none of these
are used: Google, Microsoft and SSO go through the demo's stand-in, inside the app, with no network
call at all.

## The first agency and its Owner

With the settings above in place and `SHIFTBOOK_MODE=live`:

```
pnpm db:migrate
pnpm tsx scripts/create-agency.ts --name "Agency name" --owner-name "Owner name" --owner-email owner@agency.example
```

It prints the Owner's invite link once (it works for 10 days). The Owner opens it, chooses a
password, sets up an authenticator app, and invites everyone else from Settings › Members.
