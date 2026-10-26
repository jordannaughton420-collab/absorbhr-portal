import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand/auth-shell";
import { getContext } from "@/lib/auth/context";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Two-step verification · AbsorbHR Portal" };

export default async function MfaPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.aal === "aal2") redirect("/dashboard");

  return (
    <AuthShell
      title="Two-step verification"
      intro={
        ctx.hasMfaFactor
          ? "Enter the 6-digit code from your authenticator app."
          : "Your role can see sensitive HR data, so your account needs a second step at sign-in. Set up an authenticator app (such as Microsoft Authenticator or Google Authenticator) now."
      }
    >
      <MfaForm enrolled={ctx.hasMfaFactor} />
    </AuthShell>
  );
}
