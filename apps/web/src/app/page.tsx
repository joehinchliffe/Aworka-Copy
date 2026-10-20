import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { PLANS, type PlanId } from "@/lib/plans";
import { money } from "@/lib/format";

export const metadata = { title: "Rounds: round management for window cleaners", description: "Plan your round, get paid, chase debts and do your books and MTD in one simple app." };

const FEATURES = [
  ["Plan your round", "See who is due, drag jobs between days, and let the app plan the next visit from each job's frequency."],
  ["Get paid", "Take cash on the day, send invoices automatically, collect by Direct Debit or card, and give customers their own payment page."],
  ["Never lose a debt", "Balances update as you work. See who owes what and for how long, then chase by text or email in one go."],
  ["Works in a dead spot", "The phone app keeps working with no signal and syncs when you're back in range."],
  ["Books and tax done", "Expenses, mileage, profit and loss, VAT returns and Making Tax Digital quarterly updates."],
  ["Bring your round with you", "Import a spreadsheet or an export from your current software in a couple of minutes."],
];

const PLAN_POINTS: Record<PlanId, string[]> = {
  simple: ["Unlimited customers and jobs", "Planner and job sheets", "Debts, invoices, statements", "Expenses and reports", "Offline phone app", "Email and text messages"],
  smart: ["Everything in Solo", "Automatic invoicing", "Card and Direct Debit payments", "Customer payment portal", "Route optimisation and maps", "Mass messaging", "MTD for Income Tax"],
  team: ["Everything in Pro", "Staff logins and roles", "Assign rounds to staff", "VAT returns and MTD for VAT", "QuickBooks sync and API"],
};

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="landing">
      <header className="landing-top">
        <strong>Rounds</strong>
        <nav className="row"><a href="#pricing">Pricing</a><Link href="/login">Log in</Link><Link className="btn primary" href="/signup">Start free trial</Link></nav>
      </header>
      <section className="hero">
        <h1>Run your round without the paperwork</h1>
        <p>Planning, payments, debts and bookkeeping for window cleaners and other round-based businesses. Six weeks free, no card needed.</p>
        <p><Link className="btn primary" href="/signup">Start your free trial</Link></p>
      </section>
      <section className="grid cols-2 landing-features">
        {FEATURES.map(([h, t]) => <div key={h} className="panel"><h2>{h}</h2><p>{t}</p></div>)}
      </section>
      <section id="pricing">
        <h1 style={{ textAlign: "center" }}>Simple prices, VAT included</h1>
        <p style={{ textAlign: "center" }} className="muted">Pay monthly or save two months by paying yearly. Change or cancel any time.</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <div key={id} className="panel">
              <h2 style={{ marginTop: 0 }}>{PLANS[id].name}</h2>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{money(PLANS[id].monthly)}<span className="small muted"> a month</span></div>
              {PLANS[id].perUser > 0 && <div className="small muted">for two people, then {money(PLANS[id].perUser)} per extra person</div>}
              <ul>{PLAN_POINTS[id].map((p) => <li key={p}>{p}</li>)}</ul>
              <Link className="btn primary" href="/signup">Try it free</Link>
            </div>
          ))}
        </div>
      </section>
      <footer className="small muted" style={{ textAlign: "center", padding: 24 }}>Your data is stored in the UK and is yours to export at any time.</footer>
    </div>
  );
}
