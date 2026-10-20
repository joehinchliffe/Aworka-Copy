import { requireUser } from "@/lib/session";
import { appUrl, getIntegration } from "@/lib/services/integrations";
import { connectStripeAction, disconnectStripeAction } from "../actions";

export default async function StripePage({ searchParams }: { searchParams: Promise<{ error?: string; result?: string }> }) {
  const user = await requireUser("edit_settings");
  const sp = await searchParams;
  const row = await getIntegration(user.accountId, "stripe");
  const webhookUrl = `${appUrl()}/api/webhooks/stripe/${user.accountId}`;
  return (
    <>
      <h1>Card payments with Stripe</h1>
      {sp.error && <div className="notice error">{sp.error}</div>}
      {sp.result === "connected" && <div className="notice ok">Stripe is connected. Customers can now pay by card.</div>}
      <div className="grid cols-2">
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>{row ? "Replace your keys" : "Connect your Stripe account"}</h2>
          {row && <p className="small muted">Currently connected in {String(row.config.mode)} mode with key ending {String(row.config.keyHint)}.</p>}
          <form action={connectStripeAction}>
            <label htmlFor="secretKey">Secret key or restricted key</label>
            <input id="secretKey" name="secretKey" type="password" autoComplete="off" placeholder="sk_test_…" required />
            <label htmlFor="webhookSecret">Webhook signing secret (recommended)</label>
            <input id="webhookSecret" name="webhookSecret" type="password" autoComplete="off" placeholder="whsec_…" />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary">Save and test</button>
            </div>
          </form>
          {row && <form action={disconnectStripeAction} style={{ marginTop: 12 }}><button className="btn danger small">Disconnect Stripe</button></form>}
        </section>
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>How to set it up</h2>
          <ol className="small">
            <li>In your Stripe dashboard open Developers, then API keys. Use a test key first to try it out.</li>
            <li>Paste the secret key here. A restricted key needs write access to Checkout Sessions.</li>
            <li>Under Developers, Webhooks, add an endpoint with this URL and the event <code>checkout.session.completed</code>:
              <div style={{ wordBreak: "break-all", margin: "6px 0" }}><code>{webhookUrl}</code></div></li>
            <li>Copy the endpoint&apos;s signing secret into the second box. Without it, payments are still recorded when the customer returns from Stripe.</li>
          </ol>
          <p className="small muted">Your keys are stored encrypted and are never shown again.</p>
        </section>
      </div>
    </>
  );
}
