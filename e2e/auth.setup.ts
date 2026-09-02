import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AUTH_FILE, signUpViaUi, uniqueCredentials } from "./helpers/auth";

setup("authenticate", async ({ page }) => {
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  const creds = uniqueCredentials();
  await signUpViaUi(page, creds);
  await expect(page.getByTestId("dashboard-plan")).toContainText("Free");
  await page.context().storageState({ path: AUTH_FILE });
});
