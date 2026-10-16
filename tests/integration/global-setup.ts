import postgres from "postgres";
import { runMigrations } from "../../src/server/db/migrate";

const PORT = process.env.SHIFTBOOK_PG_PORT ?? "54329";
const HOST = `127.0.0.1:${PORT}`;
/** Another checkout (a worktree) can run its own copy side by side: SHIFTBOOK_TEST_DB=shiftbook_test_c. */
const TEST_DB = process.env.SHIFTBOOK_TEST_DB ?? "shiftbook_test";
if (!/^shiftbook_test[a-z0-9_]{0,20}$/.test(TEST_DB)) throw new Error(`SHIFTBOOK_TEST_DB must start with shiftbook_test (got "${TEST_DB}")`);

/** Rebuilds the integration-test database from scratch, then applies every migration. */
export default async function setup() {
  const admin = postgres(`postgres://postgres@${HOST}/postgres`, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${TEST_DB} OWNER shiftbook_owner`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  await runMigrations(`postgres://shiftbook_owner@${HOST}/${TEST_DB}`);
  process.env.TEST_APP_URL = `postgres://shiftbook_app@${HOST}/${TEST_DB}`;
  process.env.TEST_OWNER_URL = `postgres://shiftbook_owner@${HOST}/${TEST_DB}`;
}
