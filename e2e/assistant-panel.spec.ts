// The assistant in the bottom corner, for HR, managers and admins. No paid AI calls: the chat and
// its card are put in place directly, as the assistant would.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, as, USERS, adminClient, type Role } from "./fixtures";

test.describe.configure({ mode: "serial" });

const admin = adminClient();
const tag = `e2e-panel-${Date.now().toString(36)}`;
let tenantId = "";
let jamieId = "";
const users: Partial<Record<Role, string>> = {};

test.beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const role of ["bwHr", "bwEmployee"] as Role[])
    users[role] = data.users.find((u) => u.email === USERS[role].email)!.id;
  const { data: m } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", users.bwHr!)
    .single();
  tenantId = m!.tenant_id;
  const { data: e } = await admin
    .from("employees")
    .select("id")
    .eq("user_id", users.bwEmployee!)
    .single();
  jamieId = e!.id;
  await admin.from("tenant_settings").update({ assistant_enabled: true }).eq("tenant_id", tenantId);

  // HR's most recent chat, with one card waiting for Confirm.
  const { data: conv, error } = await admin
    .from("assistant_conversations")
    .insert({
      tenant_id: tenantId,
      user_id: users.bwHr!,
      title: `Panel ${tag}`,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("assistant_actions").insert({
    tenant_id: tenantId,
    conversation_id: conv.id,
    user_id: users.bwHr!,
    tool_use_id: `toolu_${tag}`,
    kind: "adjust_holiday",
    payload: { employee_id: jamieId, days: 1, reason: `Time off in lieu ${tag}` },
    summary: "Add 1 day of holiday to Jamie Crumb's allowance for this leave year.",
  });
});

test.afterAll(async () => {
  await admin
    .from("leave_adjustments")
    .delete()
    .eq("employee_id", jamieId)
    .like("reason", `%${tag}%`);
  await admin
    .from("assistant_conversations")
    .delete()
    .eq("tenant_id", tenantId)
    .like("title", `%${tag}%`);
  await admin
    .from("tenant_settings")
    .update({ assistant_enabled: false })
    .eq("tenant_id", tenantId);
});

test("employees don't get the corner assistant", async ({ browser }) => {
  const ctx = await browser.newContext(as("bwEmployee"));
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open the assistant" })).toHaveCount(0);
  await ctx.close();
});

test("HR opens the corner assistant, it stays open between pages, and a card is confirmed in it", async ({
  browser,
}) => {
  const ctx = await browser.newContext(as("bwHr"));
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open the assistant" }).click();
  const panel = page.getByRole("dialog", { name: "Assistant" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Add 1 day of holiday to Jamie Crumb's allowance")).toBeVisible();
  await expect(panel.getByLabel("Message the assistant")).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include('[role="dialog"]')
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Moving to another page keeps the panel and the chat open.
  await page.getByRole("navigation").first().getByRole("link", { name: "Rota" }).click();
  await expect(page).toHaveURL(/\/rota/);
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Confirm" }).click();
  await expect(panel).toContainText("Holiday allowance adjusted.");
  const { count } = await admin
    .from("leave_adjustments")
    .select("id", { count: "exact", head: true })
    .like("reason", `%${tag}%`);
  expect(count).toBe(1);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open the assistant" })).toBeFocused();
  await ctx.close();
});

test("the corner assistant fits a phone screen", async ({ browser }) => {
  const ctx = await browser.newContext({ ...as("bwHr"), viewport: { width: 375, height: 740 } });
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open the assistant" }).click();
  await expect(page.getByRole("dialog", { name: "Assistant" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
