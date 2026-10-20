import { describe, expect, it } from "vitest";
import {
  ALL_DAYS, WEEKDAYS, addMonths, balanceAfterJob, can, defaultPaid, diffDays, formatPence,
  grossFromNet, isAllowed, lateness, maskFromDays, netFromGross, nextAllowed, nextDebtSince,
  nextDueDate, projectOccurrences, revisePrice, RolePresets, splitTip, toPence, weekday,
  type Recurrence,
} from "../src";

describe("money", () => {
  it("parses and formats pounds as integer pence", () => {
    expect(toPence("15.45")).toBe(1545);
    expect(toPence("£1,200.5")).toBe(120050);
    expect(toPence("-3")).toBe(-300);
    expect(toPence("")).toBe(0);
    expect(formatPence(-1505)).toBe("-£15.05");
    expect(formatPence(2261300)).toBe("£22,613.00");
    expect(() => toPence("abc")).toThrow();
  });

  it("converts between net and gross at a VAT rate", () => {
    expect(grossFromNet(1000, 0.2)).toBe(1200);
    expect(netFromGross(1200, 0.2)).toBe(1000);
    expect(netFromGross(1500, 0.2)).toBe(1250);
  });
});

describe("dates", () => {
  it("clamps month arithmetic to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("computes weekdays and differences in UTC", () => {
    expect(weekday("2026-10-20")).toBe(2); // Tuesday
    expect(diffDays("2026-10-20", "2026-11-17")).toBe(28);
  });
});

describe("allowed days", () => {
  it("treats an empty mask as every day", () => {
    expect(maskFromDays([])).toBe(ALL_DAYS);
  });
  it("moves a weekend date to Monday for a weekdays-only job", () => {
    expect(isAllowed(WEEKDAYS, "2026-10-24")).toBe(false); // Saturday
    expect(nextAllowed(WEEKDAYS, "2026-10-24")).toBe("2026-10-26");
  });
});

const fourWeekly: Recurrence = {
  regularity: "regularly", timesPerPeriod: 1, numPeriods: 4, periodUnit: "week", allowedDays: ALL_DAYS,
};

describe("recurrence", () => {
  it("schedules 4-weekly jobs 28 days apart", () => {
    expect(nextDueDate(fourWeekly, "2026-10-20")).toBe("2026-11-17");
  });
  it("spreads twice-weekly visits evenly", () => {
    expect(nextDueDate({ ...fourWeekly, timesPerPeriod: 2, numPeriods: 1 }, "2026-10-20")).toBe("2026-10-24");
  });
  it("respects allowed days", () => {
    // 2026-11-14 is a Saturday; weekdays-only pushes to Monday.
    expect(nextDueDate({ ...fourWeekly, allowedDays: WEEKDAYS }, "2026-10-17")).toBe("2026-11-16");
  });
  it("handles monthly rules: last day and nth weekday", () => {
    const monthly: Recurrence = { ...fourWeekly, numPeriods: 1, periodUnit: "month" };
    expect(nextDueDate({ ...monthly, monthRule: { kind: "day_of_month", day: 31 } }, "2026-01-31")).toBe("2026-02-28");
    // First Monday of November 2026 is the 2nd.
    expect(nextDueDate({ ...monthly, monthRule: { kind: "nth_weekday", nth: 1, weekday: 1 } }, "2026-10-05")).toBe("2026-11-02");
    // Last Friday of November 2026 is the 27th.
    expect(nextDueDate({ ...monthly, monthRule: { kind: "nth_weekday", nth: 5, weekday: 5 } }, "2026-10-30")).toBe("2026-11-27");
  });
  it("never auto-plans one-off or on-request jobs", () => {
    expect(nextDueDate({ ...fourWeekly, regularity: "one_off" }, "2026-10-20")).toBeNull();
    expect(nextDueDate({ ...fourWeekly, regularity: "on_request" }, "2026-10-20")).toBeNull();
  });
  it("projects occurrences within a planner window", () => {
    expect(projectOccurrences(fourWeekly, "2026-10-20", "2026-10-01", "2026-12-31"))
      .toEqual(["2026-10-20", "2026-11-17", "2026-12-15"]);
  });
  it("measures lateness as a fraction of the interval", () => {
    expect(lateness(fourWeekly, "2026-10-20", "2026-11-03")).toBe(0.5);
    expect(lateness(fourWeekly, "2026-10-20", "2026-10-13")).toBe(-0.25);
  });
});

