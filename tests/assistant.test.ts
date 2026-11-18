import { describe, expect, it } from "vitest";
import {
  ACTION_SCHEMAS,
  allowedFor,
  dateRange,
  isActionKind,
  looksPersonal,
} from "@/lib/assistant/schemas";
import { assistantSettingsSchema } from "@/lib/validation/settings";

const A = "a0000000-0000-4000-8000-000000000001";
const B = "a0000000-0000-4000-8000-000000000002";
const employee = { isHr: false, isManager: false };
const manager = { isHr: false, isManager: true };
const hr = { isHr: true, isManager: false };

describe("who can confirm which suggestions", () => {
  it("lets anyone book or cancel leave and save a company note", () => {
    for (const kind of ["request_leave", "cancel_leave", "remember"] as const)
      expect(allowedFor(kind, employee)).toBe(true);
  });
  it("keeps approvals and sickness to managers and HR", () => {
    expect(allowedFor("decide_leave", employee)).toBe(false);
    expect(allowedFor("record_sickness", employee)).toBe(false);
    expect(allowedFor("decide_leave", manager)).toBe(true);
    expect(allowedFor("record_sickness", hr)).toBe(true);
  });
  it("keeps employee records and checklists to HR", () => {
    for (const kind of ["create_employee", "update_employee", "start_checklist"] as const) {
      expect(allowedFor(kind, manager)).toBe(false);
      expect(allowedFor(kind, hr)).toBe(true);
    }
  });
  it("knows only its own kinds of change", () => {
    expect(isActionKind("request_leave")).toBe(true);
    expect(isActionKind("delete_employee")).toBe(false);
  });
});

describe("suggestion details are checked", () => {
  it("accepts a normal leave booking", () =>
    expect(
      ACTION_SCHEMAS.request_leave.safeParse({
        employee_id: A,
        leave_type_id: B,
        start_date: "2026-12-22",
        end_date: "2026-12-24",
        half_day_start: false,
        half_day_end: false,
      }).success,
    ).toBe(true));
  it("rejects leave that ends before it starts", () =>
    expect(
      ACTION_SCHEMAS.request_leave.safeParse({
        employee_id: A,
        leave_type_id: B,
        start_date: "2026-12-24",
        end_date: "2026-12-22",
      }).success,
    ).toBe(false));
  it("rejects made-up ids", () =>
    expect(ACTION_SCHEMAS.cancel_leave.safeParse({ request_id: "jamie" }).success).toBe(false));
  it("has no way to record a sickness reason", () => {
    const parsed = ACTION_SCHEMAS.record_sickness.safeParse({
      employee_id: A,
      start_date: "2026-11-18",
      reason_category: "mental_health",
      notes: "private",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("reason_category");
    expect(parsed.data).not.toHaveProperty("notes");
  });
  it("only changes job title, department, location or manager", () => {
    const parsed = ACTION_SCHEMAS.update_employee.safeParse({
      employee_id: A,
      job_title: "Head Baker",
      salary: 99999,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("salary");
  });
  it("refuses an update that changes nothing", () =>
    expect(ACTION_SCHEMAS.update_employee.safeParse({ employee_id: A }).success).toBe(false));
  it("refuses making someone their own manager", () =>
    expect(ACTION_SCHEMAS.update_employee.safeParse({ employee_id: A, manager_id: A }).success).toBe(
      false,
    ));
});

describe("company notes stay general", () => {
  it("allows company knowledge", () => {
    expect(looksPersonal("Holiday requests need two weeks notice")).toBe(false);
    expect(looksPersonal("We call departments teams")).toBe(false);
  });
  it("flags notes about health, conduct or pay", () => {
    expect(looksPersonal("Jamie is off with depression")).toBe(true);
    expect(looksPersonal("Sam has a disciplinary next week")).toBe(true);
    expect(looksPersonal("Morgan's salary is going up")).toBe(true);
  });
});

describe("dates on the confirm card", () => {
  it("shows a range in UK style", () =>
    expect(dateRange("2026-12-22", "2026-12-24")).toBe("Tue 22 Dec 2026 to Thu 24 Dec 2026"));
  it("shows half days", () =>
    expect(dateRange("2026-12-24", "2026-12-24", false, true)).toBe("Thu 24 Dec 2026 (morning only)"));
  it("handles an unknown return date", () =>
    expect(dateRange("2026-11-18", undefined)).toBe(
      "from Wed 18 Nov 2026, return date not known yet",
    ));
});

describe("assistant settings", () => {
  it("accepts the offered retention periods", () =>
    expect(
      assistantSettingsSchema.safeParse({ assistant_enabled: "on", assistant_chat_retention_months: "72" })
        .success,
    ).toBe(true));
  it("rejects anything longer than 6 years", () =>
    expect(
      assistantSettingsSchema.safeParse({ assistant_chat_retention_months: "100" }).success,
    ).toBe(false));
});
