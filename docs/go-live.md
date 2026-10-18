# Going live — every step, in order (about 2 hours, about $10–20 a month)

You never type code. Do the parts in order; each ends with how to check it worked. Keys and passwords
go only into Railway's **Variables** page — never into a chat, an email or a document. Company
websites move their buttons sometimes: if a button is named slightly differently, pick the closest
match. Prices are as published in October 2026; check each company's pricing page when you sign up.

## What you will have at the end

- `demo.yourname.com` — the public demo anyone can click through (for cold calls and your YC
  application).
- `app.yourname.com` — the real Granite, where agencies create an account and pay you monthly.
- `yourname.com/tools/il-720-hours` style link — the free 720-hour checker (it lives inside the demo,
  at `demo.yourname.com/en/tools/il-720-hours`).
- Email that comes from your own domain, text messages for the worker app, and card payments.

## What it costs

| What | Company | Cost |
|---|---|---|
| Hosting (demo + real app, each with a database and a disk) | Railway, Hobby plan | $5/month, which includes $5 of use; two small copies usually come to about $10–20/month in total |
| Your domain (for example `granitepay.com`) | Cloudflare | about $10–11 a year for a `.com`, at cost, no markup |
| Email | Resend | free up to about 3,000 emails a month |
| Text messages to workers | Twilio | about $2 a month for a toll-free number, plus about 1 cent per text |
| Card payments from agencies | Stripe | nothing monthly; Stripe takes a small percentage of each payment |
| Reading photographed timesheets (optional) | Anthropic | pay as you go, starting at $5 of credit |

Free alternative: none that is safe. Free hosting tiers either delete the database or have no disk,
and Granite must keep uploaded files and the key that locks Social Security numbers. Railway at about
$5–20 a month is the cheapest reliable option, and it is what Granite is built for (decision 0035).

---

## Part 1 — Buy your domain (15 minutes, about $10/year)

1. Go to **dash.cloudflare.com/sign-up** and create a free account with your email.
2. In the left menu click **Domain Registration**, then **Register Domains**.
3. Type the name you want (for example `granitepay`) and press search. Pick one that ends in `.com` and
   says **Available**. Click **Purchase**, enter your card and your contact details, and finish.
   (Cloudflare charges what the registry charges, about $10–11 a year for a `.com`.)
4. **Check:** in the left menu, **Websites** (or **Domains**) now lists your domain with the status
   **Active** (it can take up to 15 minutes).

Keep this tab open: later parts ask you to add "DNS records" here. To add one: click your domain,
then **DNS**, then **Records**, then **Add record**. Always set **Proxy status** to **DNS only** (the
grey cloud, not the orange one) for the records in this guide — Railway and Resend need to see the
real address.

## Part 2 — Put the demo online (20 minutes)

1. Go to **railway.com**, click **Login**, then **Continue with GitHub**. Use the GitHub account that
   holds the `shiftbook` code. When it asks for a plan, choose **Hobby** ($5/month) and add your card.
2. Click **New Project**, then **Deploy from GitHub repo**. If it asks, click **Configure GitHub App**
   and allow the `shiftbook` repository. Pick **shiftbook**. A box called **shiftbook** appears.
   Let it try to build; it will fail until step 7 is done, which is expected.
3. **Use the newest code.** Click the **shiftbook** box, open **Settings**, find **Source** (or
   **Branch**), and choose the branch **`claude/cool-hypatia-37j6gk`** — it holds everything built so
   far. (Later, when you tidy up GitHub, you can merge it into your main branch and switch back.)
4. **Database:** click **+ Create** (top right; may say **+ New**), then **Database**, then
   **PostgreSQL**. A box called **Postgres** appears.
5. **Disk for files:** press **Ctrl+K** (or **⌘K** on a Mac), type `volume`, choose **Volume**, pick
   the **shiftbook** box, and type `/data` as the mount path.
6. **Your address:** click the **shiftbook** box, **Settings**, **Networking**, **Custom Domain**, and
   type `demo.yourname.com` (your domain). If it asks for a port, type `3000`. Railway shows one or two
   records (a **CNAME** and maybe a **TXT**). In Cloudflare, add each one exactly as shown: **Type**,
   **Name** (`demo`, or what Railway shows) and **Target/Content**, with **DNS only**. Back in Railway,
   wait until the domain shows a green tick (a few minutes; up to an hour).
