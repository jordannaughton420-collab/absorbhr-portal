"use client";

import { AuthShell } from "@/components/brand/auth-shell";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input } from "@/components/ui/form";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { updatePassword } from "@/app/auth/actions";

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <ZodForm
        schema={resetPasswordSchema}
        action={updatePassword}
        submitLabel="Save password"
        submitClassName="w-full"
      >
        {({ errors }) => (
          <>
            <Field
              name="password"
              label="New password"
              error={errors.password}
              hint="At least 12 characters, with an uppercase letter, a lowercase letter and a number."
            >
              {(p) => <Input {...p} type="password" autoComplete="new-password" />}
            </Field>
            <Field name="confirm" label="Confirm new password" error={errors.confirm}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" />}
            </Field>
          </>
        )}
      </ZodForm>
    </AuthShell>
  );
}
