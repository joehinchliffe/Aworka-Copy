import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Messaging tests run against their own database so they don't clash with other suites. */
export default mergeConfig(base, defineConfig({
  test: {
    include: ["test/messaging.test.ts"],
    env: { DATABASE_URL: "postgres://rounds:rounds@localhost:5432/rounds_test_messaging" },
  },
}));
