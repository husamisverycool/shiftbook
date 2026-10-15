import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? "postgres://shiftbook_owner@127.0.0.1:54329/shiftbook",
  },
});
