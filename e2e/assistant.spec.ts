// The AI assistant stays off until a Client Admin switches it on. No paid AI calls here.
import { test, expect, as } from "./fixtures";

test.describe("AI assistant", () => {
  test.use(as("bwEmployee"));

  test("is switched off by default and not in the menu", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("navigation").first().getByRole("link", { name: "Assistant" }),
    ).toHaveCount(0);
    await page.goto("/assistant");
    await expect(page.getByText("The assistant is switched off for your company.")).toBeVisible();
  });
});
