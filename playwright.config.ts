import { defineConfig } from "@playwright/test";

const baseURL = process.env.VISUAL_PASS_BASE_URL ?? "http://localhost:5173";
const shouldStartFrontend = process.env.VISUAL_PASS_START_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: "visual-pass.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  outputDir: "test-results",
  webServer: shouldStartFrontend
    ? {
        command: "npm --workspace apps/frontend run dev -- --host localhost",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }
    : undefined
});
