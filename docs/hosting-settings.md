# Settings for hosting Tabulado

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
| `CRON_SECRET` | The scheduled calls — client approval reminders, notifications and collection reminders (`/api/notifications/sweep`) — answer only to this. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Text messages to workers (slices t and u): the sign-in code for the worker app, the onboarding link, a changed phone number, a published schedule. From a Twilio account: its Account SID and Auth Token (Twilio console, Account info), and the Twilio phone number texts come from, written like `+13125550100`. Without them, workers cannot sign in to the worker app by text. The demo never texts. |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Timesheets by email (decision 0042). The domain Resend receives mail for (for example `in.youragency.com`, set up under Resend › Domains › Receiving); each agency's address is `timesheets+<token>@` it. The secret is the signing secret of the Resend webhook for the `email.received` event, pointed at `https://<your app>/api/inbound/email` (Resend › Webhooks). Uses `RESEND_API_KEY` to fetch each email's files. Without them the forwarding address shows "not set up" and the webhook takes nothing. The demo receives nothing from outside. |
| `SHIFTBOOK_TRUSTED_PROXY_HOPS` | How many proxies in front of the app add to `X-Forwarded-For` (usually 1; set `0` when nothing stands in front of the app, or visitors could make up their own address). Used to know each visitor's address (sign-in throttling, approval evidence). |
| `ANTHROPIC_API_KEY` | Reading photographed timesheets (optional; files and spreadsheets work without it). |
| `SHIFTBOOK_STORAGE_DIR` | Where uploaded files are kept, if not the default. |
| `SHIFTBOOK_GOOGLE_CLIENT_ID`, `SHIFTBOOK_GOOGLE_CLIENT_SECRET` | "Continue with Google" (optional; decision 0033). From a Google Cloud OAuth client of type "Web application" whose authorized redirect URI is `<SHIFTBOOK_APP_URL>/api/auth/oidc/google/callback`. The button appears once both are set. |
| `SHIFTBOOK_MICROSOFT_CLIENT_ID`, `SHIFTBOOK_MICROSOFT_CLIENT_SECRET` | "Continue with Microsoft" (optional; decision 0033). From a Microsoft Entra app registration for "accounts in any organizational directory and personal Microsoft accounts", web redirect URI `<SHIFTBOOK_APP_URL>/api/auth/oidc/microsoft/callback`, with the optional ID-token claims `email` and `xms_edov` added (without `xms_edov`, people connect Microsoft from Your account before signing in with it). |
| `STRIPE_SECRET_KEY` | Payments (decision 0036): Stripe's secret key, so Tabulado can open Stripe's own checkout and billing pages for an agency. Starts with `sk_live_` (or `sk_test_` while trying it out). Step by step below. Without it, Settings › Billing says payments are not available, and nobody is charged. |
| `STRIPE_WEBHOOK_SECRET` | Payments: the "signing secret" of the address Stripe tells about payments (starts with `whsec_`). Tabulado believes Stripe's messages only when they carry this signature. Step by step below. |
| `STRIPE_PRICE_ID` | Payments: the monthly price agencies pay (starts with `price_`). Step by step below. Only a subscription to this exact price unlocks an agency (a cheaper or free price in the same Stripe account never does). So once agencies subscribe, keep it: if you put a new price here, agencies still on the old one stop counting as paying until they are moved to the new price in Stripe. |
| `STRIPE_TRIAL_DAYS` | Optional: how many days a new agency uses Tabulado free before it must subscribe (a whole number, for example `14`; `0` for none). Left out, new agencies get 30 free days. Agencies that existed before payments were added got 30 free days from the day the update was installed. |

An agency's own single sign-on needs no setting here: its Owner enters the provider's details in
Settings › Single sign-on and registers `<SHIFTBOOK_APP_URL>/api/auth/oidc/sso/callback` with it (the
issuer must be a public https name whose endpoints are on the same host; an agency on Entra ID adds the
optional ID-token claims `email` and `xms_edov` to its app registration). In demo mode none of these
are used: Google, Microsoft and SSO go through the demo's stand-in, inside the app, with no network
call at all.

## Payments with Stripe, step by step

Agencies pay a monthly subscription through Stripe. Tabulado never sees a card: Stripe's own pages take
the card, send the invoices and handle canceling. Do this once, signed in to your Stripe account at
dashboard.stripe.com. (To try it first without real money, switch on **Test mode** at the top of the
Stripe dashboard and do the same steps there; the keys then start with `sk_test_`.)

1. **The price (`STRIPE_PRICE_ID`).** In Stripe, open **Product catalog** and choose **Add product**.
   Name it (for example "Tabulado monthly"), choose **Recurring**, **Monthly**, and type the amount.
   Save. Open the product: under **Pricing**, the price has an ID that starts with `price_`. Copy it
   into the hosting settings as `STRIPE_PRICE_ID`.
2. **The secret key (`STRIPE_SECRET_KEY`).** In Stripe, open **Developers** (bottom left), then
   **API keys**. Next to **Secret key**, choose **Reveal** and copy it (it starts with `sk_live_`). Paste
   it into the hosting settings as `STRIPE_SECRET_KEY`. Never paste it anywhere else — not in an email,
   not in a chat.
3. **The webhook (`STRIPE_WEBHOOK_SECRET`).** In Stripe, open **Developers**, then **Webhooks**, and
   choose **Add destination** (or **Create an event destination**). Choose **Your account**, then these
   events: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`,
   `customer.subscription.resumed`. Choose **Webhook endpoint** and type the address
   `<SHIFTBOOK_APP_URL>/api/billing/webhook` (your app's address followed by `/api/billing/webhook`).
   Save. On the destination's page, under **Signing secret**, choose **Reveal** and copy it (it starts
   with `whsec_`) into the hosting settings as `STRIPE_WEBHOOK_SECRET`.
4. **The billing page for customers.** In Stripe, open **Settings**, then **Billing**, then **Customer
   portal**, and choose **Activate** (or **Save**). Allow customers to update their payment method, see
   their invoices and cancel their subscription. This is the page "Manage billing" opens.
5. **Free days (optional, `STRIPE_TRIAL_DAYS`).** Type the number of free days a new agency gets, for
   example `14`.
6. Restart the app so it reads the new settings. In Settings › Billing, an Owner now sees **Start
   subscription**.

The demo never talks to Stripe: these settings are not used there.

## The first agency and its Owner

With the settings above in place and `SHIFTBOOK_MODE=live`:

```
pnpm db:migrate
pnpm tsx scripts/create-agency.ts --name "Agency name" --owner-name "Owner name" --owner-email owner@agency.example
```

It prints the Owner's invite link once (it works for 10 days). The Owner opens it, chooses a
password, sets up an authenticator app, and invites everyone else from Settings › Members.

Agencies can also create themselves (decision 0036): on the sign-in page, **New to Tabulado? Create an
agency** asks for a work email, a name and the agency's name, emails a link (it needs `RESEND_API_KEY`
and `MAIL_FROM`), and the person sets a password and an authenticator app. Both ways give the agency
the same free days (`STRIPE_TRIAL_DAYS`).
