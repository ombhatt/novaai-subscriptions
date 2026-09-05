import { expect, type Frame, type Locator, type Page } from "@playwright/test";
import type { Tier } from "../../src/lib/tiers";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:43123";

export function checkoutSuccessUrl() {
  return `${APP_URL}/dashboard?checkout=success`;
}

export function portalReturnUrl() {
  return `${APP_URL}/dashboard?portal=return`;
}

export async function mockCheckout(
  page: Page,
  options: {
    expectedTier: Exclude<Tier, "free">;
    redirectUrl: string;
    expectedPromoCode?: string;
  },
) {
  await page.route("**/api/checkout", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const body = route.request().postDataJSON() as {
      tier?: string;
      promoCode?: string;
    };
    expect(body.tier).toBe(options.expectedTier);
    if (options.expectedPromoCode !== undefined) {
      expect(body.promoCode).toBe(options.expectedPromoCode);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: options.redirectUrl }),
    });
  });
}

export async function mockPortal(page: Page, redirectUrl: string) {
  await page.route("**/api/portal", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: redirectUrl }),
    });
  });
}

export async function mockSubscriptionAsPlus(page: Page) {
  await page.route("**/api/subscription", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        subscription: {
          id: "sub_e2e",
          user_id: "user_e2e",
          tier: "plus",
          status: "active",
          stripe_customer_id: "cus_e2e",
          stripe_subscription_id: "sub_e2e_stripe",
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        usage: 0,
        limit: 50_000,
        remaining: 50_000,
        tier: "plus",
        status: "active",
      }),
    });
  });
}

type FieldRoot = Page | Frame;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function firstVisible(
  page: Page,
  build: (root: FieldRoot) => Locator,
  timeoutMs: number,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const root of [page, ...page.frames()] as FieldRoot[]) {
      const locator = build(root).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    await sleep(200);
  }

  const frames = page
    .frames()
    .map((frame) => frame.url())
    .join("\n");
  throw new Error(
    `Stripe field not visible within ${timeoutMs}ms. Frames:\n${frames || "(none)"}`,
  );
}

async function fillStripeField(
  page: Page,
  build: (root: FieldRoot) => Locator,
  value: string,
  timeoutMs = 30_000,
) {
  const field = await firstVisible(page, build, timeoutMs);
  await field.click();
  await field.pressSequentially(value, { delay: 25 });
}

async function fillIfVisible(
  page: Page,
  build: (root: FieldRoot) => Locator,
  value: string,
  timeoutMs = 3_000,
) {
  try {
    const field = await firstVisible(page, build, timeoutMs);
    await field.fill(value);
  } catch {
    // Optional billing fields differ by Checkout session and country.
  }
}

export async function completeStripeCheckout(
  page: Page,
  options?: { email?: string },
) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");

  if (options?.email) {
    await fillIfVisible(
      page,
      (root) =>
        root.getByLabel(/^email$/i).or(root.locator("#email, input[type='email']")),
      options.email,
      5_000,
    );
  }

  // Link "save my info" is checked by default and adds a required phone field.
  const saveInfo = page.getByRole("checkbox", {
    name: /save my information/i,
  });
  if (await saveInfo.isVisible({ timeout: 5_000 }).catch(() => false)) {
    if (await saveInfo.isChecked()) {
      await saveInfo.uncheck();
    }
  }

  // The accordion <button> is hidden and off-viewport; click the visible Card row.
  await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("radio", { name: "Card" }) })
    .click();

  await fillStripeField(
    page,
    (root) =>
      root
        .getByPlaceholder(/1234/)
        .or(root.getByLabel(/card number/i))
        .or(
          root.locator(
            'input[name="cardNumber"], input[name="cardnumber"], input[id="cardNumber"], input[autocomplete="cc-number"]',
          ),
        ),
    "4242424242424242",
  );

  await fillStripeField(
    page,
    (root) =>
      root
        .getByPlaceholder(/MM\s*\/?\s*YY/i)
        .or(root.getByLabel(/expir/i))
        .or(
          root.locator(
            'input[name="cardExpiry"], input[name="exp-date"], input[id="cardExpiry"], input[autocomplete="cc-exp"]',
          ),
        ),
    "1234",
  );

  await fillStripeField(
    page,
    (root) =>
      root
        .getByPlaceholder(/CVC/i)
        .or(root.getByLabel(/cvc|security code/i))
        .or(
          root.locator(
            'input[name="cardCvc"], input[name="cvc"], input[id="cardCvc"], input[autocomplete="cc-csc"]',
          ),
        ),
    "123",
  );

  await fillIfVisible(
    page,
    (root) =>
      root
        .getByLabel(/cardholder name|name on card|full name/i)
        .or(
          root.locator(
            'input[name="billingName"], input[id="billingName"], input[autocomplete="cc-name"]',
          ),
        ),
    "E2E Tester",
  );

  await fillIfVisible(
    page,
    (root) =>
      root
        .getByLabel(/zip|postal/i)
        .or(
          root.locator(
            'input[name="billingPostalCode"], input[id="billingPostalCode"], input[autocomplete="postal-code"]',
          ),
        ),
    "10001",
  );

  await page
    .getByRole("button", { name: "Subscribe" })
    .or(page.getByTestId("hosted-payment-submit-button"))
    .first()
    .click();
}
