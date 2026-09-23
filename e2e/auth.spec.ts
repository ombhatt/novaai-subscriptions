import { expect, test } from "@playwright/test";
import { signInViaUi, signUpViaUi, uniqueCredentials } from "./helpers/auth";
import { mockCheckout } from "./helpers/stripe";

test.describe("auth", () => {
  test("signup lands on the dashboard with the Free plan", async ({ page }) => {
    const creds = uniqueCredentials();
    await signUpViaUi(page, creds);
    await expect(page.getByTestId("dashboard-plan")).toContainText("Free");
    await expect(page.getByTestId("dashboard-status")).toHaveText("active");
  });

  test("signup with a pricing plan starts checkout", async ({ page }) => {
    const creds = uniqueCredentials();
    await mockCheckout(page, {
      expectedTier: "plus",
      expectedPromoCode: "WELCOME20",
      redirectUrl: "http://localhost:43123/dashboard?checkout=started",
    });

    await page.goto("/signup?plan=plus&promo=WELCOME20");
    await expect(
      page.getByText("Create your account to continue to Plus checkout."),
    ).toBeVisible();
    await page.getByLabel("Full name").fill(creds.fullName);
    await page.getByLabel("Email").fill(creds.email);
    await page.getByLabel("Password").fill(creds.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard\?checkout=started/);
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
