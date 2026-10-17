/**
 * A new agency and its first Owner (decision 0025). The Owner is invited like anyone else; the
 * invite link is printed here once (it is not emailed and not kept), for the person running this to
 * hand over. It works for 10 days.
 *
 *   pnpm tsx scripts/create-agency.ts --name "Agency name" --owner-name "Owner name" --owner-email owner@agency.example [--language es] [--phone "…"] [--email "…"]
 *
 * Needs SHIFTBOOK_MODE=live, DATABASE_URL, DATABASE_OWNER_URL, SHIFTBOOK_ENCRYPTION_KEY and
 * SHIFTBOOK_APP_URL (the address people open). The agency gets STRIPE_TRIAL_DAYS free days, as a
 * signed-up agency does (decision 0036); after them its Owner starts the subscription in Settings › Billing.
 */
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { firstOwnerInvite } from "../src/server/auth/service";
import { billingConfig } from "../src/server/billing/config";
import { createDatabase } from "../src/server/db/client";
import { agencies } from "../src/server/db/schema";
import { env } from "../src/server/env";

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      "owner-name": { type: "string" },
      "owner-email": { type: "string" },
      language: { type: "string", default: "en" },
      phone: { type: "string" },
      email: { type: "string" },
    },
  });
  const name = values.name?.trim();
  if (!name || !values["owner-name"] || !values["owner-email"]) throw new Error('Give --name, --owner-name and --owner-email (see the comment at the top of this file).');
  if (!env.appUrl) throw new Error("SHIFTBOOK_APP_URL is not set: the invite link needs the app's address.");
  // A real agency only in live mode, with the real key (a demo would seal secrets with the demo key).
  if (env.mode !== "live") throw new Error("Set SHIFTBOOK_MODE=live: a real agency is never made in demo mode.");
  if (!process.env.SHIFTBOOK_ENCRYPTION_KEY) throw new Error("SHIFTBOOK_ENCRYPTION_KEY is not set (32 random bytes in base64).");
  const owner = createDatabase(env.databaseOwnerUrl, { max: 1 });
  const app = createDatabase(env.databaseUrl, { max: 1 });
  try {
    const [agency] = await owner.db.insert(agencies).values({ name, phone: values.phone ?? null, email: values.email ?? null, isDemo: false }).returning();
    const { trialDays } = billingConfig();
    const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null;
    const r = await firstOwnerInvite({ db: app.db, mailTransport: () => ({ send: async () => ({ providerId: null }) }) }, agency!.id, { name: values["owner-name"], email: values["owner-email"], locale: values.language ?? "en" }, env.appUrl, { trialEndsAt });
    if (!r.ok) {
      await owner.db.delete(agencies).where(eq(agencies.id, agency!.id));
      throw new Error(`The Owner could not be invited: ${r.error}.`);
    }
    console.log(`Agency created: ${name}`);
    console.log(`Send this invite link to ${values["owner-email"]} (it works once, for 10 days):`);
    console.log(r.link);
  } finally {
    await owner.close();
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
