/**
 * Starts Tabulado on a host in one step (decision 0035): the host runs this and nothing else.
 *
 *   pnpm start:hosted
 *
 * 1. The mode. SHIFTBOOK_MODE must say `demo` or `live`; anything else stops the start (a typo must
 *    never turn a live host into a demo).
 * 2. Database accounts. Given DATABASE_ADMIN_URL (a Postgres administrator's connection, such as the
 *    one a host's Postgres service hands out), it makes the two accounts the app needs —
 *    shiftbook_owner (owns the tables, runs migrations) and shiftbook_app (what the app connects as;
 *    row-level security fences it to one agency) — and a database owned by the first. Their
 *    passwords are worked out from the administrator's connection, so they stay the same from one
 *    start to the next and are never stored. When DATABASE_URL and DATABASE_OWNER_URL are both set,
 *    they are used as given, after checking the app's account cannot see past row-level security.
 * 3. Files. Uploads go to SHIFTBOOK_STORAGE_DIR, or else to the volume the host mounted
 *    (RAILWAY_VOLUME_MOUNT_PATH); with a volume, they must be on it. Live mode refuses to start with
 *    neither: files kept inside the container would be lost at the next deploy.
 * 4. The app's address. SHIFTBOOK_APP_URL, or else the host's public name (RAILWAY_PUBLIC_DOMAIN).
 * 5. Migrations.
 * 6. Demo: refuses a database that holds a real agency, then loads the demo agency when missing.
 *    Live: the encryption key — SHIFTBOOK_ENCRYPTION_KEY, or the one kept on the volume, or (on the
 *    very first start only) a new one kept there — checked against the database's key check, so a
 *    lost or swapped key stops the start instead of locking new data with it.
 * 7. Approval reminders. Without CRON_SECRET, this process calls the reminder route itself every 15
 *    minutes with a secret made for this start only, so no scheduler is needed.
 * 8. The app itself, on the host's PORT, without the owner's or the administrator's connection.
 */
import { spawn } from "node:child_process";
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import postgres from "postgres";

const OWNER = "shiftbook_owner";
const APP = "shiftbook_app";
const DATABASE = "granite";
const REMINDER_EVERY_MS = 15 * 60 * 1000;
const KEY_CHECK_LABEL = "granite encryption key check v1";

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

/** `demo` or `live`, exactly; anything else is a mistake to fix, never a guess. */
export function hostedMode(value: string | undefined): "demo" | "live" {
  if (value === "demo" || value === "live") return value;
  throw new Error(`SHIFTBOOK_MODE must be "demo" or "live" (it is ${value === undefined ? "not set" : `"${value}"`}).`);
}

