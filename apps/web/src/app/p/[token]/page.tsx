import Link from "next/link";
import { notFound } from "next/navigation";
import { money } from "@/lib/format";
import { formatDate, formatDay, todayIso } from "@/lib/time";
import { portalView } from "@/lib/services/portal";
import { STRIPE_MIN_PENCE } from "@/lib/services/stripe";
import { confirmAppointmentAction, payBalanceAction, setUpDirectDebitAction } from "../actions";

export const dynamic = "force-dynamic";

/** Public customer portal reached from a private link: balance, invoices, appointments, payment. */
export default async function Portal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; dd?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const v = await portalView(token, todayIso());
  if (!v) notFound();
  const { account } = v;
  return (
    <main style={{ maxWidth: 760 }}>
      <header style={{ marginBottom: 16 }}>
        <div className="small muted">{account.businessName}</div>
        <h1 style={{ marginBottom: 2 }}>Hello, {v.name}</h1>
        <div className="small muted">{[account.settings.phone, account.settings.website].filter(Boolean).join(" · ")}</div>
      </header>

      {sp.error === "card" && <div className="notice error">Card payment isn&apos;t available right now. Please try again later.</div>}
      {sp.error === "dd" && <div className="notice error">Direct Debit setup isn&apos;t available right now. Please try again later.</div>}
      {sp.dd === "done" && <div className="notice ok">Thank you. Your Direct Debit is being set up; it can take a few days to become active.</div>}

      <section className="panel">
        <div className="spread">
          <div>
            <div className="small muted">Your account</div>
            {v.owed > 0 ? <div className="debt" style={{ fontSize: 24, fontWeight: 600 }}>{money(v.owed)} to pay</div>
              : v.customer.balance > 0 ? <div className="credit" style={{ fontSize: 24, fontWeight: 600 }}>{money(v.customer.balance)} in credit</div>
                : <div style={{ fontSize: 24, fontWeight: 600 }}>All paid up</div>}
          </div>
          <div className="row">
            {v.canPayByCard && v.owed >= STRIPE_MIN_PENCE && (
              <form action={payBalanceAction.bind(null, token)}><button className="btn primary">Pay {money(v.owed)} by card</button></form>
            )}
            {v.canSetUpDirectDebit && (
              <form action={setUpDirectDebitAction.bind(null, token)}><button className="btn">Set up Direct Debit</button></form>
            )}
          </div>
        </div>
        {v.mandateStatus === "active" && <p className="small muted" style={{ marginBottom: 0 }}>You pay by Direct Debit. Invoices are collected automatically.</p>}
        {v.mandateStatus === "pending" && <p className="small muted" style={{ marginBottom: 0 }}>Your Direct Debit is being set up.</p>}
      </section>

      {v.invoices.length > 0 && (
        <>
          <h2>Unpaid invoices</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {v.invoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/v/${i.viewToken}`}>{i.number}</Link></td>
                    <td>{formatDate(i.issuedOn)}</td><td>{formatDate(i.dueOn) || "—"}</td>
                    <td className="num">{money(i.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Upcoming visits</h2>
      {v.jobs.length === 0 ? <p className="muted">No visits booked in the next two months.</p> : (
        <div className="panel" style={{ padding: "4px 16px" }}>
          {v.jobs.map((j) => (
            <div key={j.id} className="spread" style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
              <div>
                <strong>{formatDay(j.date)}</strong>
                <div className="small muted">{j.description}{j.where ? ` · ${j.where}` : ""} · {money(j.price)}</div>
              </div>
              {j.confirmed === false ? (
                <form action={confirmAppointmentAction.bind(null, token, j.id)}><button className="btn small primary">Confirm appointment</button></form>
              ) : j.confirmed === true ? <span className="badge ok">Confirmed</span> : null}
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 24 }}>This page is private to you. Please don&apos;t share the link.</p>
    </main>
  );
}
