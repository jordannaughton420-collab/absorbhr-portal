import { z } from "zod";

// Shared by browser forms and server actions.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .max(254, "Email address is too long")
  .email("Enter a valid email address");

// Mirrors the Supabase Auth policy (12+ chars, upper, lower, digit).
export const newPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use 128 characters or fewer")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const magicLinkSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});