async function prepareDatabase(adminUrl: string): Promise<{ appUrl: string; ownerUrl: string }> {
  const owner = rolePassword(adminUrl, OWNER);
  const app = rolePassword(adminUrl, APP);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const [me] = await admin<{ rolsuper: boolean }[]>`select rolsuper from pg_roles where rolname = current_user`;
    if (!me?.rolsuper) throw new Error("DATABASE_ADMIN_URL must be an administrator (superuser) connection: it makes the app's two database accounts.");
    // The statements below carry passwords: never into the database's own logs, even on an error.
    await admin.unsafe("SET log_statement = 'none'");
    await admin.unsafe("SET log_min_error_statement = 'panic'");
    // Role names are constants; passwords are hex, so neither can break out of the statement.
    const roles = await admin<{ rolname: string }[]>`select rolname from pg_roles where rolname in (${OWNER}, ${APP})`;
    const have = new Set(roles.map((r) => r.rolname));
    const limits = "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION";
    await admin.unsafe(`${have.has(OWNER) ? "ALTER" : "CREATE"} ROLE ${OWNER} LOGIN BYPASSRLS ${limits} PASSWORD '${owner}'`);
    await admin.unsafe(`${have.has(APP) ? "ALTER" : "CREATE"} ROLE ${APP} LOGIN NOBYPASSRLS ${limits} PASSWORD '${app}'`);
    const [db] = await admin<{ owner: string }[]>`select pg_get_userbyid(datdba) as owner from pg_database where datname = ${DATABASE}`;
    if (!db) {
      await admin.unsafe(`CREATE DATABASE ${DATABASE} OWNER ${OWNER}`);
      say(`made the database "${DATABASE}"`);
    } else if (db.owner !== OWNER) {
      throw new Error(`The database "${DATABASE}" already exists but belongs to "${db.owner}", not ${OWNER}.`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
  const adminParts = new URL(adminUrl);
  const inDatabase = postgres(connectionFor(adminUrl, decodeURIComponent(adminParts.username), decodeURIComponent(adminParts.password), DATABASE), { max: 1, onnotice: () => {} });
  try {
    await inDatabase.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  } finally {
    await inDatabase.end({ timeout: 5 });
  }
  return { appUrl: connectionFor(adminUrl, APP, app, DATABASE), ownerUrl: connectionFor(adminUrl, OWNER, owner, DATABASE) };
}

/** Given URLs: the app's account must be fenced by row-level security like the one made above. */
async function checkAppAccount(appUrl: string): Promise<void> {
  const app = postgres(appUrl, { max: 1, onnotice: () => {} });
  try {
    const [me] = await app<{ rolsuper: boolean; rolbypassrls: boolean }[]>`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    if (!me || me.rolsuper || me.rolbypassrls) throw new Error("DATABASE_URL must be the limited app account (shiftbook_app), not an administrator: row-level security would not apply to it.");
  } finally {
    await app.end({ timeout: 5 });
  }
}

function asKey(text: string, where: string): string {
  const key = text.trim();
  if (Buffer.from(key, "base64").length !== 32) throw new Error(`${where} does not hold a 32-byte key written in base64.`);
  return key;
}

/** The key kept in `dir`, or null when there is none yet. A damaged file stops the start; it is never replaced. */
export function readVolumeKey(dir: string): string | null {
  const file = join(dir, "encryption-key");
  return existsSync(file) ? asKey(readFileSync(file, "utf8"), file) : null;
}

/**
 * Makes the key and keeps it in `dir`, readable by this app only. Written whole to a temporary file,
 * flushed to disk, then linked into place, so a crash never leaves a half-written key; if another
 * start got there first, its key is the one used.
 */
export function makeVolumeKey(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "encryption-key");
  const temporary = join(dir, `.encryption-key.${process.pid}.${randomBytes(4).toString("hex")}`);
  const key = randomBytes(32).toString("base64");
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeSync(fd, `${key}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return readVolumeKey(dir)!;
    throw error;
  } finally {
    unlinkSync(temporary);
  }
  const folder = openSync(dir, "r");
  try {
    fsyncSync(folder);
  } finally {
    closeSync(folder);
  }
  say("made the encryption key and kept it on the volume");
  return key;
}

/** What the database keeps to recognise the key: an HMAC of a fixed label, which reveals nothing of it. */
export function keyCheck(key: string): string {
  return createHmac("sha256", Buffer.from(key, "base64")).update(KEY_CHECK_LABEL).digest("hex");
}

function sameCheck(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Live mode's key: from the setting or the volume, made only on a database that has never had one. */
async function liveKey(ownerUrl: string, keyDir: string): Promise<string> {
  const given = process.env.SHIFTBOOK_ENCRYPTION_KEY ? asKey(process.env.SHIFTBOOK_ENCRYPTION_KEY, "SHIFTBOOK_ENCRYPTION_KEY") : null;
  const kept = readVolumeKey(keyDir);
  if (given && kept && !Buffer.from(given, "base64").equals(Buffer.from(kept, "base64"))) {
    throw new Error("SHIFTBOOK_ENCRYPTION_KEY and the key kept on the volume differ. Keep the one this database was set up with and remove the other.");
  }
  const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const [stored] = await owner<{ check_value: string }[]>`select check_value from host_key_check where id = 1`;
    let key = given ?? kept;
    if (!key) {
      if (stored) throw new Error("The encryption key is missing: this database was set up with a key that is neither in SHIFTBOOK_ENCRYPTION_KEY nor on the volume. Restore the volume from its backup, or set SHIFTBOOK_ENCRYPTION_KEY to the saved key.");
      key = makeVolumeKey(keyDir);
    }
    const check = keyCheck(key);
    if (!stored) {
      await owner`insert into host_key_check (id, check_value) values (1, ${check}) on conflict (id) do nothing`;
      const [now] = await owner<{ check_value: string }[]>`select check_value from host_key_check where id = 1`;
      if (now?.check_value !== check) throw new Error("Another start set up this database with a different encryption key at the same moment. Start again.");
    } else if (!sameCheck(stored.check_value, check)) {
      throw new Error("The encryption key does not match the one this database was set up with. Restore the volume from its backup, or set SHIFTBOOK_ENCRYPTION_KEY to the saved key.");
    }
    return key;
  } finally {
    await owner.end({ timeout: 5 });
  }
}

/** A demo start on a database that holds a real agency would show its data to anyone: refused. */
async function refuseRealAgencies(ownerUrl: string): Promise<void> {
  const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const [real] = await owner`select 1 from agencies where not is_demo limit 1`;
    if (real) throw new Error('This database holds a real agency, so it cannot run as a demo. Set SHIFTBOOK_MODE to "live".');
  } finally {
    await owner.end({ timeout: 5 });
  }
}

export function inside(folder: string, path: string): boolean {
  const r = relative(resolve(folder), resolve(path));
  return r === "" || (!isAbsolute(r) && r.split(sep)[0] !== "..");
}

async function main(): Promise<void> {
  // 1. The mode.
  const mode = hostedMode(process.env.SHIFTBOOK_MODE);
  const live = mode === "live";
  say(`starting in ${mode} mode`);

  // 2. Database accounts.
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (process.env.DATABASE_URL && process.env.DATABASE_OWNER_URL) {
    await checkAppAccount(process.env.DATABASE_URL);
  } else {
    if (!adminUrl) throw new Error("Set DATABASE_ADMIN_URL to the Postgres service's connection (or set both DATABASE_URL and DATABASE_OWNER_URL).");
    const urls = await prepareDatabase(adminUrl);
    process.env.DATABASE_URL = urls.appUrl;
    process.env.DATABASE_OWNER_URL = urls.ownerUrl;
    say("database accounts ready");
  }
  delete process.env.DATABASE_ADMIN_URL;
  const ownerUrl = process.env.DATABASE_OWNER_URL!;

  // 3. Files.
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const storageDir = resolve(process.env.SHIFTBOOK_STORAGE_DIR || (volume ? join(volume, "storage") : ".storage"));
  if (volume && !inside(volume, storageDir)) throw new Error(`SHIFTBOOK_STORAGE_DIR (${storageDir}) is not on the volume (${volume}): uploads would be lost at the next deploy.`);
  if (live && !process.env.SHIFTBOOK_STORAGE_DIR && !volume) {
    throw new Error("Live mode needs a volume for uploaded files: attach one to this service (or set SHIFTBOOK_STORAGE_DIR to a disk that survives deploys).");
  }
  mkdirSync(storageDir, { recursive: true });
  process.env.SHIFTBOOK_STORAGE_DIR = storageDir;

  // 4. The app's address.
  if (!process.env.SHIFTBOOK_APP_URL && process.env.RAILWAY_PUBLIC_DOMAIN) process.env.SHIFTBOOK_APP_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (live && !process.env.SHIFTBOOK_APP_URL) throw new Error("Live mode needs SHIFTBOOK_APP_URL (the address people open), or a public domain from the host: generate one, then deploy again.");

  // 5. Migrations. Imported only now: the settings above are read when the app's modules load.
  const { runMigrations } = await import("../src/server/db/migrate");
  await runMigrations(ownerUrl);
  say("database tables up to date");

  // 6. Demo data, or the live key.
  if (live) {
    process.env.SHIFTBOOK_ENCRYPTION_KEY = await liveKey(ownerUrl, volume ? join(volume, "keys") : join(storageDir, ".granite"));
    say("encryption key matches this database");
  } else {
    await refuseRealAgencies(ownerUrl);
    await seedDemoIfMissing(ownerUrl);
  }

  // 7. Approval reminders.
  const port = process.env.PORT || "3000";
  let reminders: NodeJS.Timeout | null = null;
  if (!process.env.CRON_SECRET && process.env.SHIFTBOOK_APP_URL) {
    const secret = randomBytes(32).toString("hex");
    process.env.CRON_SECRET = secret;
    reminders = setInterval(() => void sendReminders(port, secret), REMINDER_EVERY_MS);
    reminders.unref();
  }

  // 8. The app, which needs neither the owner's connection (it bypasses row-level security) nor the administrator's.
  const appEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
  delete appEnv.DATABASE_OWNER_URL;
  const next = spawn(join("node_modules", ".bin", "next"), ["start", "--port", port, "--hostname", "0.0.0.0"], { stdio: "inherit", env: appEnv });
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => next.kill(signal));
  next.on("exit", (code, signal) => {
    if (reminders) clearInterval(reminders);
    process.exit(code ?? (signal ? 1 : 0));
  });
}

/** The demo agency, unless it is already there with its people (a start that stopped halfway is redone). */
async function seedDemoIfMissing(ownerUrl: string): Promise<void> {
  const { and, eq } = await import("drizzle-orm");
  const { createDatabase } = await import("../src/server/db/client");
  const { agencies, users } = await import("../src/server/db/schema");
  const { DEMO_AGENCY, DEMO_OWNER } = await import("../src/server/demo/dataset");
  const { clearDemoAgency, seedDemoAgency } = await import("../src/server/demo/seed");
  const owner = createDatabase(ownerUrl, { max: 1 });
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
  // Approval reminders (decision 0013), then notices and collection reminders (slice r).
  for (const path of ["/api/approvals/reminders", "/api/notifications/sweep"]) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: `Bearer ${secret}` } });
      if (!response.ok) say(`${path} answered ${response.status}`);
    } catch (error) {
      say(`${path} could not run: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Run only when started directly (the unit test imports the helpers above).
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    console.error(`[granite] could not start: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
