import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Signed-in e2e credentials (E2E_EMAIL, E2E_PASSWORD) live in this gitignored file.
if (existsSync(".env.e2e.local")) process.loadEnvFile(".env.e2e.local");

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Every signed-in page verifies the session and reads the hosted project; more parallel
  // browsers than this run into Supabase Auth rate limits and time out.
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Saves round-trip to the hosted Supabase project; allow for that under parallel load.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
