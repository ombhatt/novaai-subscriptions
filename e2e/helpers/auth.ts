import { expect, type Page } from "@playwright/test";

export const AUTH_FILE = "e2e/.auth/user.json";
export const E2E_PASSWORD = "testpass1";

export function uniqueCredentials(fullName = "E2E Tester") {
  const token = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName,
    email: `e2e.${token}@example.com`,
    password: E2E_PASSWORD,
  };
}

export async function signUpViaUi(
  page: Page,
  creds: { fullName: string; email: string; password: string },
) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(creds.fullName);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function signInViaUi(
  page: Page,
  creds: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
