/**
 * Creates the demo agency row (schema owner) if missing, then loads its data through the same
 * agency-fenced path the app uses.   pnpm db:seed-demo
 */
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/server/db/client";
import { agencies } from "../src/server/db/schema";
import { DEMO_AGENCY } from "../src/server/demo/dataset";
import { clearDemoAgency, seedDemoAgency } from "../src/server/demo/seed";
import { env } from "../src/server/env";

async function main() {
  const owner = createDatabase(env.databaseOwnerUrl, { max: 1 });
  const app = createDatabase(env.databaseUrl, { max: 1 });
  try {
    const existing = await owner.db.select().from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
    if (existing.length === 0) {
      await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
    }
    await app.withAgency(DEMO_AGENCY.id, async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    console.log(`demo agency ready: ${DEMO_AGENCY.name}`);
  } finally {
    await owner.close();
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
