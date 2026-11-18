import type { Metadata } from "next";
import { AuthShell } from "@/components/brand/auth-shell";
import { getContext } from "@/lib/auth/context";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password · AbsorbHR Portal" };

export default async function ResetPasswordPage() {
  const ctx = await getContext();
  // Accounts with two-step verification must enter their code before the password can change.
  const needsCode = Boolean(ctx?.hasMfaFactor && ctx.aal !== "aal2");
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm needsCode={needsCode} />
    </AuthShell>
  );
}
