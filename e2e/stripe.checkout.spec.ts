import { expect, test } from "@playwright/test";
import { signUpViaUi, uniqueCredentials } from "./helpers/auth";
import { completeStripeCheckout } from "./helpers/stripe";

test.describe("Stripe Checkout @stripe", () => {
  test.skip(
    !process.env.STRIPE_E2E,
    "Set STRIPE_E2E=1 to run real Stripe Checkout (requires test keys and stripe listen)",
  );

  test.setTimeout(120_000);

  test("completes Plus checkout and syncs the plan on the dashboard", async ({
    page,
  }) => {
    const creds = uniqueCredentials();
    await signUpViaUi(page, creds);

    await page.goto("/pricing");
    await page.getByRole("button", { name: "Upgrade to Plus" }).click();
    await completeStripeCheckout(page, { email: creds.email });

    await expect(page).toHaveURL(/\/dashboard\?checkout=success/, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("dashboard-plan")).toContainText("Plus", {
      timeout: 60_000,
    });
  });

  test("applies WELCOME20 on Plus checkout and still syncs Plus", async ({
    page,
  }) => {
    const creds = uniqueCredentials();
    await signUpViaUi(page, creds);

    await page.goto("/pricing");
    await page.getByTestId("promo-code").fill("WELCOME20");
    await page.getByRole("button", { name: "Upgrade to Plus" }).click();

    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await expect(page.getByText(/\$16(\.00)?/).first()).toBeVisible({
      timeout: 15_000,
    });

    await completeStripeCheckout(page, { email: creds.email });

    await expect(page).toHaveURL(/\/dashboard\?checkout=success/, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("dashboard-plan")).toContainText("Plus", {
      timeout: 60_000,
    });
  });
});
