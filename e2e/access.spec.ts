// The walls: each company sees only its own data, and each role only what it should.
import { test, expect, as, USERS, type Role } from "./fixtures";
import type { Browser } from "@playwright/test";

/** Looks up a person's profile address the way HR would, from the Employees list. */
async function profileUrl(browser: Browser, name: string) {
  const ctx = await browser.newContext(as("bwHr"));
  const page = await ctx.newPage();
  await page.goto("/employees");
  const href = await page.getByRole("link", { name, exact: true }).first().getAttribute("href");
  await ctx.close();
  expect(href).toMatch(/^\/employees\/[0-9a-f-]{36}$/);
  return href!;
}

async function expectHidden(browser: Browser, role: Role, path: string) {
  const ctx = await browser.newContext(as(role));
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Jamie|Harper/ })).toHaveCount(0);
  await ctx.close();
}

test.describe("walls between companies", () => {
  test("Northgate's admin cannot open a Brightwater employee, even by typing the address", async ({
    browser,
  }) => {
    await expectHidden(browser, "ngAdmin", await profileUrl(browser, USERS.bwEmployee.name));
  });

  test("Northgate's admin sees none of Brightwater's staff in their list", async ({ browser }) => {
    const ctx = await browser.newContext(as("ngAdmin"));
    const page = await ctx.newPage();
    await page.goto("/employees");
    await expect(page.getByRole("link", { name: USERS.ngAdmin.name }).first()).toBeVisible();
    for (const name of [USERS.bwEmployee.name, USERS.bwHr.name, USERS.bwAdmin.name])
      await expect(page.getByText(name)).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("walls between roles", () => {
  const hrOnly = ["/cases", "/reports", "/privacy-tools", "/settings", "/audit-log", "/breaches"];

  for (const role of ["bwEmployee", "bwManager"] as const) {
    test(`${USERS[role].name} (${role === "bwEmployee" ? "employee" : "line manager"}) is kept out of HR pages`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext(as(role));
      const page = await ctx.newPage();
      for (const path of hrOnly) {
        await page.goto(path);
        await expect(page, `${path} should send them back`).toHaveURL(/\/dashboard/);
      }
      const nav = page.getByRole("navigation").first();
      for (const label of ["Cases", "Reports", "Data protection", "Company settings", "Audit log"])
        await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
      await ctx.close();
    });
  }

  test("an employee cannot open a colleague's profile", async ({ browser }) => {
    await expectHidden(browser, "bwEmployee", await profileUrl(browser, USERS.bwHr.name));
  });

  test("a line manager sees their own team only", async ({ browser }) => {
    const ctx = await browser.newContext(as("bwManager"));
    const page = await ctx.newPage();
    await page.goto("/employees");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: USERS.bwEmployee.name }).first()).toBeVisible();
    // HR and the director don't report to the production manager.
    await expect(page.getByRole("link", { name: USERS.bwHr.name })).toHaveCount(0);
    await expect(page.getByRole("link", { name: USERS.bwAdmin.name })).toHaveCount(0);
    await ctx.close();
  });

  test("HR can see cases, reports and data protection tools", async ({ browser }) => {
    const ctx = await browser.newContext(as("bwHr"));
    const page = await ctx.newPage();
    for (const path of ["/cases", "/reports", "/privacy-tools"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
    }
    await ctx.close();
  });
});
