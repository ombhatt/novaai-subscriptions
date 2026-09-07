import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("home hero links to signup and pricing", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /Ship AI products with simple, predictable pricing/,
      }),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: /Start for free/ })).toHaveAttribute(
      "href",
      "/signup",
    );
    await expect(page.getByRole("link", { name: "View pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  test("pricing page lists Free, Plus, Pro, and Enterprise", async ({ page }) => {
    await page.goto("/pricing");

    await expect(
      page.getByRole("heading", { name: /Simple pricing for every stage/ }),
    ).toBeVisible();
    await expect(page.getByText("$0")).toBeVisible();
    await expect(page.getByText("$20")).toBeVisible();
    await expect(page.getByText("$99")).toBeVisible();
    await expect(page.getByText("Custom")).toBeVisible();
    await expect(page.getByRole("button", { name: "Included" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upgrade to Plus" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Contact sales" })).toBeVisible();
  });

  test("enterprise contact sales opens an inquiry form", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Contact sales" }).click();
    await expect(page.getByTestId("enterprise-inquiry-form")).toBeVisible();
    await expect(page).toHaveURL(/\/pricing/);
  });

  test("pricing page prefills promo from the query string", async ({ page }) => {
    await page.goto("/pricing?promo=WELCOME20");
    await expect(page.getByTestId("promo-code")).toHaveValue("WELCOME20");
  });

  test("unauthenticated upgrade to Plus goes to signup with plan query", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Upgrade to Plus" }).click();
    await expect(page).toHaveURL(/\/signup\?plan=plus/);
  });

  test("unauthenticated upgrade carries promo to signup", async ({ page }) => {
    await page.goto("/pricing?promo=WELCOME20");
    await page.getByRole("button", { name: "Upgrade to Plus" }).click();
    await expect(page).toHaveURL(/\/signup\?plan=plus&promo=WELCOME20/);
  });

  test("dashboard redirects guests to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
  });
});
