import { describe, expect, it } from "vitest";
import { hasFeature, isActive, monthlyPrice, trialDaysLeft } from "@/lib/plans";

describe("plans", () => {
  it("gives trials everything until they end", () => {
    const t = { plan: "trial", trialEndsOn: "2026-11-30" };
    expect(trialDaysLeft(t, "2026-10-20")).toBe(41);
    expect(hasFeature(t, "api", "2026-10-20")).toBe(true);
    expect(isActive(t, "2026-12-01")).toBe(false);
  });
  it("gates features by plan", () => {
    expect(hasFeature({ plan: "simple", trialEndsOn: null }, "online_payments", "2026-10-20")).toBe(false);
    expect(hasFeature({ plan: "smart", trialEndsOn: null }, "online_payments", "2026-10-20")).toBe(true);
    expect(hasFeature({ plan: "smart", trialEndsOn: null }, "vat", "2026-10-20")).toBe(false);
    expect(hasFeature({ plan: "team", trialEndsOn: null }, "vat", "2026-10-20")).toBe(true);
  });
  it("prices extra team users", () => {
    expect(monthlyPrice("team", 2)).toBe(5000);
    expect(monthlyPrice("smart", 0, "yearly")).toBe(20000);
  });
});
