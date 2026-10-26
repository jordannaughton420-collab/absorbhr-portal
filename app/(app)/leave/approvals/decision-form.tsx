"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/form";
import { decideLeave } from "../actions";

export function DecisionForm({ requestId, label }: { requestId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const noteId = `note-${requestId}`;

  function decide(approve: boolean, form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set("request_id", requestId);
    fd.set("approve", String(approve));
    start(async () => {
      const res = await decideLeave(fd);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-1">
        <Label htmlFor={noteId} className="text-xs">
          Note to {label} <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id={noteId} name="decision_note" maxLength={500} className="h-9" />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={(e) => decide(true, e.currentTarget.form!)}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={(e) => decide(false, e.currentTarget.form!)}
        >
          Decline
        </Button>
      </div>
    </form>
  );
}
