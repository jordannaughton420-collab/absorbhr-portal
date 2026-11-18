import { test, expect, as } from "./fixtures";

/** A random weekday 2 to 6 months away, avoiding Christmas and New Year. */
function pickDay() {
  const days: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60);
  for (let i = 0; i < 120; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const md = iso.slice(5);
    if (d.getUTCDay() % 6 === 0 || md >= "12-20" || md <= "01-05") continue;
    days.push(iso);
  }
  return days[Math.floor(Math.random() * days.length)];
}

test("HR posts an open shift, the first person to accept gets it, nobody else can", async ({
  browser,
}) => {
  const day = pickDay();

  // Harper (HR) posts a night shift to Jamie and Morgan.
  const hrCtx = await browser.newContext(as("bwHr"));
  const hr = await hrCtx.newPage();
  await hr.goto(`/rota?week=${day}`);
  await expect(hr.getByRole("heading", { name: "Rota", exact: true })).toBeVisible();
  const post = hr
    .locator("form")
    .filter({ has: hr.getByRole("button", { name: "Post open shift" }) });
  await expect(post.getByRole("button", { name: "Post open shift" })).toBeEnabled();
  await post.getByLabel("Date").fill(day);
  await post.getByLabel("Starts").fill("20:00");
  await post.getByLabel("Ends").fill("05:00");
  await post.getByLabel("Role or area").fill("Night cover e2e");
  await post.getByLabel("Send to a group").selectOption("");
  await post.getByLabel("Jamie Crumb").check();
  await post.getByLabel("Morgan Bakewell").check();
  await post.getByRole("button", { name: "Post open shift" }).click();
  await expect(hr.getByText(/Open shift posted for .*20:00 to 05:00 \(next day\)/)).toBeVisible();

  // Jamie accepts first.
  const empCtx = await browser.newContext(as("bwEmployee"));
  const emp = await empCtx.newPage();
  await emp.goto("/shifts");
  const offer = emp.getByRole("listitem").filter({ hasText: "Night cover e2e" });
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Accept shift" }).click();
  await expect(emp.getByText("It's yours.")).toBeVisible();
  await emp.reload();
  await expect(
    emp
      .getByRole("listitem")
      .filter({ hasText: "Night cover e2e" })
      .filter({ hasText: "Open shift you picked up" }),
  ).toBeVisible();
  await empCtx.close();

  // Morgan can no longer accept it.
  const mgrCtx = await browser.newContext(as("bwManager"));
  const mgr = await mgrCtx.newPage();
  await mgr.goto("/shifts");
  const gone = mgr.getByRole("listitem").filter({ hasText: "Night cover e2e" });
  await expect(gone).toContainText("Already taken");
  await expect(gone.getByRole("button", { name: "Accept shift" })).toHaveCount(0);
  await mgrCtx.close();

  // It's on the rota under Jamie; Harper cancels it so the test leaves no shift behind.
  await hr.goto(`/rota?week=${day}`);
  await expect(hr.getByRole("row").filter({ hasText: "Jamie Crumb" })).toContainText("20:00–05:00");
  hr.on("dialog", (d) => d.accept());
  const mine = hr
    .getByRole("listitem")
    .filter({ hasText: "Jamie Crumb" })
    .filter({ hasText: "Night cover e2e" });
  await mine.getByRole("button", { name: "Cancel" }).click();
  await expect(hr.getByText("Shift cancelled.")).toBeVisible();
  await hrCtx.close();
});
