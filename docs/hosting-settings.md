# Settings for hosting Shiftbook

These go in the hosting service's environment settings — never in the code, never in chat.

## Always

| Setting | What it is |
|---|---|
| `DATABASE_URL` | The app's database connection (the limited `shiftbook_app` user). |
| `DATABASE_OWNER_URL` | The database owner's connection, used only to set up tables (`pnpm db:migrate`). |
| `SHIFTBOOK_MODE` | `demo` for the public demo (fictional agency, "Continue as" buttons, no emails sent), `live` for real agencies. A built app is a demo **only** when this says `demo`. |

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

## The first agency and its Owner

With the settings above in place and `SHIFTBOOK_MODE=live`:

```
pnpm db:migrate
pnpm tsx scripts/create-agency.ts --name "Agency name" --owner-name "Owner name" --owner-email owner@agency.example
```

It prints the Owner's invite link once (it works for 10 days). The Owner opens it, chooses a
password, sets up an authenticator app, and invites everyone else from Settings › Members.
