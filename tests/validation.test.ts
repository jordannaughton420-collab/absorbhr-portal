import { describe, expect, it } from "vitest";
import { newPasswordSchema, mfaCodeSchema } from "@/lib/validation/auth";
import { employeeSchema, personalSchema, rtwSchema, salarySchema } from "@/lib/validation/employee";
import { securitySettingsSchema } from "@/lib/validation/settings";

const baseEmployee = {
  first_name: "Test",
  last_name: "Person",
  start_date: "2025-01-06",
  contract_type: "permanent",
};

describe("password policy", () => {
  it("accepts a strong password", () =>
    expect(newPasswordSchema.safeParse("Correct-Horse-9").success).toBe(true));
  it.each(["Short1A", "alllowercase123", "ALLUPPERCASE123", "NoNumbersHereAtAll"])(
    "rejects %s",
    (pw) => expect(newPasswordSchema.safeParse(pw).success).toBe(false),
  );
});

describe("MFA code", () => {
  it("needs exactly six digits", () => {
    expect(mfaCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(mfaCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(mfaCodeSchema.safeParse({ code: "12a456" }).success).toBe(false);
  });
});

describe("employee record", () => {
  it("accepts the minimum required fields", () =>
    expect(employeeSchema.safeParse(baseEmployee).success).toBe(true));
  it("requires a leaving date for leavers", () =>
    expect(employeeSchema.safeParse({ ...baseEmployee, status: "leaver" }).success).toBe(false));
  it("rejects a leaving date before the start date", () =>
    expect(
      employeeSchema.safeParse({ ...baseEmployee, status: "leaver", end_date: "2024-01-01" })
        .success,
    ).toBe(false));
  it("only allows a fixed-term end date on fixed-term contracts", () => {
    expect(
      employeeSchema.safeParse({ ...baseEmployee, fixed_term_end_date: "2026-01-01" }).success,
    ).toBe(false);
    expect(
      employeeSchema.safeParse({
        ...baseEmployee,
        contract_type: "fixed_term",
        fixed_term_end_date: "2026-01-01",
      }).success,
    ).toBe(true);
  });
  it("lower-cases work email", () =>
    expect(
      employeeSchema.parse({ ...baseEmployee, work_email: "Test.Person@Example.COM" }).work_email,
    ).toBe("test.person@example.com"));
});

describe("personal details", () => {
  it("validates UK postcodes", () => {
    expect(personalSchema.safeParse({ postcode: "bs1 4dj" }).success).toBe(true);
    expect(personalSchema.safeParse({ postcode: "not a postcode" }).success).toBe(false);
  });
  it("allows every field to be empty (all optional)", () =>
    expect(personalSchema.safeParse({}).success).toBe(true));
});

describe("salary and right to work", () => {
  it("rejects negative pay", () =>
    expect(
      salarySchema.safeParse({ effective_date: "2025-04-01", amount: "-1", pay_basis: "annual" })
        .success,
    ).toBe(false));
  it("needs an expiry date for time-limited permission", () => {
    const check = {
      check_type: "online_share_code",
      checked_on: "2025-01-01",
      status: "time_limited",
    };
    expect(rtwSchema.safeParse(check).success).toBe(false);
    expect(rtwSchema.safeParse({ ...check, expiry_date: "2026-01-01" }).success).toBe(true);
  });
});

describe("company settings", () => {
  it("treats unticked boxes as off and limits the idle timeout", () => {
    const parsed = securitySettingsSchema.parse({ session_idle_minutes: "30" });
    expect(parsed.require_mfa_for_all).toBe(false);
    expect(securitySettingsSchema.safeParse({ session_idle_minutes: "2" }).success).toBe(false);
  });
});
