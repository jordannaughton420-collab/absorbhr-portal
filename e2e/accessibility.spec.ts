// Automatic accessibility check (WCAG 2.1 AA) on every main page, as each role sees it.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, as, type Role } from "./fixtures";

const PAGES: Record<Exclude<Role, "ngEmployee" | "ngAdmin">, string[]> = {
  bwEmployee: [
    "/dashboard",
    "/leave",
    "/calendar",
    "/sickness",
    "/checklists",
    "/reviews",
    "/org-chart",
    "/policies",
    "/requests",
    "/privacy",
    "/assistant",
    "/shifts",
  ],
  bwManager: ["/leave/approvals", "/employees", "/rota"],
  bwHr: [
    "/employees",
    "/employees/new",
    "/cases",
    "/reports",
    "/privacy-tools",
    "/settings",
    "/checklists/templates",
    "/policies/new",
    "/rota",
  ],
  bwAdmin: ["/breaches", "/audit-log"],
};

for (const [role, paths] of Object.entries(PAGES) as [Role, string[]][]) {
  test.describe(`accessibility as ${role}`, () => {
    test.use(as(role));
    for (const path of paths) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const summary = violations.map(
          (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} place(s)`,
        );
        expect(summary, `Accessibility problems on ${path}`).toEqual([]);
      });
    }
  });
}

test.describe("phone-size screens", () => {
  test.use({ ...as("bwEmployee"), viewport: { width: 375, height: 812 } });
  for (const path of ["/dashboard", "/leave"]) {
    test(`${path} fits without sideways scrolling`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText("Menu")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
