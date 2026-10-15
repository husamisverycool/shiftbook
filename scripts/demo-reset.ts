/** Resets the demo agency from the command line (same code as the banner's Reset).   pnpm demo:reset */
import { createDatabase } from "../src/server/db/client";
import { DEMO_AGENCY, DEMO_OWNER } from "../src/server/demo/dataset";
import { resetDemo } from "../src/server/demo/reset";
import { env } from "../src/server/env";
import { LocalDocumentStore } from "../src/server/storage";

async function main() {
  const app = createDatabase(env.databaseUrl, { max: 1 });
  try {
    await resetDemo(
      { withAgency: app.withAgency, store: new LocalDocumentStore(env.storageDir) },
      { agencyId: DEMO_AGENCY.id, userId: DEMO_OWNER.id, label: "demo reset script", role: "owner" },
    );
    console.log("demo reset");
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
