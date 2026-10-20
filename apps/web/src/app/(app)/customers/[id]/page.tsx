import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/services/customers";
import { contactName } from "@/lib/services/ledger";
import { requireUser } from "@/lib/session";
import { balanceLabel, DAY_NAMES, frequencyLabel, INVOICE_FREQ_LABELS, money, PAY_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { PortalLink } from "@/components/PortalLink";
import { MessageCustomerLink } from "@/components/MessageCustomerLink";
import { adjustmentAction, anonymiseAction } from "../actions";
import { createInvoiceAction, recordPaymentAction } from "../../debts/actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await getCustomer(user.accountId, id);
  if (!c) notFound();
  const b = balanceLabel(c.customer.balance);
  const activity = [
    ...c.jobs.map((j) => ({ date: j.date, kind: "Job", text: j.status.replace("_", " "), amount: j.status === "done" ? -j.price : null, key: `j${j.id}` })),
    ...c.payments.map((p) => ({ date: p.date, kind: "Payment", text: `${PAY_METHODS[p.method] ?? p.method}${p.tip ? ` (tip ${money(p.tip)})` : ""}`, amount: p.paid, key: `p${p.id}` })),
    ...c.adjustments.map((a) => ({ date: a.date, kind: "Adjustment", text: a.type.replace(/_/g, " "), amount: a.amount, key: `a${a.id}` })),
    ...c.invoices.map((i) => ({ date: i.issuedOn, kind: "Invoice", text: `#${i.number}`, amount: null, key: `i${i.id}` })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  return (
    <>
      <div className="spread">
        <div>
          <h1>{contactName(c.contact)}</h1>
          <div className="muted" style={{ whiteSpace: "pre-line" }}>{[c.contact.address, c.contact.postcode].filter(Boolean).join("\n")}</div>
          <div className="small muted">{[c.contact.phone1, c.contact.email].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={`stat`}><div className="label">Balance</div><div className={`value ${b.cls}`}>{b.text}</div></div>
          <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
            <Link className="btn" href={`/customers/${id}/edit`}>Edit</Link>
            <Link className="btn" href={`/customers/${id}/jobs/new`}>Add job</Link>
            <Link className="btn" href={`/statements/${id}`}>Statement</Link>
            <MessageCustomerLink customerId={id} />
          </div>
        </div>
      </div>
      {c.customer.anonymisedAt && <div className="notice error">This customer has been anonymised.</div>}
      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <div className="panel">
          <h2>Jobs</h2>
          {c.specs.map(({ spec, round, jobContact }) => (
            <div key={spec.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
              <div className="spread"><strong>{spec.reference || jobContact?.address?.split("\n")[0] || "Job"}</strong>
                <span>{money(spec.price)} {spec.status !== "active" && <span className="badge warn">{spec.status}</span>}</span></div>
              <div className="small muted">
                {frequencyLabel(spec)} · {round?.name ?? "No round"} · next due {formatDate(spec.nextDueOn) || "—"} · last done {formatDate(spec.lastDoneOn) || "—"}
                {spec.allowedDays !== 127 && <> · {DAY_NAMES.filter((_, i) => spec.allowedDays & (1 << i)).join(" ")}</>}
              </div>
              {spec.description && <div className="small">{spec.description}</div>}
              {spec.notes && <div className="small muted">Note: {spec.notes}</div>}
              <Link className="small" href={`/jobs/${spec.id}/edit`}>Edit job</Link>
            </div>
          ))}
          <h2>Billing</h2>
          <div className="small">Pays: {PAYMENT_METHOD_LABELS[c.customer.paymentMethod]}
            {["email_invoice", "paper_invoice", "direct_debit"].includes(c.customer.paymentMethod) && <> · invoiced {INVOICE_FREQ_LABELS[c.customer.invoiceFrequency]?.toLowerCase()}</>}</div>
          {c.customer.notes && <p className="small">{c.customer.notes}</p>}
        </div>
        <div className="panel">
          <h2>Take a payment</h2>
          <form action={recordPaymentAction.bind(null, id)} className="row">
            <input name="amount" type="number" step="0.01" placeholder="£" required style={{ width: 100 }} />
            <select name="method" defaultValue="cash" style={{ width: 150 }}>
              {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="reference" placeholder="Reference" style={{ width: 140 }} />
            <button className="btn primary">Record</button>
          </form>
          <h2>Adjust balance</h2>
          <form action={adjustmentAction.bind(null, id)} className="row">
            <select name="type" style={{ width: 150 }}>
              <option value="bad_debt">Bad debt (write off)</option><option value="credit">Credit</option><option value="discount">Discount</option>
              <option value="surcharge">Surcharge</option>
            </select>
            <input name="amount" type="number" step="0.01" placeholder="£ in their favour" required style={{ width: 150 }} />
            <input name="notes" placeholder="Notes" style={{ width: 140 }} />
            <button className="btn">Apply</button>
          </form>
          <p className="small muted">Positive amounts reduce what they owe; a surcharge should be negative.</p>
          <form action={createInvoiceAction.bind(null, id)}><button className="btn">Invoice done jobs now</button></form>
        </div>
      </div>
      <h2>Activity</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {activity.map((a) => (
              <tr key={a.key}><td>{formatDate(a.date)}</td><td>{a.kind}</td>
                <td>{a.kind === "Invoice" ? <Link href={`/invoices/${a.key.slice(1)}`}>{a.text}</Link> : a.text}</td>
                <td className="num">{a.amount == null ? "" : money(a.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <PortalLink customerId={id} />
      {!c.customer.anonymisedAt && (
        <form action={anonymiseAction.bind(null, id)} style={{ marginTop: 16 }} className="no-print">
          <button className="btn danger small">Anonymise customer</button>
        </form>
      )}
    </>
  );
}
