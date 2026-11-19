import { describe, expect, it } from "vitest";
import { ACTION_SCHEMAS, ACTION_KINDS, allowedFor } from "@/lib/assistant/schemas";

const A = "a0000000-0000-4000-8000-000000000001";
const employee = { isHr: false, isManager: false, isClientAdmin: false };
const manager = { isHr: false, isManager: true, isClientAdmin: false };
const hr = { isHr: true, isManager: false, isClientAdmin: false };
const admin = { isHr: true, isManager: false, isClientAdmin: true };

describe("everyday admin jobs follow each role's own permissions", () => {
  it("keeps portal access, roles, departments and locations to the Client Admin", () => {
    for (const kind of [
      "invite_to_portal",
      "change_role",
      "add_department",
      "add_location",
    ] as const) {
      expect(allowedFor(kind, hr)).toBe(false);
      expect(allowedFor(kind, manager)).toBe(false);
      expect(allowedFor(kind, admin)).toBe(true);
    }
  });
  it("keeps holiday adjustments, leavers and publishing policies to HR", () => {
    for (const kind of ["adjust_holiday", "mark_leaver", "publish_policy"] as const) {
      expect(allowedFor(kind, manager)).toBe(false);
      expect(allowedFor(kind, hr)).toBe(true);
    }
  });
  it("lets managers record a return from sickness and start reviews, not employees", () => {
    for (const kind of ["end_sickness", "start_review"] as const) {
      expect(allowedFor(kind, employee)).toBe(false);
      expect(allowedFor(kind, manager)).toBe(true);
    }
  });
  it("lets anyone suggest ticking a checklist task (the database checks it's theirs)", () =>
    expect(allowedFor("complete_checklist_task", employee)).toBe(true));
  it("still has no way into cases, pay, right-to-work, diversity or data-protection tools", () => {
    for (const word of [
      "case",
      "salary",
      "pay",
      "right_to_work",
      "rtw",
      "diversity",
      "sar",
      "anonymise",
      "breach",
    ])
      expect(ACTION_KINDS.some((k) => k.includes(word))).toBe(false);
  });
});

describe("their details are checked", () => {
  it("only accepts whole or half days for a holiday adjustment, and never zero", () => {
    const base = { employee_id: A, reason: "Time off in lieu" };
    expect(ACTION_SCHEMAS.adjust_holiday.safeParse({ ...base, days: 1.5 }).success).toBe(true);
    expect(ACTION_SCHEMAS.adjust_holiday.safeParse({ ...base, days: -2 }).success).toBe(true);
    expect(ACTION_SCHEMAS.adjust_holiday.safeParse({ ...base, days: 0 }).success).toBe(false);
    expect(ACTION_SCHEMAS.adjust_holiday.safeParse({ ...base, days: 0.3 }).success).toBe(false);
  });
  it("only accepts the portal's four roles", () => {
    expect(
      ACTION_SCHEMAS.change_role.safeParse({ employee_id: A, role: "hr_manager" }).success,
    ).toBe(true);
    expect(
      ACTION_SCHEMAS.change_role.safeParse({ employee_id: A, role: "superuser" }).success,
    ).toBe(false);
  });
  it("needs a real date for a leaver", () =>
    expect(ACTION_SCHEMAS.mark_leaver.safeParse({ employee_id: A, end_date: "soon" }).success).toBe(
      false,
    ));
});
