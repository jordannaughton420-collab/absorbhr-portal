"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { fieldErrors, formToObject } from "@/lib/validation/form";
import type { ActionResult } from "@/lib/errors";

type RenderProps = { errors: Record<string, string>; pending: boolean };

type ZodFormProps = {
  schema: z.ZodType;
  action: (formData: FormData) => Promise<ActionResult<unknown> | void>;
  children: (props: RenderProps) => React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (result: ActionResult<unknown>) => void;
  className?: string;
  submitClassName?: string;
};

// Validates with the same Zod schema the server uses, then calls the server action
// (which validates again — the browser check is for convenience, not security).
export function ZodForm({
  schema,
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  successMessage,
  resetOnSuccess,
  onSuccess,
  className,
  submitClassName,
}: ZodFormProps) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFormError(null);
    setMessage(null);

    const parsed = schema.safeParse(formToObject(formData));
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const first = Object.keys(errs)[0];
      form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});

    startTransition(async () => {
      const result = await action(formData);
      if (!result) return; // the action redirected
      if (result.ok) {
        setMessage(result.message ?? successMessage ?? null);
        if (resetOnSuccess) form.reset();
        onSuccess?.(result);
        router.refresh();
      } else {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      <div className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}
        {message && <Alert variant="success">{message}</Alert>}
        {children({ errors, pending })}
        <Button type="submit" disabled={pending} className={submitClassName}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
