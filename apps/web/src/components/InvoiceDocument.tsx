import type { InferSelectModel } from "drizzle-orm";
import type { schema } from "@/db";
import { money } from "@/lib/format";
import { contactName } from "@/lib/services/ledger";
import { formatDate } from "@/lib/time";

type Invoice = InferSelectModel<typeof schema.invoices>;
type Account = InferSelectModel<typeof schema.accounts>;
type Contact = InferSelectModel<typeof schema.contacts>;

export function InvoiceDocument({ invoice, account, contact }: { invoice: Invoice; account: Account; contact: Contact }) {
  const title = invoice.kind === "invoice" ? account.settings.invoiceTitle || "Invoice" : invoice.kind[0]!.toUpperCase() + invoice.kind.slice(1);
  const showVat = invoice.vat !== 0;
  return (
    <article className="panel" style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{account.businessName}</h1>
          <div className="small muted" style={{ whiteSpace: "pre-line" }}>{[account.settings.address, account.settings.phone, account.settings.website].filter(Boolean).join("\n")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <h2 style={{ margin: 0 }}>{title} {invoice.number}</h2>
          <div className="small">Date: {formatDate(invoice.issuedOn)}</div>
          {invoice.dueOn && <div className="small">Due: {formatDate(invoice.dueOn)}</div>}
        </div>
      </div>
      <div style={{ margin: "20px 0", whiteSpace: "pre-line" }}>
        <strong>{contactName(contact)}</strong>{"\n"}{[contact.address, contact.postcode].filter(Boolean).join("\n")}
      </div>
      <table>
        <thead><tr><th>Date</th><th>Description</th>{showVat && <th className="num">Net</th>}{showVat && <th className="num">VAT</th>}<th className="num">Amount</th></tr></thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={i}><td>{formatDate(l.date)}</td><td>{l.description}</td>{showVat && <td className="num">{money(l.net)}</td>}{showVat && <td className="num">{money(l.vat)}</td>}<td className="num">{money(l.gross)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          {showVat && <tr><td colSpan={4}>Net</td><td className="num">{money(invoice.net)}</td></tr>}
          {showVat && <tr><td colSpan={4}>{account.taxName}</td><td className="num">{money(invoice.vat)}</td></tr>}
          <tr><th colSpan={showVat ? 4 : 2}>Total</th><th className="num">{money(invoice.gross)}</th></tr>
          {invoice.amountToPay !== invoice.gross && <tr><th colSpan={showVat ? 4 : 2}>Amount to pay (including previous balance)</th><th className="num">{money(invoice.amountToPay)}</th></tr>}
        </tfoot>
      </table>
      {invoice.notes && <p style={{ whiteSpace: "pre-line" }}>{invoice.notes}</p>}
      {account.settings.invoiceSmallPrint && <p className="small muted" style={{ whiteSpace: "pre-line" }}>{account.settings.invoiceSmallPrint}</p>}
      {invoice.paidAt && <p><span className="badge ok">Paid</span></p>}
    </article>
  );
}
