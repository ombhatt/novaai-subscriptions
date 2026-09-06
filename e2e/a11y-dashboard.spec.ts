import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./helpers/a11y";

test("dashboard has no axe violations", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-plan")).toBeVisible();
  await expectNoAxeViolations(page);
});
