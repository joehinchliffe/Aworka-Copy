import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/services/integrations";
import { gocardlessConnected } from "@/lib/services/gocardless";
import { money } from "@/lib/format";
import { collectDirectDebitAction, createPortalLinkAction } from "@/app/(app)/integrations/actions";

const MANDATE_BADGE: Record<string, string> = { active: "ok", pending: "info", cancelled: "warn", failed: "danger" };

/** Customer portal link and Direct Debit status for the customer page. */
export async function PortalLink({ customerId }: { customerId: string }) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c || c.anonymisedAt) return null;
  const dd = await gocardlessConnected(c.accountId);
  const url = c.portalToken ? `${appUrl()}/p/${c.portalToken}` : null;
  const owed = c.balance < 0 ? -c.balance : 0;
  return (
    <section className="panel no-print" style={{ marginTop: 12 }}>
      <h2 style={{ marginTop: 0 }}>Customer portal</h2>
      {url ? (
        <>
          <p className="small">Send this private link so the customer can see their balance and invoices, pay online and confirm appointments.</p>
          <input readOnly value={url} aria-label="Customer portal link" />
          <div className="row" style={{ marginTop: 8 }}><a className="btn small" href={url} target="_blank" rel="noreferrer">Open portal</a></div>
        </>
      ) : (
        <form action={createPortalLinkAction.bind(null, customerId)}>
          <p className="small">Create a private link for this customer to view and pay online.</p>
          <button className="btn">Create portal link</button>
        </form>
      )}
      {(dd || c.mandateStatus) && (
        <>
          <h3>Direct Debit</h3>
          <div className="small">Mandate: {c.mandateStatus ? <span className={`badge ${MANDATE_BADGE[c.mandateStatus] ?? ""}`}>{c.mandateStatus}</span> : "none yet (the customer can set one up from the portal)"}</div>
          {dd && c.mandateStatus === "active" && (
            <form action={collectDirectDebitAction.bind(null, customerId)} className="row" style={{ marginTop: 8 }}>
              <input name="amount" type="number" step="0.01" min="1" defaultValue={owed ? (owed / 100).toFixed(2) : ""} placeholder="£" required style={{ width: 110 }} />
              <input name="description" placeholder="Description" defaultValue="Window cleaning" style={{ width: 180 }} />
              <button className="btn">Collect{owed ? ` (owes ${money(owed)})` : ""}</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
