import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { FEATURES, PLANS, trialDaysLeft, type PlanId } from "@/lib/plans";
import { billingConfigured } from "@/lib/services/billing";
import { money } from "@/lib/format";
import { todayIso } from "@/lib/time";
import { choosePlanAction } from "./actions";

const FEATURE_LABELS: Record<string, string> = {
  core: "Planner, job sheets, debts, invoices, expenses, reports, mobile app",
  automatic_invoices: "Automatic invoices", online_payments: "Card and Direct Debit payments", customer_portal: "Customer portal",
  mass_messaging: "Mass messaging and templates", mapping: "Maps and address lookup", mileage: "Mileage", recurring_expenses: "Recurring expenses",
  data_retention: "Automatic data retention", mtd_income_tax: "MTD for Income Tax", route_optimisation: "Route optimisation",
  multiple_users: "Multiple users and roles", vat: "VAT and MTD for VAT", api: "API access", quickbooks: "QuickBooks sync",
};

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const account = await accountFor(user.accountId);
  const sp = await searchParams;
  const days = account ? trialDaysLeft(account, todayIso()) : 0;
  return (
    <main>
      <h1>Your plan</h1>
      {sp.done && <div className="notice ok">Thank you. Your plan is updated.</div>}
      <p>{account?.plan === "trial" ? (days > 0 ? `Free trial: ${days} days left. Everything is included while you try it.` : "Your free trial has ended. Choose a plan to carry on.")
        : account?.plan === "lapsed" ? "Your subscription has lapsed. Choose a plan to carry on." : `You are on the ${PLANS[account!.plan as PlanId]?.name ?? account?.plan} plan.`}</p>
      {!billingConfigured() && <p className="small muted">Billing is not configured in this environment, so choosing a plan applies it immediately.</p>}
      <div className="grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          return (
            <form key={id} action={choosePlanAction.bind(null, id)} className="panel">
              <h2 style={{ marginTop: 0 }}>{p.name}</h2>
              <div className="value" style={{ fontSize: 26, fontWeight: 700 }}>{money(p.monthly)}<span className="small muted"> /month inc VAT</span></div>
              {p.perUser > 0 && <div className="small muted">includes 2 people, then {money(p.perUser)} per extra user</div>}
              <p className="small">{p.blurb}</p>
              <ul className="small">{Object.entries(FEATURES).filter(([, plans]) => (plans as readonly string[]).includes(id)).map(([f]) => <li key={f}>{FEATURE_LABELS[f]}</li>)}</ul>
              <select name="cycle" defaultValue="monthly"><option value="monthly">Pay monthly</option><option value="yearly">Pay yearly ({money(p.yearly)}, 2 months free)</option></select>
              <p><button className="btn primary" disabled={account?.plan === id}>{account?.plan === id ? "Current plan" : "Choose"}</button></p>
            </form>
          );
        })}
      </div>
    </main>
  );
}
