import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Same as vitest.config.ts but against a separate database (rounds_test_email). */
export default mergeConfig(base, defineConfig({
  test: { env: { DATABASE_URL: "postgres://rounds:rounds@localhost:5432/rounds_test_email", GEOCODER: "off" } },
}));
