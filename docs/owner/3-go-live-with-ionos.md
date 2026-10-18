# Putting all of Granite online, with an IONOS domain

You'll click and paste. You never type code. Keys and passwords go only into Railway's **Variables**
page, never into a chat, an email or a document. If a button has a slightly different name, pick the
closest match.

In this guide, **`yourname.com`** stands for the domain you buy. Wherever you see it, type your real
domain instead.

---

## What will be online when you finish

| Address | What it is | Who uses it |
|---|---|---|
| `demo.yourname.com` | The demo: a complete made-up agency, no sign-up, "Continue as Owner" buttons | Prospects clicking around on their own, and you in sales calls |
| `app.yourname.com` | The real Granite. Agencies sign up, pay monthly and run real payroll | Paying agencies and their staff |
| `app.yourname.com/en/w` | The worker app, on workers' phones (sign-in by text) | Temp workers |
| client links (sent by Granite) | The client portal and the "approve hours" pages | The agencies' clients |
| `app.yourname.com/en/tools/il-720-hours` | The free Illinois 720-hour checker (no account) | Anyone; good to send in cold emails |
| `timesheets+…@in.yourname.com` | Each agency's own address for forwarding timesheets | Agencies and their clients |
| `yourname.com` | Sends visitors on to the demo | Anyone who types the bare name |

**Should the demo be online? Yes.** You're right that it works best when someone drives it
themselves. The demo is built for exactly that: there's no sign-up, it's already full of realistic
data, and it never sends a real email or text. Use it yourself on calls, and send the link so
prospects can click around alone. Keep your real agencies on `app.`, never on the demo. The demo
costs about $5 more a month.

## What it costs

| What | Company | Cost |
|---|---|---|
| Domain | IONOS | the first year is often $1–10; after that about $15–25 a year for a `.com` (check the **renewal** price at checkout) |
| Hosting: demo plus the real app | Railway (Hobby plan) | about $10–20 a month in total |
| Email | Resend | free up to about 3,000 emails a month |
| Texts to workers | Twilio | about $2 a month plus about 1¢ per text |
| Card payments | Stripe | nothing monthly; a small percentage of each payment |
| Reading photos of timesheets | Anthropic | pay as you go; start with $5 |

**Time:** about 2–3 hours of clicking, plus waiting. The text-message approval (Step 9) takes a few
business days, so start it early.

---

## Step 0. How to add a "DNS record" at IONOS (you'll do this about 10 times)

Several companies will say "add this record to your DNS". Each time, do this:

1. Go to **ionos.com** and log in (top right).
2. Click **Menu**, then **Domains & SSL**.
3. Click your domain name, then open the **DNS** tab.
4. Click **+ Add record** and choose the **type** the other company told you: **CNAME**, **TXT** or
   **MX**.
5. Fill it in:
   - **Host name:** type only the part **before** your domain. If the other company says
     `demo.yourname.com`, type `demo`. If it says `resend._domainkey.yourname.com`, type
     `resend._domainkey`. If it says `@` or your bare domain, type `@`. IONOS adds `.yourname.com`
     itself.
   - **Points to / Value:** paste exactly what the other company shows. For TXT records, don't add
     quotation marks, and remove them if they're in what you copied.
   - **Priority** (MX records only): the number the other company shows.
   - **TTL:** leave it as it is.
6. Click **Save**. If IONOS says a record for that name already exists and asks to replace it, say
   **yes**. This only affects the name you're adding (such as `demo`), not your main domain.
7. If IONOS says the subdomain doesn't exist yet, go back to your domain, open **Subdomains**,
   click **Create subdomain**, type the name (for example `demo`), save, then try again.

New records usually work within minutes, but can take up to a few hours.

---

## Step 1. Buy the domain at IONOS (10 minutes)

1. Go to **ionos.com**, click **Domains**, type the name you chose and search.
2. Pick the **.com** that says available and click **Add to cart** / **Continue**.
3. **Untick every extra:** website builder, email plans, SSL certificate, "domain guard" and other
   endings. You don't need any of them. Railway gives you the padlock (SSL) for free.
4. Make an account, pay and finish.
5. **Check:** under **Menu → Domains & SSL**, your domain appears as **Active**. This can take up to
   15 minutes.

## Step 2. Make your Railway account (5 minutes)

1. Go to **railway.com**, click **Login**, then **Continue with GitHub**. Use the GitHub account that
   holds the `shiftbook` code.
2. When it asks for a plan, choose **Hobby** and add your card.

## Step 3. Put the demo online (20 minutes, plus about 10 minutes of waiting)

