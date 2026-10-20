import Link from "next/link";
import { notFound } from "next/navigation";
import { money } from "@/lib/format";
import { customerByPortalToken } from "@/lib/services/portal";
import { confirmCheckoutSession } from "@/lib/services/stripe";

export const dynamic = "force-dynamic";

/** Return page after Stripe Checkout: confirm the session and record the payment. */
export default async function Paid({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ session_id?: string }> }) {
  const { token } = await params;
  const { session_id } = await searchParams;
  const row = await customerByPortalToken(token);
  if (!row) notFound();
  let result: { paid: boolean; amount: number } | null = null;
  if (session_id) {
    try {
      const r = await confirmCheckoutSession(row.account.id, session_id);
      result = r.customerId === row.customer.id ? r : null;
    } catch { result = null; }
  }
  return (
    <main style={{ maxWidth: 560 }}>
      <section className="panel">
        <div className="small muted">{row.account.businessName}</div>
        {result?.paid ? (
          <>
            <h1>Thank you</h1>
            <p>Your card payment of {money(result.amount)} has been received.</p>
          </>
        ) : (
          <>
            <h1>Payment not confirmed yet</h1>
            <p>We couldn&apos;t confirm your payment just now. If you completed it, it will show on your account shortly.</p>
          </>
        )}
        <Link className="btn" href={`/p/${token}`}>Back to your account</Link>
      </section>
    </main>
  );
}
