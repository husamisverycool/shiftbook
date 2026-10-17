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
   If it starts building, let it: it cannot finish until steps 4 to 6 are done, and that is expected.
4. Add the database: click **+ Create** at the top right (it may say **+ New**), then **Database**,
   then **PostgreSQL**. A second box called **Postgres** appears.
5. Add the disk for uploaded files: right-click an empty spot of the page (or press **Ctrl+K**, or
   **⌘K** on a Mac, and type `volume`), choose **Volume**, pick the **shiftbook** box, and type
   `/data` as the mount path.
6. Add the settings: click the **shiftbook** box, open its **Variables** tab, click **Raw Editor**,
   and paste these three lines exactly as written:

   ```
   DATABASE_ADMIN_URL=${{Postgres.DATABASE_URL}}
   SHIFTBOOK_MODE=demo
   PORT=3000
   ```

   Click **Update Variables**, then the **Deploy** button at the top of the page.
7. Give it a web address: still in the **shiftbook** box, open **Settings**, find **Networking**, and
   click **Generate Domain**. If it asks for a port, type `3000`.
8. Wait about 10 minutes, until the box shows a green tick. Open the address from step 7. You will
   see **Sign in to Granite** with the demo people. Click **Continue as Demo Owner**. That is your
   demo, ready to show anyone.

## Part 2 — The real one, for paying agencies

Keep the demo as it is. Make a second, separate copy for real customers:

1. Do Part 1 again in a **new project**, but in step 6 write `SHIFTBOOK_MODE=live` instead of `demo`.
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
4. **Reading photos of timesheets** (optional; spreadsheets and time-clock files work without it).
   Sign up at **console.anthropic.com**, open **API Keys**, create one, and add it in Railway as
   `ANTHROPIC_API_KEY`.
5. **"Continue with Google" and "Continue with Microsoft"** (optional). These need a developer for
   about an hour; `docs/hosting-settings.md` lists exactly what they set.
6. **Backups.** Open the **Postgres** box and its **Backups** tab, and turn on scheduled backups.
   Never delete the live **shiftbook** box's volume: besides the uploaded files, it holds the key
   that locks Social Security numbers. Losing it means those can never be read again.

## Part 3 — Before the first real payroll

These are people, not settings. Granite is careful, but it is new:

1. **An employment lawyer** reads the pay rules (overtime, Illinois equal pay, holiday pay) and the
   compliance duties. Ask Claude for "a summary of the pay rules for a lawyer".
2. **A security firm** tests the live copy (a "penetration test") before real Social Security
   numbers go in.
3. **Terms of service and a privacy policy**, from the same lawyer.
4. **One friendly agency first.** Run its payroll in Granite next to its old way for two or three
   weeks, and compare the totals before switching over.

## If something goes wrong

Open the **shiftbook** box, then **Deployments**, then the newest one, then **View logs**. Lines that
start with `[granite]` say what the app did at start; one that says `could not start:` says what to
fix, in plain words. Copy that one line to Claude. It never contains a password or key.
