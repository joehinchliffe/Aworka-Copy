import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Payments tests run against their own database so they can run alongside other suites. */
export default mergeConfig(base, defineConfig({
  test: {
    include: ["test/payments.test.ts"],
    env: {
      DATABASE_URL: "postgres://rounds:rounds@localhost:5432/rounds_test_payments",
      GEOCODER: "off",
      APP_URL: "https://rounds.test",
      APP_SECRET: "test-app-secret",
      GOCARDLESS_CLIENT_ID: "gc_client",
      GOCARDLESS_CLIENT_SECRET: "gc_client_secret",
      GOCARDLESS_ENV: "sandbox",
      GOCARDLESS_WEBHOOK_SECRET: "gc_webhook_secret",
    },
  },
}));
