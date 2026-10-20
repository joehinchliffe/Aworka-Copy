import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { money } from "@/lib/format";
import { confirmCheckoutSession } from "@/lib/services/stripe";

export const dynamic = "force-dynamic";

/** Return page after paying an invoice by card: confirms the session, shows nothing beyond the invoice. */
export default async function InvoicePaid({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ session_id?: string }> }) {
  const { token } = await params;
  const { session_id } = await searchParams;
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.viewToken, token) });
  if (!inv) notFound();
  let result: { paid: boolean; amount: number } | null = null;
  if (session_id) {
    try {
      const r = await confirmCheckoutSession(inv.accountId, session_id);
      result = r.customerId === inv.customerId ? r : null;
    } catch { result = null; }
  }
  return (
    <main style={{ maxWidth: 560 }}>
      <section className="panel">
        {result?.paid ? <><h1>Thank you</h1><p>Your card payment of {money(result.amount)} has been received.</p></>
          : <><h1>Payment not confirmed yet</h1><p>If you completed the payment it will show shortly.</p></>}
        <Link className="btn" href={`/v/${token}`}>Back to the invoice</Link>
      </section>
    </main>
  );
}
