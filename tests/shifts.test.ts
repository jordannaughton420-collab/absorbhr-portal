import { describe, expect, it } from "vitest";
import {
  addDays,
  londonMidnightIso,
  londonTime,
  mondayOf,
  shiftWhen,
  shiftWhenFromParts,
} from "@/lib/shifts";
import { createShiftSchema, openShiftSchema } from "@/lib/validation/shifts";
import { ACTION_SCHEMAS, allowedFor } from "@/lib/assistant/schemas";

const A = "a0000000-0000-4000-8000-000000000001";
const G = "a0000000-0000-4000-8000-000000000002";

describe("shift times are UK time", () => {
  it("shows an overnight shift as ending the next day", () =>
    expect(shiftWhen("2027-03-10T20:00:00Z", "2027-03-11T05:00:00Z")).toBe(
      "Wed 10 Mar 2027, 20:00 to 05:00 (next day)",
    ));
  it("allows for British Summer Time", () =>
    expect(londonTime("2027-07-01T19:00:00Z")).toBe("20:00"));
  it("words form times the same way", () =>
    expect(shiftWhenFromParts("2027-03-10", "20:00", "05:00")).toBe(
      "Wed 10 Mar 2027, 20:00 to 05:00 (next day)",
    ));
  it("finds UK midnight in winter and summer", () => {
    expect(londonMidnightIso("2027-01-15")).toBe("2027-01-15T00:00:00.000Z");
    expect(londonMidnightIso("2027-07-15")).toBe("2027-07-14T23:00:00.000Z");
  });
  it("starts weeks on Monday", () => {
    expect(mondayOf("2027-03-14")).toBe("2027-03-08"); // a Sunday
    expect(mondayOf("2027-03-08")).toBe("2027-03-08");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });
});

describe("shift forms are checked", () => {
  it("accepts an 8pm to 5am shift", () =>
    expect(
      createShiftSchema.safeParse({
        employee_id: A,
        date: "2027-03-10",
        start_time: "20:00",
        end_time: "05:00",
      }).success,
    ).toBe(true));
  it("rejects a shift that starts and ends at the same time", () =>
    expect(
      createShiftSchema.safeParse({
        employee_id: A,
        date: "2027-03-10",
        start_time: "09:00",
        end_time: "09:00",
      }).success,
    ).toBe(false));
  it("rejects times that aren't 24-hour times", () =>
    expect(
      createShiftSchema.safeParse({
        employee_id: A,
        date: "2027-03-10",
        start_time: "8pm",
        end_time: "05:00",
      }).success,
    ).toBe(false));
  it("needs a group or at least one person for an open shift", () => {
    const base = { date: "2027-03-10", start_time: "20:00", end_time: "05:00" };
    expect(openShiftSchema.safeParse(base).success).toBe(false);
    expect(openShiftSchema.safeParse({ ...base, group_id: G }).success).toBe(true);
    expect(openShiftSchema.safeParse({ ...base, employee_ids: A }).success).toBe(true);
    expect(ACTION_SCHEMAS.post_open_shift.safeParse(base).success).toBe(false);
    expect(ACTION_SCHEMAS.post_open_shift.safeParse({ ...base, employee_ids: [A] }).success).toBe(
      true,
    );
  });
});

describe("who can plan shifts through the assistant", () => {
  it("lets HR plan shifts and manage groups", () => {
    const hr = { isHr: true, isManager: false };
    expect(allowedFor("post_open_shift", hr)).toBe(true);
    expect(allowedFor("add_to_shift_group", hr)).toBe(true);
  });
  it("lets managers plan only when the company allows it, and never manage groups", () => {
    expect(allowedFor("post_open_shift", { isHr: false, isManager: true })).toBe(false);
    const allowed = { isHr: false, isManager: true, canPlanShifts: true };
    expect(allowedFor("post_open_shift", allowed)).toBe(true);
    expect(allowedFor("create_shift", allowed)).toBe(true);
    expect(allowedFor("add_to_shift_group", allowed)).toBe(false);
  });
  it("never lets employees plan shifts", () =>
    expect(allowedFor("create_shift", { isHr: false, isManager: false, canPlanShifts: true })).toBe(
      false,
    ));
  it("has no way to accept an open shift for someone", () =>
    expect(Object.keys(ACTION_SCHEMAS)).not.toContain("claim_open_shift"));
});