describe("balances", () => {
  it("applies a job and payment to the balance (negative = owes)", () => {
    expect(balanceAfterJob(0, 1500, 0, 0)).toBe(-1500);
    expect(balanceAfterJob(-500, 1500, 2000, 0)).toBe(0);
    expect(balanceAfterJob(0, 1500, 2000, 500)).toBe(0); // £5 tip
    expect(balanceAfterJob(-1500, 0, 0, -1500)).toBe(0); // bad-debt write-off
  });
  it("defaults paid to the job price or the whole debt", () => {
    expect(defaultPaid(-500, 1500, "job_price")).toBe(1500);
    expect(defaultPaid(-500, 1500, "debt_balance")).toBe(2000);
    expect(defaultPaid(2000, 1500, "job_price")).toBe(0); // in credit
  });
  it("splits a tip out of the amount taken", () => {
    expect(splitTip(2000, 1500)).toEqual({ paid: 2000, tip: 500 });
  });
  it("keeps the original debt-since date while in debt", () => {
    expect(nextDebtSince(0, -1500, null, "2026-10-20")).toBe("2026-10-20");
    expect(nextDebtSince(-1500, -3000, "2026-09-01", "2026-10-20")).toBe("2026-09-01");
    expect(nextDebtSince(-1500, 0, "2026-09-01", "2026-10-20")).toBeNull();
  });
});

describe("price revisions", () => {
  const rule = { kind: "percentage" as const, amount: 0.03, roundTo: 50, minimumChange: 0 };
  it("rounds to the nearest step", () => {
    expect(revisePrice(1500, rule)).toBe(1550); // 15.45 -> 15.50
  });
  it("keeps the old price when the change is below the minimum", () => {
    expect(revisePrice(1500, { ...rule, minimumChange: 100 })).toBe(1500);
    expect(revisePrice(1550, { ...rule, minimumChange: 50 })).toBe(1600); // 15.97 -> 16.00
  });
  it("supports fixed changes", () => {
    expect(revisePrice(1500, { kind: "fixed", amount: 100, roundTo: 0, minimumChange: 0 })).toBe(1600);
  });
});

describe("permissions", () => {
  it("applies role presets", () => {
    expect(can(RolePresets.employee, "enter_payments")).toBe(true);
    expect(can(RolePresets.employee, "edit_settings")).toBe(false);
    expect(can(RolePresets.franchisee, "export_jobs")).toBe(false);
    expect(can(RolePresets.owner, "edit_settings")).toBe(true);
  });
});

import { haversine, optimiseRoute, routeLength } from "../src";
describe("route optimisation", () => {
  it("measures distance", () => {
    expect(Math.round(haversine({ lat: 53.8, lng: -1.55 }, { lat: 53.8, lng: -1.5 }) / 100)).toBe(33); // ~3.3 km
  });
  it("orders points along a line and beats the input order", () => {
    const pts = [0.04, 0.01, 0.03, 0.0, 0.02].map((d) => ({ lat: 53.8, lng: -1.5 + d }));
    const home = { lat: 53.8, lng: -1.51 };
    const order = optimiseRoute(pts, home, home);
    expect(order.map((i) => pts[i]!.lng)).toEqual([-1.5, -1.49, -1.48, -1.47, -1.46].map((x) => expect.closeTo(x, 6)));
    expect(routeLength(order.map((i) => pts[i]!), home, home)).toBeLessThan(routeLength(pts, home, home));
  });
  it("handles open routes and trivial inputs", () => {
    expect(optimiseRoute([])).toEqual([]);
    expect(optimiseRoute([{ lat: 1, lng: 1 }])).toEqual([0]);
  });
});
