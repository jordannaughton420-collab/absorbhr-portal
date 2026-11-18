"use client";

import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input } from "@/components/ui/form";
import { resetPasswordSchema, resetPasswordWithCodeSchema } from "@/lib/validation/auth";
import { updatePassword } from "@/app/auth/actions";

export function ResetPasswordForm({ needsCode }: { needsCode: boolean }) {
  return (
    <ZodForm
      schema={needsCode ? resetPasswordWithCodeSchema : resetPasswordSchema}
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
          {needsCode && (
            <Field
              name="code"
              label="6-digit code from your authenticator app"
              hint="Your account uses two-step verification, so the code is needed to change the password."
              error={errors.code}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]*"
                />
              )}
            </Field>
          )}
        </>
      )}
    </ZodForm>
  );
}
