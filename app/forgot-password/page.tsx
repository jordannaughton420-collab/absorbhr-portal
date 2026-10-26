"use client";

import Link from "next/link";
import { AuthShell } from "@/components/brand/auth-shell";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input } from "@/components/ui/form";
import { magicLinkSchema } from "@/lib/validation/auth";
import { sendPasswordReset } from "@/app/auth/actions";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      intro="Enter your email and we'll send you a link to choose a new password."
    >
      <ZodForm
        schema={magicLinkSchema}
        action={sendPasswordReset}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
        submitClassName="w-full"
      >
        {({ errors }) => (
          <Field name="email" label="Email" error={errors.email}>
            {(p) => <Input {...p} type="email" autoComplete="username" />}
          </Field>
        )}
      </ZodForm>
      <p className="mt-4 text-sm">
        <Link
          href="/login"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
