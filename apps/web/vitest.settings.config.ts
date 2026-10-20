import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Runs the settings-area tests against their own database. */
export default mergeConfig(base, defineConfig({
  test: {
    include: ["test/settings.test.ts"],
    env: { DATABASE_URL: "postgres://rounds:rounds@localhost:5432/rounds_test_settings" },
  },
}));
