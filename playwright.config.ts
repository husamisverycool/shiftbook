import { defineConfig, devices } from "@playwright/test";

/** Another checkout (a worktree) can run its own copy side by side: SHIFTBOOK_E2E_PORT=3200 with its own DATABASE_URL. */
const PORT = Number(process.env.SHIFTBOOK_E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/en/convert`,
    reuseExistingServer: false,
    timeout: 600_000,
    // The photo-path test uses its own hand-written recorded reading (tests/e2e/fixtures).
    env: { SHIFTBOOK_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1", SHIFTBOOK_RECORDINGS_DIR: "tests/e2e/fixtures/recordings" },
  },
});
