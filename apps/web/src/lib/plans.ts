/** Product plans. Prices are what the business pays us, monthly, in pence inc VAT unless noted. */
export const PLANS = {
  simple: { name: "Solo", monthly: 1200, yearly: 12000, perUser: 0, blurb: "Everything a one-person round needs" },
  smart: { name: "Pro", monthly: 2000, yearly: 20000, perUser: 0, blurb: "Automation, online payments, maps and portal" },
  team: { name: "Team", monthly: 3000, yearly: 30000, perUser: 1000, blurb: "Staff, roles, routes, VAT and API" },
} as const;
export type PlanId = keyof typeof PLANS;

export const FEATURES = {
  core: ["simple", "smart", "team"],
  automatic_invoices: ["smart", "team"],
  online_payments: ["smart", "team"],
  customer_portal: ["smart", "team"],
  mass_messaging: ["smart", "team"],
  mapping: ["smart", "team"],
  mileage: ["smart", "team"],
  recurring_expenses: ["smart", "team"],
  data_retention: ["smart", "team"],
  mtd_income_tax: ["smart", "team"],
  route_optimisation: ["smart", "team"], // base-tier differentiator vs incumbents
  multiple_users: ["team"],
  vat: ["team"],
  api: ["team"],
  quickbooks: ["team"],
} as const satisfies Record<string, readonly PlanId[]>;
export type Feature = keyof typeof FEATURES;

export interface PlanState { plan: string; trialEndsOn: string | null }

export function trialDaysLeft(a: PlanState, today: string): number {
  if (a.plan !== "trial" || !a.trialEndsOn) return 0;
  return Math.max(0, Math.round((Date.parse(a.trialEndsOn) - Date.parse(today)) / 86_400_000));
}

/** Trial accounts get everything until the trial ends; lapsed accounts get nothing. */
export function hasFeature(a: PlanState, feature: Feature, today: string): boolean {
  if (a.plan === "trial") return trialDaysLeft(a, today) > 0;
  if (a.plan === "lapsed") return false;
  return (FEATURES[feature] as readonly string[]).includes(a.plan);
}

export function isActive(a: PlanState, today: string) {
  return a.plan === "trial" ? trialDaysLeft(a, today) > 0 : a.plan !== "lapsed";
}

export function monthlyPrice(plan: PlanId, extraUsers: number, cycle: "monthly" | "yearly" = "monthly") {
  const p = PLANS[plan];
  return (cycle === "yearly" ? p.yearly : p.monthly) + p.perUser * extraUsers * (cycle === "yearly" ? 10 : 1);
}
