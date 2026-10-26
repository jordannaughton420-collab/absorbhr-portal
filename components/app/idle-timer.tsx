"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";

const WARNING_MS = 2 * 60 * 1000;
const STORAGE_KEY = "absorbhr:last-activity";
const EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

function readShared(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(t: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(t));
  } catch {
    /* storage unavailable: per-tab timing still works */
  }
}

// Signs the user out after a period of inactivity (company setting), with a
// 2-minute warning. Activity in any open tab counts.
export function IdleTimer({ idleMinutes }: { idleMinutes: number }) {
  const idleMs = idleMinutes * 60 * 1000;
  const lastActivity = React.useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const stayButton = React.useRef<HTMLButtonElement>(null);
  const signingOut = React.useRef(false);

  const markActive = React.useCallback(() => {
    lastActivity.current = Date.now();
    writeShared(lastActivity.current);
  }, []);

  React.useEffect(() => {
    markActive();
    let throttle = 0;
    const onActivity = () => {
      if (secondsLeft !== null) return; // while warning shows, only the button keeps the session
      const now = Date.now();
      if (now - throttle > 5000) {
        throttle = now;
        markActive();
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = window.setInterval(() => {
      const last = Math.max(lastActivity.current, readShared());
      const remaining = idleMs - (Date.now() - last);
      if (remaining <= 0 && !signingOut.current) {
        signingOut.current = true;
        void signOut("timeout");
      } else if (remaining <= WARNING_MS) {
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(tick);
    };
  }, [idleMs, markActive, secondsLeft]);

  React.useEffect(() => {
    if (secondsLeft !== null) stayButton.current?.focus();
  }, [secondsLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (secondsLeft === null) return null;
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-desc"
        className="w-full max-w-sm rounded-xl bg-card p-6 shadow-lg"
      >
        <h2 id="idle-title" className="text-lg font-semibold">
          Are you still there?
        </h2>
        <p id="idle-desc" className="mt-2 text-sm text-muted-foreground">
          For security, you&apos;ll be signed out in{" "}
          <span className="font-semibold text-foreground">
            {mins}:{secs}
          </span>
          .
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            ref={stayButton}
            onClick={() => {
              markActive();
              setSecondsLeft(null);
            }}
          >
            Stay signed in
          </Button>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out now
          </Button>
        </div>
      </div>
    </div>
  );
}
