import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Approved goldens only (tests/goldens/rules, exports and compliance). Read-only answer key.
        extends: true,
        test: { name: "goldens", include: ["tests/golden-runners/approved.test.ts"] },
      },
      {
        // Cases waiting for the owner's approval in tests/goldens/_proposed.
        extends: true,
        test: { name: "proposed", include: ["tests/golden-runners/proposed.test.ts"] },
      },
    ],
  },
});
