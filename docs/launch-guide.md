# Putting Granite online — the owner's guide

Plain steps, one click at a time. You never type code. Keys and passwords go only into Railway's
"Variables" page, never into a chat. Railway is the hosting company we use (decision 0035); its
buttons sometimes move, so if one is named slightly differently, pick the closest match.

## Part 1 — The demo (about 20 minutes, about $5 a month)

1. Go to **railway.com** and click **Login**, then **Continue with GitHub**. Use the GitHub account
   that holds the `shiftbook` code.
2. When Railway asks for a plan, choose **Hobby**.
3. Click **New Project**, then **Deploy from GitHub repo**. If it asks, click **Configure GitHub App**
   and allow the `shiftbook` repository. Then pick **shiftbook**. A box called **shiftbook** appears.
   If it starts building, let it: it cannot finish until steps 4 to 7 are done, and that is expected.
4. Add the database: click **+ Create** at the top right (it may say **+ New**), then **Database**,
   then **PostgreSQL**. A second box called **Postgres** appears.
5. Add the disk for uploaded files: right-click an empty spot of the page (or press **Ctrl+K**, or
   **⌘K** on a Mac, and type `volume`), choose **Volume**, pick the **shiftbook** box, and type
   `/data` as the mount path.
6. Give it a web address: click the **shiftbook** box, open **Settings**, find **Networking**, and
   click **Generate Domain**. If it asks for a port, type `3000`. (Do this before step 7: the app
   reads its address when it starts.)
7. Add the settings: still in the **shiftbook** box, open its **Variables** tab, click **Raw Editor**,
   and paste these three lines exactly as written:

   ```
   DATABASE_ADMIN_URL=${{Postgres.DATABASE_URL}}
   SHIFTBOOK_MODE=demo
   PORT=3000
   ```

   Click **Update Variables**, then the **Deploy** button at the top of the page.
8. Wait about 10 minutes, until the box shows a green tick. Open the address from step 6. You will
   see **Sign in to Granite** with the demo people. Click **Continue as Demo Owner**. That is your
   demo, ready to show anyone.

## Part 2 — The real one, for paying agencies

Keep the demo as it is. Make a second, separate copy for real customers:

1. Do Part 1 again in a **new project**, but in step 7 write `SHIFTBOOK_MODE=live` instead of `demo`
   (exactly `live`, in small letters: anything else stops the start, on purpose).
2. **Email** (needed: invites, client approvals and password resets are emails).
   1. Buy your own web address (a "domain") from a company such as Cloudflare or Namecheap.
   2. Sign up at **resend.com**. Open **Domains**, click **Add Domain**, type your domain, and copy
      the records it shows into your domain company's "DNS" page. Wait until Resend says
      **Verified**.
   3. In Resend open **API Keys**, click **Create API Key**, and copy it.
   4. In Railway, open the live **shiftbook** box, then **Variables**, then **New Variable**. Name:
      `RESEND_API_KEY`, value: paste the key. Add one more: name `MAIL_FROM`, value: an address on
      your domain, for example `hello@yourdomain.com`. Click **Deploy**.
3. **Your own address** (recommended, and do it before inviting anyone: passkeys stay tied to the
   address they were made on). In the live **shiftbook** box open **Settings**, **Networking**,
   **Custom Domain**, type for example `app.yourdomain.com`, and copy the records it shows into your
   domain company's DNS page. Then add the variable `SHIFTBOOK_APP_URL` with the value
   `https://app.yourdomain.com` and click **Deploy**.
