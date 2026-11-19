"use client";

import type { ChatCard } from "@/lib/assistant/history";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { cancelAction, confirmAction } from "./actions";

export type ActionCardData = ChatCard;

const STATUS = {
  pending: { label: "Waiting for you", variant: "warning" },
  running: { label: "In progress", variant: "muted" },
  done: { label: "Done", variant: "success" },
  failed: { label: "Not done", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "muted" },
  expired: { label: "Expired", variant: "muted" },
} as const;

export function ActionCard({
  action,
  onChange,
}: {
  action: ActionCardData;
  /** Called after Confirm or Cancel, e.g. so the corner panel can reload. */
  onChange?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const status = action.expired ? "expired" : action.status;
  const badge = STATUS[status];
  const canDecide = status === "pending" && !outcome;

  function confirm() {
    startTransition(async () => {
      const r = await confirmAction(action.id);
      setOutcome(
        r.ok
          ? { ok: true, text: r.message ?? "Done.", link: r.data?.link }
          : { ok: false, text: r.error },
      );
      router.refresh();
      onChange?.();
    });
  }

  function cancel() {
    startTransition(async () => {
      const r = await cancelAction(action.id);
      setOutcome({ ok: r.ok, text: r.ok ? (r.message ?? "Cancelled.") : r.error });
      router.refresh();
      onChange?.();
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card p-4 text-sm",
        canDecide ? "border-primary" : "border-border",
      )}
      aria-label="Suggested change"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested change
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p className="font-medium">{action.summary}</p>

      {canDecide && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Check the details. Tapping Confirm makes this change in your name, and it&apos;s
            recorded in the audit log.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={confirm} disabled={pending}>
              <Check aria-hidden="true" /> {pending ? "Working…" : "Confirm"}
            </Button>
            <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
              <X aria-hidden="true" /> Cancel
            </Button>
          </div>
        </>
      )}

      {(outcome || action.resultMessage) && (
        <p
          className={cn(
            "mt-2",
            (outcome ? outcome.ok : action.status === "done") ? "text-success" : "text-destructive",
          )}
          role="status"
        >
          {outcome?.text ?? action.resultMessage}{" "}
          {outcome?.link && (
            <Link href={outcome.link} className="font-medium underline underline-offset-4">
              View
            </Link>
          )}
        </p>
      )}
      {status === "expired" && !outcome && (
        <p className="mt-2 text-muted-foreground">
          Suggestions expire after 24 hours. Ask again if you still need this.
        </p>
      )}
    </div>
  );
}
