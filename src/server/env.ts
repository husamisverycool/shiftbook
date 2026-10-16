/**
 * Runtime configuration. Local defaults point at the private Postgres from scripts/dev-db.sh
 * (trust auth on 127.0.0.1, no passwords). Hosted settings come from environment variables.
 */
export type AppMode = "demo" | "live";

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://shiftbook_app@127.0.0.1:54329/shiftbook",
  databaseOwnerUrl:
    process.env.DATABASE_OWNER_URL ?? "postgres://shiftbook_owner@127.0.0.1:54329/shiftbook",
  // Slice (a) has no login yet, so the app only runs in demo mode (see the slice plan).
  mode: (process.env.SHIFTBOOK_MODE === "live" ? "live" : "demo") as AppMode,
  storageDir: process.env.SHIFTBOOK_STORAGE_DIR ?? ".storage",
  /**
   * The app's own address for links in emails (e.g. "https://app.example"). Required outside demo
   * mode: links are never built from a request's Host header, which a caller could forge.
   */
  appUrl: process.env.SHIFTBOOK_APP_URL?.replace(/\/+$/, "") || null,
  /**
   * How many proxies in front of the app append to X-Forwarded-For (the host's own; usually 1). The
   * address kept with an approval is the one the outermost of them recorded (src/server/sender.ts).
   */
  trustedProxyHops: Number(process.env.SHIFTBOOK_TRUSTED_PROXY_HOPS ?? "1"),
  /** The scheduled reminder route answers only to this secret (decision 0013). */
  cronSecret: process.env.CRON_SECRET || null,
};