4. **Payments** (agencies pay you monthly by card; Stripe's own pages take the card, Granite never
   sees it). Sign up at **stripe.com** and finish its account steps, then in the Stripe dashboard:
   1. Open **Product catalog**, click **Add product**, name it (for example "Granite monthly"),
      choose **Recurring** and **Monthly**, type your price, and save. Open the product and copy the
      price's ID (it starts with `price_`). In Railway, add the variable `STRIPE_PRICE_ID` with it.
   2. Open **Developers**, then **API keys**, click **Reveal** next to **Secret key**, and copy it (it
      starts with `sk_live_`). In Railway, add the variable `STRIPE_SECRET_KEY` with it.
   3. Open **Developers**, then **Webhooks**, and click **Add destination**. Choose these six events:
      `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
      `customer.subscription.deleted`, `customer.subscription.paused`,
      `customer.subscription.resumed`. Choose **Webhook endpoint** and type your address followed by
      `/api/billing/webhook` (for example `https://app.yourdomain.com/api/billing/webhook`). Save,
      then click **Reveal** under **Signing secret** and copy it (it starts with `whsec_`). In Railway,
      add the variable `STRIPE_WEBHOOK_SECRET` with it.
   4. Open **Settings**, then **Billing**, then **Customer portal**, and click **Activate**. Allow
      customers to update their card, see their invoices and cancel.
   5. Optional: in Railway, add `STRIPE_TRIAL_DAYS` with the number of free days a new agency gets,
      for example `14`. Then click **Deploy**.

   To try all of this without real money first, switch on **Test mode** at the top of the Stripe
   dashboard and do the same steps there (the key then starts with `sk_test_`; Stripe's test card is
   4242 4242 4242 4242). Repeat in normal mode when you are ready to charge.
5. **Try it as a customer would.** Open your address, click **New to Granite? Create an agency**,
   and sign up with your own email. Open the emailed link, choose a password, set up the
   authenticator app on your phone, then open **Settings › Billing** and click **Start
   subscription**. Agencies sign themselves up the same way: send them your address.
6. **Reading photos of timesheets** (optional; spreadsheets and time-clock files work without it).
   Sign up at **console.anthropic.com**, open **API Keys**, create one, and add it in Railway as
   `ANTHROPIC_API_KEY`.
7. **Text messages to workers** (needed for the worker app: workers sign in with a code texted to
   them, and hear when their schedule is published). Sign up at **twilio.com**, buy one phone number
   there, and on the Twilio console's first page copy the **Account SID** and **Auth Token**. In
   Railway, add three variables: `TWILIO_ACCOUNT_SID` (the Account SID), `TWILIO_AUTH_TOKEN` (the Auth
   Token) and `TWILIO_FROM` (the number you bought, written like `+13125550100`). Click **Deploy**.
8. **Timesheets by email** (optional: agencies forward timesheets to their own address). A developer
   sets this up in Resend in about half an hour: a receiving domain, and a webhook for "email.received"
   pointed at your app's `/api/inbound/email`. Then add two variables in Railway: `INBOUND_EMAIL_DOMAIN`
   (that receiving domain) and `INBOUND_EMAIL_SECRET` (the webhook's signing secret, which Resend shows
   on the webhook's page). Click **Deploy**. `docs/hosting-settings.md` has the details.
9. **Reminders on a schedule** (client approvals, notifications and collection reminders): nothing to
   do. Granite sends them by itself every 15 minutes. (`CRON_SECRET` exists only for a developer who
   wants an outside scheduler to trigger them instead; see `docs/hosting-settings.md`.)
10. **"Continue with Google" and "Continue with Microsoft"** (optional). These need a developer for
   about an hour; `docs/hosting-settings.md` lists exactly what they set.
11. **Backups.** Open the **Postgres** box and its **Backups** tab, and turn on scheduled backups.
   Then do the same in the live **shiftbook** box's **Backups** tab: its disk holds the uploaded files
   and the key that locks Social Security numbers. Never delete that disk. If it is ever lost, Granite
   will refuse to start (it never quietly makes a new key) until the disk is restored from a backup.

## Part 3 — Before the first real payroll

These are people, not settings. Granite is careful, but it is new:

1. **An employment lawyer** reads the pay rules (overtime, Illinois equal pay, holiday pay) and the
   compliance duties. Give them `docs/legal-review-brief.md`: every rule as built, with the
   questions to answer.
2. **A security firm** tests the live copy (a "penetration test") before real Social Security
   numbers go in.
3. **Terms of service and a privacy policy**, from the same lawyer.
4. **One friendly agency first.** Run its payroll in Granite next to its old way for two or three
   weeks, and compare the totals before switching over.

## If something goes wrong

Open the **shiftbook** box, then **Deployments**, then the newest one, then **View logs**. Lines that
start with `[granite]` say what the app did at start; one that says `could not start:` says what to
fix, in plain words. Copy that one line to Claude. It never contains a password or key.
