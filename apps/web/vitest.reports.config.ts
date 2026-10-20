import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Runs the reports tests against their own database: npx vitest run -c vitest.reports.config.ts */
export default mergeConfig(base, defineConfig({
  test: {
    include: ["test/reports.test.ts"],
    env: { DATABASE_URL: "postgres://rounds:rounds@localhost:5432/rounds_test_reports" },
  },
}));
