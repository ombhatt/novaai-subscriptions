import { test } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/a11y";

test.describe("accessibility", () => {
  test("home has no axe violations", async ({ page }) => {
    await page.goto("/");
    await expectNoAxeViolations(page);
  });

  test("home mobile menu has no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expectNoAxeViolations(page);
  });

  test("pricing has no axe violations", async ({ page }) => {
    await page.goto("/pricing");
    await expectNoAxeViolations(page);
  });

  test("login has no axe violations", async ({ page }) => {
    await page.goto("/login");
    await expectNoAxeViolations(page);
  });

  test("signup has no axe violations", async ({ page }) => {
    await page.goto("/signup");
    await expectNoAxeViolations(page);
  });
});
