"use client";

import * as React from "react";
import Link from "next/link";
import { ZodForm } from "@/components/forms/zod-form";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { loginSchema, magicLinkSchema } from "@/lib/validation/auth";
import { sendMagicLink, signInWithPassword } from "@/app/auth/actions";

export function LoginForms() {
  const [mode, setMode] = React.useState<"password" | "link">("password");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm"
      >
        {(
          [
            ["password", "Password"],
            ["link", "Email me a link"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded-md px-3 py-2 font-medium",
              mode === value ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <ZodForm
          schema={loginSchema}
          action={signInWithPassword}
          submitLabel="Sign in"
          pendingLabel="Signing in…"
          submitClassName="w-full"
        >
          {({ errors }) => (
            <>
              <Field name="email" label="Email" error={errors.email}>
                {(p) => <Input {...p} type="email" autoComplete="username" />}
              </Field>
              <Field name="password" label="Password" error={errors.password}>
                {(p) => <Input {...p} type="password" autoComplete="current-password" />}
              </Field>
              <p className="text-right text-sm">
                <Link
                  href="/forgot-password"
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  Forgotten your password?
                </Link>
              </p>
            </>
          )}
        </ZodForm>
      ) : (
        <ZodForm
          schema={magicLinkSchema}
          action={sendMagicLink}
          submitLabel="Send sign-in link"
          pendingLabel="Sending…"
          submitClassName="w-full"
        >
          {({ errors }) => (
            <Field
              name="email"
              label="Email"
              error={errors.email}
              hint="We'll email you a one-time link. Admin accounts will still be asked for their authenticator code."
            >
              {(p) => <Input {...p} type="email" autoComplete="username" />}
            </Field>
          )}
        </ZodForm>
      )}
    </div>
  );
}
