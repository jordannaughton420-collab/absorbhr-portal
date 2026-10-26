"use client";

import * as React from "react";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { mfaCodeSchema } from "@/lib/validation/auth";
import { signOut, startMfaEnrolment, verifyMfa } from "@/app/auth/actions";

type Enrolment = { factorId: string; qrCode: string; secret: string };

export function MfaForm({ enrolled }: { enrolled: boolean }) {
  const [enrolment, setEnrolment] = React.useState<Enrolment | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (enrolled || started.current) return;
    started.current = true;
    startLoading(async () => {
      const res = await startMfaEnrolment();
      if (res.ok && res.data) setEnrolment(res.data);
      else if (!res.ok) setError(res.error);
    });
  }, [enrolled]);

  return (
    <div className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}

      {!enrolled && (
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li>Open your authenticator app and choose to add an account.</li>
          <li>
            Scan this QR code:
            <div className="mt-2 flex justify-center rounded-lg border bg-white p-3">
              {enrolment ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase
                <img src={enrolment.qrCode} alt="QR code to add AbsorbHR Portal to your authenticator app" width={180} height={180} />
              ) : (
                <p className="py-16 text-muted-foreground" aria-live="polite">
                  {loading ? "Preparing your QR code…" : " "}
                </p>
              )}
            </div>
            {enrolment && (
              <details className="mt-2">
                <summary className="cursor-pointer text-primary">Can&apos;t scan? Enter a setup key instead</summary>
                <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">{enrolment.secret}</code>
              </details>
            )}
          </li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
      )}

      {(enrolled || enrolment) && (
        <ZodForm schema={mfaCodeSchema} action={verifyMfa} submitLabel="Verify" pendingLabel="Checking…" submitClassName="w-full">
          {({ errors }) => (
            <>
              {enrolment && <input type="hidden" name="factorId" value={enrolment.factorId} />}
              <Field name="code" label="6-digit code" error={errors.code}>
                {(p) => (
                  <Input
                    {...p}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]*"
                    className="text-center text-lg tracking-[0.5em]"
                  />
                )}
              </Field>
            </>
          )}
        </ZodForm>
      )}

      <form action={() => signOut()}>
        <Button type="submit" variant="link" className="h-auto p-0">
          Sign out instead
        </Button>
      </form>
    </div>
  );
}
