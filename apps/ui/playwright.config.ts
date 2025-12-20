import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: "retain-on-failure"
  },
  projects: [
    { name: "local" },
    { name: "remote" }
  ],
  globalSetup: "./e2e/global-setup",
  globalTeardown: "./e2e/global-teardown"
});


