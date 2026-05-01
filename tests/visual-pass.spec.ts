import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const email = process.env.VISUAL_PASS_EMAIL;
const password = process.env.VISUAL_PASS_PASSWORD;
const routes = parseRoutes(process.env.VISUAL_PASS_ROUTES);

test("captures a live browser visual pass", async ({ page, baseURL }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /sign in to your workspace/i })).toBeVisible();

  if (email && password) {
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  }

  const visitedRoutes = email && password ? routes : ["/login"];
  const artifactDir = path.join(process.cwd(), "visual-pass-artifacts");
  await fs.mkdir(artifactDir, { recursive: true });

  for (const route of visitedRoutes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.screenshot({
      path: path.join(artifactDir, `${toFileName(route)}-desktop.png`),
      fullPage: true
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(artifactDir, `${toFileName(route)}-mobile.png`),
      fullPage: true
    });
  }

  const report = {
    baseURL,
    authenticated: Boolean(email && password),
    visitedRoutes,
    consoleErrors,
    pageErrors,
    generatedAt: new Date().toISOString()
  };

  await fs.writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(report, null, 2), "utf8");

  await testInfo.attach("visual-pass-summary", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json"
  });

  expect(pageErrors, `Page errors:\n${pageErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});

function parseRoutes(value: string | undefined) {
  if (!value) {
    return ["/dashboard", "/inbox", "/contacts", "/sales", "/reports", "/setup"];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("/") ? item : `/${item}`));
}

function toFileName(route: string) {
  if (route === "/" || route === "") {
    return "home";
  }

  return route.replace(/^\//, "").replace(/[\/?&=]+/g, "-");
}
