import { expect, test } from "@playwright/test";

test("shows Free plan and tracks chat usage", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByTestId("dashboard-plan")).toContainText("Free");
  await expect(page.getByTestId("dashboard-status")).toHaveText("active");
  await expect(page.getByTestId("dashboard-usage")).toHaveText("0 / 1,000");

  await page.getByLabel("Prompt").fill("hello from e2e");
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByTestId("chat-reply")).toContainText("hello from e2e");
  await expect(page.getByTestId("dashboard-usage")).toHaveText("1 / 1,000");
});