1. In Railway click **New Project**, then **Deploy from GitHub repo**. If it asks, click **Configure
   GitHub App** and allow the `shiftbook` repository. Pick **shiftbook**. A box called **shiftbook**
   appears. It may start building and fail; that's expected until this step is done.
2. **Use the newest code:** click the **shiftbook** box, open **Settings**, find **Source** (or
   **Branch**) and choose **`claude/cool-hypatia-37j6gk`**.
3. **Add the database:** click **+ Create** at the top right (it may say **+ New**), then
   **Database**, then **PostgreSQL**. A **Postgres** box appears.
4. **Add the disk:** press **Ctrl+K** (or **⌘K** on a Mac), type `volume`, choose **Volume**, pick the
   **shiftbook** box and type `/data` as the mount path.
5. **Add the address:**
   1. Click the **shiftbook** box, then **Settings**, **Networking**, **Custom Domain**.
   2. Type `demo.yourname.com`. If it asks for a port, type `3000`.
   3. Railway shows a **CNAME** record, and maybe a **TXT** record too. Add each one at IONOS
      (Step 0). For the CNAME the host name is `demo`; for the TXT, use what Railway shows (for example
      `_railway-verify.demo`).
   4. Wait until Railway shows a green tick next to the domain.
6. **Add the settings:**
   1. In the **shiftbook** box open **Variables**, click **Raw Editor** and paste these four lines,
      changing only the domain in the last line:

      ```
      DATABASE_ADMIN_URL=${{Postgres.DATABASE_URL}}
      SHIFTBOOK_MODE=demo
      PORT=3000
      SHIFTBOOK_APP_URL=https://demo.yourname.com
      ```

   2. Click **Update Variables**, then **Deploy** at the top.
7. **Check:**
   1. After about 10 minutes the box shows a green tick. Open `https://demo.yourname.com`.
   2. You should see **Sign in to Granite** with the demo people. Click **Continue as Demo Owner**.
   3. Try ⌘K, the weekly run and the colour styles in Settings › Account.

## Step 4. Put the real app online (20 minutes, plus waiting)

1. Click your project's name at the top left, then **New Project**, and repeat **all of Step 3**, with
   these differences:
   - In 3.5, the address is **`app.yourname.com`**, so the IONOS host name is `app`.
   - In 3.6, paste these lines instead:

     ```
     DATABASE_ADMIN_URL=${{Postgres.DATABASE_URL}}
     SHIFTBOOK_MODE=live
     PORT=3000
     SHIFTBOOK_APP_URL=https://app.yourname.com
     ```

   - Write `live` exactly like that, in small letters.
2. Do this before inviting anyone: passkeys only work on the address they were made on.
3. **Check:** `https://app.yourname.com` shows **Sign in to Granite** with **New to Granite? Create an
   agency**, and no demo people.

From here on, **every Railway step means the real app's project** (the one with `SHIFTBOOK_MODE=live`).

## Step 5. Email from your domain (20 minutes, free)

1. Go to **resend.com**, sign up and confirm your email.
2. Open **Domains**, click **Add Domain**, type `yourname.com` and choose the region **US East**.
3. Resend shows 3 or 4 records: an **MX** and a **TXT** (both usually for `send`), a **TXT** for
   `resend._domainkey`, and maybe a **TXT** for `_dmarc`. Add each one at IONOS (Step 0). These sit on
   their own names, so they don't disturb any email you already have at IONOS.
4. Back in Resend, click **Verify DNS Records** and wait until every row says **Verified**.
5. Make a key:
   1. In Resend open **API Keys** and click **Create API Key**.
   2. Name it `granite`, set permission to **Full access** and click **Add**.
   3. **Copy it now.** Resend only shows it once.
6. In Railway, open the real app's **shiftbook** box, then **Variables**, then **New Variable**, and
   add two:
   - `RESEND_API_KEY` = the key you copied
   - `MAIL_FROM` = `Granite <hello@yourname.com>`

   Click **Deploy**.
7. **Check:**
   1. Open `https://app.yourname.com` and click **New to Granite? Create an agency**. Sign up with your
      own email. The email arrives from your domain.
   2. Open its link, choose a password and set up an authenticator app on your phone (Google
      Authenticator, Microsoft Authenticator or 1Password).
   3. You're now the Owner of your own agency. Use this agency to test everything below.

## Step 6. Send your bare domain to the demo (5 minutes)

1. At IONOS go to **Menu → Domains & SSL**, then click the **⋯** (or gear) next to your domain and
   choose **Adjust destination** (also called **Forward domain**).
2. Choose **Forwarding** (or **HTTP redirect**), type `https://demo.yourname.com`, choose
   **301 / permanent**, and save.
