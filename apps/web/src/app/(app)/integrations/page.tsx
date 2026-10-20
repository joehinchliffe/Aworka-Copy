import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { gcConfigured } from "@/lib/services/gocardless";
import { disconnectGoCardlessAction, disconnectStripeAction } from "./actions";

function StatusBadge({ status }: { status?: string | null }) {
  if (status === "connected") return <span className="badge ok">Connected</span>;
  if (status === "disconnected") return <span className="badge warn">Disconnected</span>;
  return <span className="badge">Not connected</span>;
}

export default async function IntegrationsPage() {
  const user = await requireUser("edit_settings");
  const rows = await db.select().from(schema.integrations)
    .where(and(eq(schema.integrations.accountId, user.accountId)));
  const stripe = rows.find((r) => r.provider === "stripe");
  const gc = rows.find((r) => r.provider === "gocardless");
  const stripeOn = stripe?.status === "connected" && !!stripe.secret;
  const gcOn = gc?.status === "connected" && !!gc.secret;
  return (
    <>
      <h1>Online payments</h1>
      <p className="muted">Let customers pay you online from their invoices and their customer portal.</p>
      <div className="grid cols-2">
        <section className="panel">
          <div className="spread"><h2 style={{ margin: 0 }}>Card payments (Stripe)</h2><StatusBadge status={stripeOn ? "connected" : stripe?.status} /></div>
          <p className="small">Customers pay by debit or credit card on a secure Stripe page. Money goes straight to your own Stripe account.</p>
          {stripeOn && <p className="small muted">Mode: {String(stripe!.config.mode ?? "test")} · key ending {String(stripe!.config.keyHint ?? "")}
            {stripe!.config.webhook ? " · webhook set up" : " · no webhook secret"}</p>}
          <div className="row">
            <Link className="btn primary" href="/integrations/stripe">{stripeOn ? "Change keys" : "Connect Stripe"}</Link>
            {stripeOn && <form action={disconnectStripeAction}><button className="btn danger">Disconnect</button></form>}
          </div>
        </section>
        <section className="panel">
          <div className="spread"><h2 style={{ margin: 0 }}>Direct Debit (GoCardless)</h2><StatusBadge status={gcOn ? "connected" : gc?.status} /></div>
          <p className="small">Customers sign a Direct Debit mandate once; invoices for Direct Debit customers are then collected automatically.</p>
          {!gcConfigured() && <p className="small notice error">GoCardless is not configured on this server yet.</p>}
          {gcOn && <p className="small muted">Organisation {gc!.externalId} · {String(gc!.config.environment ?? "sandbox")}</p>}
          <div className="row">
            {!gcOn && gcConfigured() && <Link className="btn primary" href="/integrations/gocardless">Connect GoCardless</Link>}
            {gcOn && <form action={disconnectGoCardlessAction}><button className="btn danger">Disconnect</button></form>}
          </div>
        </section>
      </div>
    </>
  );
}
