import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests (schema, RLS, RPCs) against a real PostgreSQL. See README › Database tests.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