3. If IONOS asks about `www`, do the same for it.
4. **Check:** typing `yourname.com` lands on the demo.

## Step 7. Take payments with Stripe (30 minutes)

1. Go to **dashboard.stripe.com/register**, sign up and finish **Activate payments**. "Individual /
   sole proprietor" is fine until you form a company; you'll also enter your bank account for payouts.
2. **Try it with play money first:** switch on **Test mode** (top right) and do steps 3–7. Then do
   them all again with test mode off when you're ready to charge for real.
3. **Your price:**
   1. Go to **Product catalog** → **Add product**, name it `Granite monthly`, choose **Recurring** and
      **Monthly**, type your price and click **Save**.
   2. Open the product and copy the ID that starts with **`price_`**.
4. **Your secret key:** go to **Developers** (bottom left) → **API keys** → **Secret key** → **Reveal**
   and copy it. It starts with `sk_test_` in test mode and `sk_live_` for real.
5. **The webhook:**
   1. Go to **Developers** → **Webhooks** → **Add destination** → **Your account**.
   2. Tick these six events:
      - `checkout.session.completed`
      - `customer.subscription.created`
      - `customer.subscription.updated`
      - `customer.subscription.deleted`
      - `customer.subscription.paused`
      - `customer.subscription.resumed`
   3. Choose **Webhook endpoint**, type `https://app.yourname.com/api/billing/webhook` and click
      **Create**.
   4. On its page, click **Signing secret** → **Reveal** and copy it. It starts with `whsec_`.
6. **Customers' billing page:** go to **Settings** (gear) → **Billing** → **Customer portal** →
   **Activate**. Allow customers to update their card, see invoices and cancel.
7. In Railway, under **Variables**, add these, then click **Deploy**:
   - `STRIPE_PRICE_ID` = the `price_…` ID
   - `STRIPE_SECRET_KEY` = the `sk_…` key
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_…` secret
   - `STRIPE_TRIAL_DAYS` = `14` (free days for new agencies; leave it out for none)
8. **Check:**
   1. In your agency, open **Settings › Billing** and click **Start subscription**.
   2. Pay with the test card `4242 4242 4242 4242`, any future date and any 3 digits.
   3. Billing should say **Active**.

## Step 8. Reading photos of timesheets (10 minutes)

1. Go to **console.anthropic.com** and sign up. Open **Billing** and add $5 of credit.
2. Go to **API Keys** → **Create Key**, name it `granite` and copy it.
3. In Railway, add `ANTHROPIC_API_KEY` = the key, then click **Deploy**.
4. **Check:** in your agency, open **Convert timesheets** and upload a phone photo of a timesheet.
   Its hours appear in the grid.

## Step 9. Text messages for the worker app (30 minutes, then a few days' approval)

Workers sign in to the worker app with a texted code. US phone companies only deliver business texts
from a registered number, and a toll-free number is the easiest kind to register.

1. Go to **twilio.com/try-twilio**, sign up and verify your email and phone. Click **Upgrade** and add
   a card; trial accounts can only text your own phone.
2. **Buy a number:** go to **Phone Numbers** → **Manage** → **Buy a number**, set **Number type** to
   **Toll-free**, pick one and click **Buy** (about $2 a month).
3. **Register it:**
   1. Go to **Messaging** → **Regulatory Compliance** (or **Toll-free verification**) → **Create**.
   2. Fill in your business.
   3. For the use case, choose "Account notifications / one-time passcodes".
   4. For the sample message, use `Your Granite sign-in code is 123456`.
   5. For consent, write: "The staffing agency adds the worker's mobile number with their consent
      when they are hired."
   6. Submit. Approval usually takes a few business days.
4. On the Twilio console's home page, copy the **Account SID** and the **Auth Token**.
5. In Railway, add these, then click **Deploy**:
   - `TWILIO_ACCOUNT_SID` = the Account SID
   - `TWILIO_AUTH_TOKEN` = the Auth Token
   - `TWILIO_FROM` = your toll-free number, written like `+18885550100`
6. **Check (after approval):**
   1. In your agency, add yourself as a worker with your mobile number.
   2. On your phone, open `https://app.yourname.com/en/w` and ask for a code. It arrives by text.

## Step 10. Timesheets by email (20 minutes, free)

1. **Set up the receiving domain:**
   1. In Resend go to **Domains** → **Add Domain**, type `in.yourname.com` and switch on
      **Receiving**.
   2. Add the records it shows at IONOS (Step 0). The host names start with `in`.
   3. Wait for **Verified**.
