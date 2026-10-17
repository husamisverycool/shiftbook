/**
 * Starts Granite on a host in one step (decision 0035): the host runs this and nothing else.
 *
 *   pnpm start:hosted
 *
 * 1. Database accounts. Given DATABASE_ADMIN_URL (a Postgres administrator's connection, such as the
 *    one a host's Postgres service hands out), it makes the two accounts the app needs —
 *    shiftbook_owner (owns the tables, runs migrations) and shiftbook_app (what the app connects as;
 *    row-level security fences it to one agency) — and a database owned by the first. Their
 *    passwords are worked out from the administrator's connection, so they stay the same from one
 *    start to the next and are never stored. When DATABASE_URL and DATABASE_OWNER_URL are both set,
 *    they are used as given and no account is made.
 * 2. Files. Uploads go to SHIFTBOOK_STORAGE_DIR, or else to the volume the host mounted
 *    (RAILWAY_VOLUME_MOUNT_PATH). Live mode refuses to start without one: files kept inside the
 *    container would be lost at the next deploy.
 * 3. The encryption key. Live mode uses SHIFTBOOK_ENCRYPTION_KEY when it is set; otherwise it makes
 *    one on the first start and keeps it on the volume, readable by this app only.
 * 4. The app's address. SHIFTBOOK_APP_URL, or else the host's public name (RAILWAY_PUBLIC_DOMAIN).
 * 5. Migrations, then the demo agency when the demo has none yet.
 * 6. Approval reminders. Without CRON_SECRET, this process calls the reminder route itself every 15
 *    minutes with a secret made for this start only, so no scheduler is needed.
 * 7. The app itself, on the host's PORT.
 */