7. **Settings for the app:** in the **shiftbook** box open **Variables**, click **Raw Editor**, paste
   these four lines, and click **Update Variables**:

   ```
   DATABASE_ADMIN_URL=${{Postgres.DATABASE_URL}}
   SHIFTBOOK_MODE=demo
   PORT=3000
   SHIFTBOOK_APP_URL=https://demo.yourname.com
   ```

   (Write your real domain in the last line.) Then click **Deploy** at the top.
8. **Check:** after about 10 minutes the box shows a green tick. Open `https://demo.yourname.com`. You
   see **Sign in to Granite** with the demo people; click **Continue as Demo Owner** and look around.
   Then open `https://demo.yourname.com/en/tools/il-720-hours` — that is the free checker to send to
   agencies.

## Part 3 — Put the real app online (20 minutes)

Do Part 2 again in a **new Railway project** (click your project name at the top left, then **New
Project**), with three differences:

- In step 6, the address is `app.yourname.com` (Cloudflare record name `app`).
- In step 7, the second line is `SHIFTBOOK_MODE=live` (exactly `live`, small letters) and the last line
  is `SHIFTBOOK_APP_URL=https://app.yourname.com`.
- Add the address **before** inviting anyone: passkeys stay tied to the address they were made on.

**Check:** `https://app.yourname.com` shows **Sign in to Granite** with **New to Granite? Create an
agency** and no demo people. (You cannot create an agency until Part 4 is done, because it emails a
link.)

## Part 4 — Email from your domain (20 minutes, free)

1. Go to **resend.com**, sign up, and confirm your email.
2. Open **Domains**, click **Add Domain**, type `yourname.com`, and choose the region nearest you
   (US East). Resend shows three or four records (**MX**, **TXT** for SPF, **TXT** for DKIM, maybe a
   **TXT** for DMARC).
3. In Cloudflare, add each record exactly as Resend shows it (Type, Name, Content; for the MX record
   also the **Priority** number), all **DNS only**.
4. Back in Resend, click **Verify DNS Records**. Wait until every record says **Verified** (minutes, up
   to a few hours).
5. In Resend open **API Keys**, click **Create API Key**, name it `granite`, permission **Full access**
   (needed for timesheets by email later; **Sending access** is enough otherwise), and click **Add**.
   Copy the key now — Resend shows it once.
6. In Railway, open the **real** project's **shiftbook** box, **Variables**, **New Variable**:
   - Name `RESEND_API_KEY`, value: the key you copied.
   - Name `MAIL_FROM`, value: `Granite <hello@yourname.com>`.
   Click **Deploy**.
7. **Check:** open `https://app.yourname.com`, click **New to Granite? Create an agency**, and sign up
   with your own email. The email arrives from your domain. Open its link, choose a password, set up
   an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password),
   and you are in as the Owner of your own test agency.

## Part 5 — Take payments (30 minutes, free until you're paid)

Agencies pay you monthly by card on Stripe's own pages; Granite never sees a card.

1. Go to **dashboard.stripe.com/register**, sign up, and complete **Activate payments** (business
   type — "Individual / sole proprietor" is fine until you incorporate; your bank account for payouts).
2. Try it with play money first: switch on **Test mode** (top right). Do steps 3–7 in test mode, then
   repeat them with test mode off when you're ready to charge.
3. **The price:** **Product catalog** → **Add product** → name `Granite monthly` → **Recurring**,
   **Monthly**, your amount → **Save**. Open the product; under **Pricing**, copy the ID that starts
   with `price_`.
4. **The secret key:** **Developers** (bottom left) → **API keys** → **Secret key** → **Reveal** →
   copy (starts with `sk_test_` in test mode, `sk_live_` for real).
5. **The webhook:** **Developers** → **Webhooks** → **Add destination** → **Your account** → choose
   these six events: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`,
   `customer.subscription.resumed` → **Webhook endpoint** → URL
   `https://app.yourname.com/api/billing/webhook` → **Create**. On its page, **Signing secret** →
   **Reveal** → copy (starts with `whsec_`).
6. **The customer billing page:** **Settings** (gear) → **Billing** → **Customer portal** →
   **Activate**; allow updating the payment method, viewing invoices and canceling.
