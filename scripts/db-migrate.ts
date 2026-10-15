import { runMigrations } from "../src/server/db/migrate";
import { env } from "../src/server/env";

runMigrations(env.databaseOwnerUrl)
  .then(() => console.log("migrations applied"))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
