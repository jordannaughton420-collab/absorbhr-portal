import { test, expect, as } from "./fixtures";

// The assistant's speak button needs the microphone. It used to be blocked on every page,
// so speech-to-text stopped the moment it started.
test("the microphone is allowed on the assistant page and nowhere else", async ({ browser }) => {
  const ctx = await browser.newContext(as("bwEmployee"));
  const page = await ctx.newPage();
  const allowed = () =>
    page.evaluate(() => {
      const d = document as unknown as {
        permissionsPolicy?: { allowsFeature: (f: string) => boolean };
        featurePolicy?: { allowsFeature: (f: string) => boolean };
      };
      return (d.permissionsPolicy ?? d.featurePolicy)?.allowsFeature("microphone") ?? null;
    });

  const assistant = await page.goto("/assistant");
  expect(assistant?.headers()["permissions-policy"]).toContain("microphone=(self)");
  expect(await allowed()).toBe(true);

  const dashboard = await page.goto("/dashboard");
  expect(dashboard?.headers()["permissions-policy"]).toContain("microphone=()");
  expect(await allowed()).toBe(false);
  await ctx.close();
});
