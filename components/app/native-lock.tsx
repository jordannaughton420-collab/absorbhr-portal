"use client";

import * as React from "react";
import { LockKeyhole } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";
import { nativeApp } from "@/lib/native";

/** Away for longer than this and the app asks for Face ID / fingerprint again. */
const RELOCK_AFTER_MS = 2 * 60 * 1000;
const UNLOCKED_KEY = "absorbhr:app-unlocked";

// Phone app only: covers the portal with a lock screen when the app opens, and when it comes
// back after a couple of minutes in the background, until Face ID, fingerprint or the phone's
// passcode is used. Does nothing in a normal web browser.
export function NativeLock() {
  const [locked, setLocked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const hiddenAt = React.useRef<number | null>(null);

  const unlock = React.useCallback(async () => {
    const bio = nativeApp()?.Plugins?.BiometricAuthNative;
    if (!bio) return setLocked(false);
    setBusy(true);
    setError(null);
    try {
      await bio.internalAuthenticate({
        reason: "Unlock AbsorbHR",
        cancelTitle: "Cancel",
        allowDeviceCredential: true,
        androidTitle: "Unlock AbsorbHR",
        androidConfirmationRequired: false,
      });
      try {
        sessionStorage.setItem(UNLOCKED_KEY, "1");
      } catch {
        /* storage unavailable: the app will ask again next time */
      }
      setLocked(false);
    } catch {
      setError("Not unlocked. Try again, or sign out.");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    const cap = nativeApp();
    const bio = cap?.Plugins?.BiometricAuthNative;
    if (!cap || !bio) return;
    let cancelled = false;
    let listener: { remove?: () => unknown } | undefined;

    (async () => {
      const info = await bio.checkBiometry().catch(() => null);
      // A phone with no Face ID, fingerprint or passcode can't be locked this way.
      if (cancelled || !info || !(info.isAvailable || info.deviceIsSecure)) return;

      let unlockedThisLaunch = false;
      try {
        unlockedThisLaunch = sessionStorage.getItem(UNLOCKED_KEY) === "1";
      } catch {
        /* treat as a fresh launch */
      }
      if (!unlockedThisLaunch) {
        setLocked(true);
        void unlock();
      }

      listener = await cap.Plugins?.App?.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          hiddenAt.current = Date.now();
          return;
        }
        const away = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setLocked(true);
          void unlock();
        }
      });
    })();

    return () => {
      cancelled = true;
      void listener?.remove?.();
    };
  }, [unlock]);

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-title"
      className="brand-surface on-brand fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <Logo variant="white" height={30} />
      <div className="grid size-16 place-items-center rounded-2xl border border-white/20 bg-white/10">
        <LockKeyhole className="size-8" aria-hidden="true" />
      </div>
      <div>
        <h2 id="app-lock-title" className="text-2xl font-extrabold tracking-tight">
          AbsorbHR is locked
        </h2>
        <p className="mt-2 text-white/80">Use Face ID, your fingerprint or your passcode.</p>
        {error && (
          <p role="alert" className="mt-3 font-semibold text-white">
            {error}
          </p>
        )}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button
          type="button"
          onClick={() => void unlock()}
          disabled={busy}
          className="h-12 bg-white bg-none text-primary shadow-none hover:bg-white"
        >
          Unlock
        </Button>
        <form action={() => signOut()}>
          <Button type="submit" variant="onBrand" className="h-12 w-full">
            Sign out instead
          </Button>
        </form>
      </div>
    </div>
  );
}
