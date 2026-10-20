import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Runs the sync tests against their own database: `npx vitest run -c vitest.sync.config.ts`. */
export default mergeConfig(base, defineConfig({
  test: {
    include: ["test/sync.test.ts"],
    env: { DATABASE_URL: process.env.SYNC_DATABASE_URL ?? "postgres://rounds:rounds@localhost:5432/rounds_test_sync", GEOCODER: "off" },
  },
}));
