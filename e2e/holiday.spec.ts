import { test, expect, as, USERS } from "./fixtures";

/** Same wording the portal uses for dates, e.g. "Wed 2 Dec 2026". */
const describe = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** A random weekday at least a week away, avoiding Christmas and New Year. */
function pickDay() {
  const days: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  for (let i = 0; i < 120; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const md = iso.slice(5);
    if (d.getUTCDay() % 6 === 0 || md >= "12-20" || md <= "01-05") continue;
    days.push(iso);
  }
  return days[Math.floor(Math.random() * Math.min(days.length, 40))];
}

test("an employee books a day's holiday and their manager approves it", async ({ browser }) => {
  const day = pickDay();
  const label = describe(day);

  // Jamie (employee) asks for the day off.
  const empCtx = await browser.newContext(as("bwEmployee"));
  const emp = await empCtx.newPage();
  await emp.goto("/leave");
  await expect(emp.getByRole("heading", { name: "My leave" })).toBeVisible();
  // Forms stay disabled until the page has fully loaded; typing earlier gets wiped.
  await expect(emp.getByRole("button", { name: "Send request" })).toBeEnabled();
  await emp.getByLabel("First day").fill(day);
  await expect(emp.getByLabel("First day")).toHaveValue(day);
  await emp.getByLabel("Last day").fill(day);
  await expect(emp.getByLabel("Last day")).toHaveValue(day);
  await expect(emp.getByText("This uses 1 working day")).toBeVisible();
  await emp.getByRole("button", { name: "Send request" }).click();
  const row = emp.getByRole("row").filter({ hasText: label });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Waiting for approval");

  // Morgan (Jamie's line manager) approves it.
  const mgrCtx = await browser.newContext(as("bwManager"));
  const mgr = await mgrCtx.newPage();
  await mgr.goto("/leave/approvals");
  const request = mgr.getByRole("listitem").filter({ hasText: "Jamie" }).filter({ hasText: label });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(request).toHaveCount(0);
  await mgrCtx.close();

  // Jamie sees it approved, then cancels it so the test leaves the holiday balance as it was.
  await emp.reload();
  await expect(row).toContainText("Approved");
  await emp.getByRole("button", { name: `Cancel request for ${label}` }).click();
  await expect(row).toContainText("Cancelled");
  await empCtx.close();
});

test("a company that hasn't set its holiday rules can't book holiday yet", async ({ browser }) => {
  // Northgate is deliberately left unconfigured in the test data.
  const ctx = await browser.newContext(as("ngAdmin"));
  const page = await ctx.newPage();
  await page.goto("/leave");
  await expect(page.getByText(/hasn't finished setting up its holiday rules/)).toBeVisible();
  await expect(page.getByText(USERS.ngAdmin.name).first()).toBeAttached();
  await ctx.close();
});