import { spawn } from "node:child_process";
import { hkdfSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

const OWNER = "shiftbook_owner";
const APP = "shiftbook_app";
const DATABASE = "granite";
const REMINDER_EVERY_MS = 15 * 60 * 1000;

function say(line: string): void {
  console.log(`[granite] ${line}`);
}

/** A role's password, worked out from the administrator's connection and the role's name. */
export function rolePassword(adminUrl: string, role: string): string {
  return Buffer.from(hkdfSync("sha256", adminUrl, "granite-database-accounts", role, 32)).toString("hex");
}

/** The administrator's connection with another account and database. */
export function connectionFor(adminUrl: string, user: string, password: string, database: string): string {
  const url = new URL(adminUrl);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

async function prepareDatabase(adminUrl: string): Promise<{ appUrl: string; ownerUrl: string }> {
  const owner = rolePassword(adminUrl, OWNER);
  const app = rolePassword(adminUrl, APP);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const [me] = await admin<{ rolsuper: boolean }[]>`select rolsuper from pg_roles where rolname = current_user`;
    if (!me?.rolsuper) throw new Error("DATABASE_ADMIN_URL must be an administrator (superuser) connection: it makes the app's two database accounts.");
    // Role names are constants; passwords are hex, so neither can break out of the statement.
    const roles = await admin<{ rolname: string }[]>`select rolname from pg_roles where rolname in (${OWNER}, ${APP})`;
    const have = new Set(roles.map((r) => r.rolname));
    await admin.unsafe(`${have.has(OWNER) ? "ALTER" : "CREATE"} ROLE ${OWNER} LOGIN BYPASSRLS PASSWORD '${owner}'`);
    await admin.unsafe(`${have.has(APP) ? "ALTER" : "CREATE"} ROLE ${APP} LOGIN NOBYPASSRLS PASSWORD '${app}'`);
    const [db] = await admin`select 1 from pg_database where datname = ${DATABASE}`;
    if (!db) {
      await admin.unsafe(`CREATE DATABASE ${DATABASE} OWNER ${OWNER}`);
      say(`made the database "${DATABASE}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
  const inDatabase = postgres(connectionFor(adminUrl, new URL(adminUrl).username, decodeURIComponent(new URL(adminUrl).password), DATABASE), { max: 1, onnotice: () => {} });
  try {
    await inDatabase.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  } finally {
    await inDatabase.end({ timeout: 5 });
  }
  return { appUrl: connectionFor(adminUrl, APP, app, DATABASE), ownerUrl: connectionFor(adminUrl, OWNER, owner, DATABASE) };
}

/** The key kept on the volume, in `dir`: made once, then read back at every start. */
export function volumeKey(dir: string): string {
  const file = join(dir, "encryption-key");
  if (existsSync(file)) {
    const key = readFileSync(file, "utf8").trim();
    if (Buffer.from(key, "base64").length !== 32) throw new Error(`${file} does not hold a 32-byte key.`);
    return key;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const key = randomBytes(32).toString("base64");
  // "wx": never overwrite a key another start wrote a moment ago.
  writeFileSync(file, `${key}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  say("made the encryption key and kept it on the volume");
  return key;
}

async function main(): Promise<void> {
  const live = process.env.SHIFTBOOK_MODE === "live";
  process.env.SHIFTBOOK_MODE = live ? "live" : "demo";
  say(`starting in ${live ? "live" : "demo"} mode`);

  // 1. Database accounts.
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!(process.env.DATABASE_URL && process.env.DATABASE_OWNER_URL)) {
    if (!adminUrl) throw new Error("Set DATABASE_ADMIN_URL to the Postgres service's connection (or set both DATABASE_URL and DATABASE_OWNER_URL).");
    const urls = await prepareDatabase(adminUrl);
    process.env.DATABASE_URL = urls.appUrl;
    process.env.DATABASE_OWNER_URL = urls.ownerUrl;
    say("database accounts ready");
  }
  // The app never needs the administrator's connection.
  delete process.env.DATABASE_ADMIN_URL;

  // 2. Files.
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const storageDir = resolve(process.env.SHIFTBOOK_STORAGE_DIR || (volume ? join(volume, "storage") : ".storage"));
  if (live && !process.env.SHIFTBOOK_STORAGE_DIR && !volume) {
    throw new Error("Live mode needs a volume for uploaded files: attach one to this service (or set SHIFTBOOK_STORAGE_DIR to a disk that survives deploys).");
  }
  mkdirSync(storageDir, { recursive: true });
  process.env.SHIFTBOOK_STORAGE_DIR = storageDir;

  // 3. The encryption key.
  if (live && !process.env.SHIFTBOOK_ENCRYPTION_KEY) process.env.SHIFTBOOK_ENCRYPTION_KEY = volumeKey(volume ? join(volume, "keys") : join(storageDir, ".granite"));

  // 4. The app's address.
  if (!process.env.SHIFTBOOK_APP_URL && process.env.RAILWAY_PUBLIC_DOMAIN) process.env.SHIFTBOOK_APP_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (live && !process.env.SHIFTBOOK_APP_URL) throw new Error("Live mode needs SHIFTBOOK_APP_URL (the address people open), or a public domain from the host.");

  // 5. Migrations and the demo agency. Imported only now: the settings above are read when these load.
  const { runMigrations } = await import("../src/server/db/migrate");
  await runMigrations(process.env.DATABASE_OWNER_URL!);
  say("database tables up to date");
  if (!live) await seedDemoIfMissing();

  // 6. Approval reminders.
  const port = process.env.PORT || "3000";
  let reminders: NodeJS.Timeout | null = null;
  if (!process.env.CRON_SECRET && process.env.SHIFTBOOK_APP_URL) {
    const secret = randomBytes(32).toString("hex");
    process.env.CRON_SECRET = secret;
    reminders = setInterval(() => void sendReminders(port, secret), REMINDER_EVERY_MS);
    reminders.unref();
  }

  // 7. The app.
  const next = spawn(join("node_modules", ".bin", "next"), ["start", "--port", port, "--hostname", "0.0.0.0"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => next.kill(signal));
  next.on("exit", (code, signal) => {
    if (reminders) clearInterval(reminders);
    process.exit(code ?? (signal ? 1 : 0));
  });
}

/** The demo agency, unless it is already there with its people (a start that stopped halfway is redone). */
async function seedDemoIfMissing(): Promise<void> {
  const { and, eq } = await import("drizzle-orm");
  const { createDatabase } = await import("../src/server/db/client");
  const { agencies, users } = await import("../src/server/db/schema");
  const { DEMO_AGENCY, DEMO_OWNER } = await import("../src/server/demo/dataset");
  const { clearDemoAgency, seedDemoAgency } = await import("../src/server/demo/seed");
  const owner = createDatabase(process.env.DATABASE_OWNER_URL!, { max: 1 });
  const app = createDatabase(process.env.DATABASE_URL!, { max: 1 });
  try {
    const agency = await owner.db.select({ id: agencies.id }).from(agencies).where(eq(agencies.id, DEMO_AGENCY.id));
    const person = await owner.db.select({ id: users.id }).from(users).where(and(eq(users.agencyId, DEMO_AGENCY.id), eq(users.id, DEMO_OWNER.id)));
    if (agency.length > 0 && person.length > 0) return;
    if (agency.length === 0) await owner.db.insert(agencies).values({ ...DEMO_AGENCY, isDemo: true });
    await app.withAgency(DEMO_AGENCY.id, async (tx) => {
      await clearDemoAgency(tx);
      await seedDemoAgency(tx);
    });
    say(`demo agency ready: ${DEMO_AGENCY.name}`);
  } finally {
    await owner.close();
    await app.close();
  }
}

async function sendReminders(port: string, secret: string): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/approvals/reminders`, { headers: { authorization: `Bearer ${secret}` } });
    if (!response.ok) say(`approval reminders answered ${response.status}`);
  } catch (error) {
    say(`approval reminders could not run: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run only when started directly (the unit test imports the helpers above).
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    console.error(`[granite] could not start: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
