import { expect, test } from "@playwright/test";
import { signInViaUi, signUpViaUi, uniqueCredentials } from "./helpers/auth";

test.describe("auth", () => {
  test("signup lands on the dashboard with the Free plan", async ({ page }) => {
    const creds = uniqueCredentials();
    await signUpViaUi(page, creds);
    await expect(page.getByTestId("dashboard-plan")).toContainText("Free");
    await expect(page.getByTestId("dashboard-status")).toHaveText("active");
  });

  test("invalid login shows an error", async ({ page }) => {
    await signInViaUi(page, {
      email: "missing.e2e@example.com",
      password: "wrongpass",
    });
    await expect(page.getByText(/invalid|authentication failed|credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logged-in users visiting login are redirected to the dashboard", async ({
    page,
  }) => {
    const creds = uniqueCredentials();
    await signUpViaUi(page, creds);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
