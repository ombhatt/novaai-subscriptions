import { expect, test } from "@playwright/test";
import {
  checkoutSuccessUrl,
  mockCheckout,
  mockPortal,
  mockSubscriptionAsPlus,
  portalReturnUrl,
} from "./helpers/stripe";

test("upgrade to Plus posts checkout then follows the mock success URL", async ({
  page,
}) => {
  await mockCheckout(page, {
    expectedTier: "plus",
    redirectUrl: checkoutSuccessUrl(),
  });

  await page.goto("/pricing");
  await page.getByRole("button", { name: "Upgrade to Plus" }).click();
  await expect(page).toHaveURL(/\/dashboard\?checkout=success/);
});

test("upgrade to Plus includes a typed promo code in the checkout body", async ({
  page,
}) => {
  await mockCheckout(page, {
    expectedTier: "plus",
    expectedPromoCode: "WELCOME20",
    redirectUrl: checkoutSuccessUrl(),
  });

  await page.goto("/pricing");
  await page.getByTestId("promo-code").fill("WELCOME20");
  await page.getByRole("button", { name: "Upgrade to Plus" }).click();
  await expect(page).toHaveURL(/\/dashboard\?checkout=success/);
});

test("invalid promo stays on pricing with an error", async ({ page }) => {
  await mockCheckout(page, {
    expectedTier: "plus",
    expectedPromoCode: "NOPE",
    error: "Invalid or expired promo code.",
  });

  await page.goto("/pricing");
  await page.getByTestId("promo-code").fill("NOPE");
  await page.getByRole("button", { name: "Upgrade to Plus" }).click();

  await expect(page.getByTestId("checkout-error")).toHaveText(
    "Invalid or expired promo code.",
  );
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByTestId("promo-code")).toHaveValue("NOPE");
});

test("manage billing posts portal then follows the mock return URL", async ({
  page,
}) => {
  await mockSubscriptionAsPlus(page);
  await mockPortal(page, portalReturnUrl());

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Manage billing" }).click();
  await expect(page).toHaveURL(/\/dashboard\?portal=return/);
});