7. In Railway (real project, **shiftbook** box, **Variables**), add:
   - `STRIPE_PRICE_ID` = the `price_…` ID
   - `STRIPE_SECRET_KEY` = the `sk_…` key
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_…` secret
   - `STRIPE_TRIAL_DAYS` = `14` (free days for a new agency; optional)

   Click **Deploy**.
8. **Check:** in your test agency open **Settings › Billing**, click **Start subscription**, and pay
   with Stripe's test card `4242 4242 4242 4242`, any future date, any 3 digits. Billing then says
   **Active**.

## Part 6 — Text messages for the worker app (30 minutes plus a few days' approval, about $2/month)

Workers sign in to the worker app with a code texted to their phone. US carriers only deliver
business texts from a registered number; a **toll-free number** is the simplest to register.

1. Go to **twilio.com/try-twilio**, sign up, and verify your email and phone. Upgrade the account
   (add a card) — trial accounts can only text your own phone.
2. **Phone Numbers** → **Manage** → **Buy a number** → set **Number type** to **Toll-free** → pick one
   → **Buy** (about $2/month).
3. **Messaging** → **Regulatory Compliance** (or **Toll-free verification**) → **Create** → fill in
   your business, the use case "Account notifications / one-time passcodes", an example message such
   as `Your Granite sign-in code is 123456`, and how workers agree (the agency adds their mobile number
   with their consent when they are hired). Submit. Approval usually takes a few business days; texts
   may be blocked until it is approved.
4. On the Twilio console's first page, copy the **Account SID** and **Auth Token**.
5. In Railway (real project, **shiftbook** box, **Variables**), add:
   - `TWILIO_ACCOUNT_SID` = the Account SID
   - `TWILIO_AUTH_TOKEN` = the Auth Token
   - `TWILIO_FROM` = your toll-free number written like `+18885550100`

   Click **Deploy**.
6. **Check:** in your test agency, add yourself as a worker with your mobile number, then open
   `https://app.yourname.com/en/w` on your phone and ask for a code. It arrives by text.

## Part 7 — Reading photos of timesheets (10 minutes, pay as you go; optional)

Spreadsheets, time-clock files and VMS exports work without this. Photos and PDFs of paper timesheets
need it.

1. Go to **console.anthropic.com**, sign up, open **Billing**, and add $5 of credit.
2. **API Keys** → **Create Key** → name `granite` → copy it.
3. In Railway (real project), add `ANTHROPIC_API_KEY` with it, and click **Deploy**.

## Part 8 — Timesheets by email (20 minutes, free; optional)

Each agency gets its own address to forward timesheets to.

1. In Resend, **Domains** → **Add Domain** → `in.yourname.com` → turn on **Receiving** for it, and add
   the records it shows in Cloudflare (DNS only). Wait for **Verified**.
2. Resend → **Webhooks** → **Add Webhook** → URL `https://app.yourname.com/api/inbound/email` → event
   **email.received** → **Add**. Open it and copy the **Signing secret**.
3. In Railway (real project), add `INBOUND_EMAIL_DOMAIN` = `in.yourname.com` and
   `INBOUND_EMAIL_SECRET` = the signing secret. Click **Deploy**.
4. **Check:** Settings › Connections in your test agency shows its forwarding address; email a
   timesheet photo to it, and it appears in Convert timesheets.

## Part 9 — Safety (10 minutes)

1. In Railway, open the real project's **Postgres** box → **Backups** → turn on scheduled backups.
   Do the same in the **shiftbook** box's **Backups** tab: its disk holds uploaded files and the key
   that locks Social Security numbers. **Never delete that disk.**
2. Reminders (client approvals, notifications, collection reminders) need nothing: Granite sends them
   itself every 15 minutes.
3. Before any real payroll or real Social Security numbers: the people in Part 3 of
   `docs/launch-guide.md` — an employment lawyer reads `docs/legal-review-brief.md`, a security firm
   tests the live app, and you get terms of service and a privacy policy.

## Optional — your bare domain

To send `yourname.com` (no `app.`) to the demo: in Cloudflare, click your domain → **Rules** →
**Redirect Rules** → **Create rule** → **Static** redirect from `yourname.com` (and `www.yourname.com`)
to `https://demo.yourname.com`, status `301`. (Cloudflare needs a proxied, orange-cloud record for the
bare name for this; add an `A` record `@` → `192.0.2.1` with **Proxied** on, as Cloudflare's own
redirect guide shows.)

## If something goes wrong

In Railway, open the **shiftbook** box → **Deployments** → the newest one → **View logs**. A line
starting `[granite]` says what the app did; one that says `could not start:` says what to fix in plain
words. Copy that one line to Claude — it never contains a password or a key.
