import { requireUser } from "@/lib/session";
import { appUrl, getIntegration } from "@/lib/services/integrations";
import { gcConfigured } from "@/lib/services/gocardless";
import { connectGoCardlessAction, disconnectGoCardlessAction } from "../actions";

const RESULTS: Record<string, { cls: string; text: string }> = {
  connected: { cls: "ok", text: "GoCardless is connected. You can now offer Direct Debit to your customers." },
  cancelled: { cls: "error", text: "The GoCardless connection was cancelled." },
  invalid: { cls: "error", text: "That connection link has expired or was for another account. Please try again." },
  forbidden: { cls: "error", text: "You need permission to edit settings to connect GoCardless." },
  failed: { cls: "error", text: "GoCardless did not accept the connection. Please try again." },
};

export default async function GoCardlessPage({ searchParams }: { searchParams: Promise<{ error?: string; result?: string }> }) {
  const user = await requireUser("edit_settings");
  const sp = await searchParams;
  const row = await getIntegration(user.accountId, "gocardless");
  const result = sp.result ? RESULTS[sp.result] : undefined;
  return (
    <>
      <h1>Direct Debit with GoCardless</h1>
      {sp.error && <div className="notice error">{sp.error}</div>}
      {result && <div className={`notice ${result.cls}`}>{result.text}</div>}
      <section className="panel" style={{ maxWidth: 720 }}>
        {!gcConfigured() ? (
          <p>GoCardless is not configured on this server. An administrator needs to set the GoCardless partner app credentials.</p>
        ) : row ? (
          <>
            <p>Connected to GoCardless organisation <strong>{row.externalId}</strong> ({String(row.config.environment ?? "sandbox")}).</p>
            <ul className="small">
              <li>Customers set up a mandate from their portal link (shown on each customer&apos;s page).</li>
              <li>When a customer who pays by Direct Debit is invoiced, the invoice total is collected automatically.</li>
              <li>Payments show as pending until GoCardless confirms them, and are reversed if they fail.</li>
            </ul>
            <form action={disconnectGoCardlessAction}><button className="btn danger">Disconnect</button></form>
          </>
        ) : (
          <>
            <p>Connect an existing GoCardless account or create a new one. You&apos;ll be taken to GoCardless and brought back here.</p>
            <form action={connectGoCardlessAction}><button className="btn primary">Connect GoCardless</button></form>
            <p className="small muted">Return address: {appUrl()}/api/gocardless/callback</p>
          </>
        )}
      </section>
    </>
  );
}