2. **Add the webhook:**
   1. In Resend go to **Webhooks** → **Add Webhook**.
   2. For the URL, type `https://app.yourname.com/api/inbound/email`.
   3. For the event, choose **email.received**, then click **Add**.
   4. Open the webhook and copy its **Signing secret**.
3. In Railway, add these, then click **Deploy**:
   - `INBOUND_EMAIL_DOMAIN` = `in.yourname.com`
   - `INBOUND_EMAIL_SECRET` = the signing secret
4. **Check:**
   1. In your agency, **Settings › Connections** shows the forwarding address.
   2. Email a timesheet photo to it. It appears in **Convert timesheets**.

## Step 11. "Continue with Google" and "Continue with Microsoft" (optional, 30 minutes)

You can skip this. Password + authenticator app and passkeys already work.

**Google:**
1. **Create the project:** go to **console.cloud.google.com**, sign in, and at the top click the
   project picker → **New project**. Name it `Granite` and click **Create**.
2. **Set up the consent screen:**
   1. Open **APIs & Services** → **OAuth consent screen** and click **Get started**.
   2. Fill in: app name `Granite`, your email, audience **External**.
   3. Save, then click **Publish app**.
3. **Create the sign-in client:**
   1. Go to **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   2. Set **Application type** to **Web application**.
   3. Under **Authorized redirect URIs**, add
      `https://app.yourname.com/api/auth/oidc/google/callback`, then click **Create**.
   4. Copy the **Client ID** and the **Client secret**.
4. In Railway, add these, then click **Deploy**:
   - `SHIFTBOOK_GOOGLE_CLIENT_ID` = the Client ID
   - `SHIFTBOOK_GOOGLE_CLIENT_SECRET` = the Client secret

**Microsoft:**
1. **Register the app:**
   1. Go to **entra.microsoft.com**, sign in, then open **Applications** → **App registrations** →
      **New registration**.
   2. Name it `Granite`.
   3. Under supported account types, choose **Accounts in any organizational directory and personal
      Microsoft accounts**.
   4. Under redirect URI, choose **Web** and type
      `https://app.yourname.com/api/auth/oidc/microsoft/callback`.
   5. Click **Register**.
2. On the **Overview** page, copy the **Application (client) ID**.
3. **Make the secret:** open **Certificates & secrets** → **New client secret** → **Add**, then
   copy the **Value** (not the ID).
4. **Add two claims:** open **Token configuration** → **Add optional claim** → **ID**, tick `email`
   and `xms_edov` and click **Add**. Accept if it asks for a permission.
5. In Railway, add these, then click **Deploy**:
   - `SHIFTBOOK_MICROSOFT_CLIENT_ID` = the client ID
   - `SHIFTBOOK_MICROSOFT_CLIENT_SECRET` = the secret Value

**Check:** the sign-in page now shows both buttons.

## Step 12. Safety (10 minutes, do not skip)

1. **Back up both boxes:**
   1. In Railway, open the real app's **Postgres** box → **Backups** and turn on scheduled backups.
   2. Do the same in its **shiftbook** box's **Backups** tab.
2. **Never delete the real app's disk.** It holds uploaded files and the key that locks Social
   Security numbers. If it were lost, Granite would refuse to start until it's restored from a backup.
   That's on purpose.
3. Reminders and scheduled emails need nothing. Granite sends them itself every 15 minutes.
4. **Before a real agency runs real payroll, line up these people:**
   - an employment lawyer, who reads `docs/legal-review-brief.md` and writes your terms of service
     and privacy policy
   - a security test of `app.yourname.com`
   - one friendly agency running Granite alongside its old way for 2–3 weeks

## Step 13. Final check: everything online

- [ ] `yourname.com` → goes to the demo
- [ ] `demo.yourname.com` → "Continue as Demo Owner" works
- [ ] `app.yourname.com` → you can create an agency, the email arrives, and you can sign in
- [ ] Settings › Billing → Start subscription → Active (test card)
- [ ] Convert timesheets reads a phone photo
- [ ] `app.yourname.com/en/w` texts you a code (after Twilio approval)
- [ ] An emailed timesheet arrives in Convert timesheets
- [ ] `app.yourname.com/en/tools/il-720-hours` opens without signing in
- [ ] A client approval link from a weekly run opens on a phone
- [ ] Backups are switched on

## If something goes wrong

1. In Railway, open the **shiftbook** box → **Deployments** → the newest one → **View logs**.
2. Look for a line starting `[granite]`. A line saying `could not start:` explains what to fix in
   plain words.
3. Copy that one line to Claude. It never contains a password or key.

If an address won't open, re-check the IONOS record: the host name must be only the short part
(such as `app`), and the value must match Railway's exactly.
