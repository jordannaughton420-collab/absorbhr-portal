// The Face ID / fingerprint lock in the phone app (components/app/native-lock.tsx).
// Chrome pretends to be the app by adding a fake `window.Capacitor` bridge before the page loads.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, as } from "./fixtures";

const FAKE_APP_BRIDGE = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__authCalls = 0;
  w.__authWorks = false; // the first automatic prompt is "cancelled"
  w.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    Plugins: {
      BiometricAuthNative: {
        checkBiometry: async () => ({ isAvailable: true, deviceIsSecure: true }),
        internalAuthenticate: async () => {
          w.__authCalls = (w.__authCalls as number) + 1;
          if (!w.__authWorks) throw new Error("userCancel");
        },
      },
      App: {
        addListener: (_event: string, cb: (s: { isActive: boolean }) => void) => {
          w.__appState = cb;
          return { remove: () => undefined };
        },
      },
    },
  };
};

test.describe("phone app lock", () => {
  test.use(as("bwEmployee"));

  test("a normal web browser never sees the lock", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Hello/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "AbsorbHR is locked" })).toHaveCount(0);
  });

  test("the app opens locked, unlocks, and locks again after time away", async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(FAKE_APP_BRIDGE);
    await page.goto("/dashboard");

    const lock = page.getByRole("dialog", { name: "AbsorbHR is locked" });
    await expect(lock).toBeVisible();
    await expect(lock.getByRole("alert")).toContainText("Not unlocked");
    const { violations } = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);

    await page.evaluate(() => ((window as unknown as Record<string, unknown>).__authWorks = true));
    await lock.getByRole("button", { name: "Unlock" }).click();
    await expect(lock).toHaveCount(0);

    // A quick switch away doesn't lock it again...
    const switchAway = async (minutes: string) => {
      await page.evaluate(() =>
        (window as unknown as { __appState: (s: { isActive: boolean }) => void }).__appState({
          isActive: false,
        }),
      );
      await page.clock.fastForward(minutes);
      await page.evaluate(() =>
        (window as unknown as { __appState: (s: { isActive: boolean }) => void }).__appState({
          isActive: true,
        }),
      );
    };
    await switchAway("00:30");
    await expect(lock).toHaveCount(0);

    // ...but three minutes away does, and it asks for Face ID straight away.
    const callsBefore = await page.evaluate(
      () => (window as unknown as Record<string, number>).__authCalls,
    );
    await switchAway("03:00");
    await expect(lock).toHaveCount(0); // the fake Face ID now succeeds at once
    const callsAfter = await page.evaluate(
      () => (window as unknown as Record<string, number>).__authCalls,
    );
    expect(callsAfter).toBe(callsBefore + 1);
  });
});
