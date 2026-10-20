import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    env: { DATABASE_URL: "postgres://rounds:rounds@localhost:5432/rounds_test" },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
