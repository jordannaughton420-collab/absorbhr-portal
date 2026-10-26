import type { Metadata } from "next";
import { AuthShell } from "@/components/brand/auth-shell";
import { Alert } from "@/components/ui/feedback";
import { LoginForms } from "./login-forms";

export const metadata: Metadata = { title: "Sign in · AbsorbHR Portal" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <AuthShell title="Sign in" intro="Use the email address your employer registered for you.">
      {reason === "timeout" && (
        <Alert variant="warning" className="mb-4">
          You were signed out after a period of inactivity to keep your data safe.
        </Alert>
      )}
      {reason === "link" && (
        <Alert variant="error" className="mb-4">
          That link has expired or was already used. Please request a new one.
        </Alert>
      )}
      <LoginForms />
    </AuthShell>
  );
}
