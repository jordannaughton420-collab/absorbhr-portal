// Confirming the assistant's admin cards: each one runs with the confirming person's own
// permissions, so a role that can't do something is refused by the database, card or not.
// No paid AI calls: the cards are put in place directly, as the assistant would.
import { test, expect, as, USERS, adminClient, type Role } from "./fixtures";

test.describe.configure({ mode: "serial" });

const admin = adminClient();
const tag = `e2e-${Date.now().toString(36)}`;
let tenantId = "";
let jamieId = "";
const users: Partial<Record<Role, string>> = {};

async function card(role: Role, kind: string, payload: object, summary: string) {
  const { data: conv, error } = await admin
    .from("assistant_conversations")
    .insert({ tenant_id: tenantId, user_id: users[role]!, title: `Test ${tag}` })
    .select("id")
    .single();
  if (error) throw error;
  const { error: actionError } = await admin.from("assistant_actions").insert({
    tenant_id: tenantId,
    conversation_id: conv.id,
    user_id: users[role]!,
    tool_use_id: `toolu_${tag}`,
    kind,
    payload,
    summary,
  });
  if (actionError) throw actionError;
  return conv.id as string;
}

async function confirmAs(
  role: Role,
  conversationId: string,
  browser: import("@playwright/test").Browser,
) {
  const ctx = await browser.newContext(as(role));
  const page = await ctx.newPage();
  await page.goto(`/assistant?c=${conversationId}`);
  const box = page.getByLabel("Suggested change");
  await expect(box.getByRole("button", { name: "Confirm" })).toBeEnabled();
  await box.getByRole("button", { name: "Confirm" }).click();
  return { ctx, box };
}

test.beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const role of ["bwAdmin", "bwHr", "bwManager", "bwEmployee"] as Role[])
    users[role] = data.users.find((u) => u.email === USERS[role].email)!.id;
  const { data: m } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", users.bwAdmin!)
    .single();
  tenantId = m!.tenant_id;
  const { data: e } = await admin
    .from("employees")
    .select("id")
    .eq("user_id", users.bwEmployee!)
    .single();
  jamieId = e!.id;
  await admin.from("tenant_settings").update({ assistant_enabled: true }).eq("tenant_id", tenantId);
});

test.afterAll(async () => {
  await admin.from("departments").delete().eq("tenant_id", tenantId).like("name", `%${tag}%`);
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

test("the Client Admin confirms adding a department", async ({ browser }) => {
  const name = `Night bakery ${tag}`;
  const c = await card("bwAdmin", "add_department", { name }, `Add a department called "${name}".`);
  const { ctx, box } = await confirmAs("bwAdmin", c, browser);
  await expect(box).toContainText("Department added.");
  const { count } = await admin
    .from("departments")
    .select("id", { count: "exact", head: true })
    .eq("name", name);
  expect(count).toBe(1);
  await ctx.close();
});

test("HR confirms a holiday adjustment", async ({ browser }) => {
  const reason = `Time off in lieu ${tag}`;
  const c = await card(
    "bwHr",
    "adjust_holiday",
    { employee_id: jamieId, days: 1, reason },
    "Add 1 day of holiday to Jamie Crumb's allowance.",
  );
  const { ctx, box } = await confirmAs("bwHr", c, browser);
  await expect(box).toContainText("Holiday allowance adjusted.");
  const { count } = await admin
    .from("leave_adjustments")
    .select("id", { count: "exact", head: true })
    .eq("reason", reason);
  expect(count).toBe(1);
  await ctx.close();
});

test("HR can't change portal roles, even with a card (Client Admin only)", async ({ browser }) => {
  const c = await card(
    "bwHr",
    "change_role",
    { employee_id: jamieId, role: "hr_manager", active: true },
    "Change Jamie Crumb's portal role to HR Manager.",
  );
  const { ctx, box } = await confirmAs("bwHr", c, browser);
  await expect(box).toContainText("You don't have permission to make that change.");
  const { data } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", users.bwEmployee!)
    .single();
  expect(data!.role).toBe("employee");
  await ctx.close();
});

test("a line manager can't adjust holiday allowances, even with a card (HR only)", async ({
  browser,
}) => {
  const reason = `Should be refused ${tag}`;
  const c = await card(
    "bwManager",
    "adjust_holiday",
    { employee_id: jamieId, days: 5, reason },
    "Add 5 days of holiday to Jamie Crumb's allowance.",
  );
  const { ctx, box } = await confirmAs("bwManager", c, browser);
  await expect(box).toContainText("You don't have permission to make that change.");
  const { count } = await admin
    .from("leave_adjustments")
    .select("id", { count: "exact", head: true })
    .eq("reason", reason);
  expect(count).toBe(0);
  await ctx.close();
});
