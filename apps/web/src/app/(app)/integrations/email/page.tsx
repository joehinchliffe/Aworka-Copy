import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { businessReplyTo } from "@/lib/services/messaging";
import { NEEDS_RECONNECT, oauthConfigured, type EmailSender, type SmtpConfig } from "@/lib/services/email";
import { chooseSenderAction, connectOAuthAction, disconnectSenderAction, saveSmtpAction, sendTestEmailAction } from "./actions";

const LABELS: Record<EmailSender, string> = {
  platform: "Our email service", smtp: "Your own email server (SMTP)", gmail: "Gmail", outlook: "Outlook / Microsoft 365",
};

function Status({ status, inUse }: { status?: string | null; inUse: boolean }) {
  if (status === NEEDS_RECONNECT) return <span className="badge danger">Needs reconnecting</span>;
  if (status === "connected") return inUse ? <span className="badge ok">In use</span> : <span className="badge info">Connected</span>;
  return <span className="badge">Not connected</span>;
}

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; result?: string; connected?: string; to?: string }> }) {
  const user = await requireUser("edit_settings");
  const sp = await searchParams;
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, user.accountId) });
  const rows = await db.select().from(schema.integrations).where(and(eq(schema.integrations.accountId, user.accountId)));
  const row = (p: string) => rows.find((r) => r.provider === p);
  const sender: EmailSender = account?.settings.emailSender ?? "platform";
  const smtp = row("smtp");
  const smtpOn = smtp?.status === "connected" && !!smtp.secret;
  const sc = (smtp?.config ?? {}) as Partial<SmtpConfig>;
  const replyTo = await businessReplyTo(user.accountId, account?.settings.email);

  const oauthPanel = (p: "gmail" | "outlook", help: string) => {
    const r = row(p);
    const on = r?.status === "connected" && !!r.secret;
    return (
      <section className="panel">
        <div className="spread"><h2 style={{ margin: 0 }}>{LABELS[p]}</h2><Status status={r?.status} inUse={on && sender === p} /></div>
        <p className="small">{help}</p>
        {r?.externalId && <p className="small muted">Mailbox: {r.externalId}</p>}
        {r?.status === NEEDS_RECONNECT && <p className="small notice error">Access to this mailbox was withdrawn or has expired. Reconnect it; until then email goes through our service.</p>}
        {!oauthConfigured(p) && <p className="small notice error">{LABELS[p]} sending is not configured on this server yet.</p>}
        <div className="row">
          {oauthConfigured(p) && <form action={connectOAuthAction.bind(null, p)}><button className={`btn ${on ? "" : "primary"}`}>{on ? "Reconnect" : r?.status === NEEDS_RECONNECT ? "Reconnect" : `Connect ${p === "gmail" ? "Gmail" : "Outlook"}`}</button></form>}
          {on && sender !== p && <form action={chooseSenderAction.bind(null, p)}><button className="btn primary">Use {p === "gmail" ? "Gmail" : "Outlook"}</button></form>}
          {(on || r?.status === NEEDS_RECONNECT) && <form action={disconnectSenderAction.bind(null, p)}><button className="btn danger">Disconnect</button></form>}
        </div>
      </section>
    );
  };

  return (
    <>
      <h1>Email sending</h1>
      {sp.error && <div className="notice error">{sp.error}</div>}
      {sp.connected && <div className="notice ok">{LABELS[sp.connected as EmailSender] ?? "Mailbox"} is connected and will be used for your email.</div>}
      {sp.result === "test" && <div className="notice ok">Test email sent to {sp.to}. Check that inbox (and its spam folder).</div>}
      {sp.result && sp.result !== "test" && sp.result !== "disconnected" && <div className="notice ok">Email will be sent using: {LABELS[sp.result as EmailSender] ?? sp.result}.</div>}
      <p className="muted">
        Choose how invoices, statements and messages to your customers are emailed. They show <strong>{account?.businessName}</strong> as the sender name
        {replyTo ? <> and replies go to <strong>{replyTo}</strong></> : null}. You can change the reply address under Settings, Business details.
      </p>
      <section className="panel">
        <div className="spread">
          <div><strong>Currently using:</strong> {LABELS[sender]}</div>
          <form action={sendTestEmailAction}><button className="btn">Send test email to {user.email}</button></form>
        </div>
      </section>
      <div className="grid cols-2">
        <section className="panel">
          <div className="spread"><h2 style={{ margin: 0 }}>{LABELS.platform}</h2>{sender === "platform" ? <span className="badge ok">In use</span> : null}</div>
          <p className="small">The simplest option: nothing to set up. Email is sent from our servers with your business name, and replies come to you.</p>
          {sender !== "platform" && <form action={chooseSenderAction.bind(null, "platform")}><button className="btn primary">Use our email service</button></form>}
        </section>
        <section className="panel">
          <div className="spread"><h2 style={{ margin: 0 }}>{LABELS.smtp}</h2><Status status={smtp?.status} inUse={smtpOn && sender === "smtp"} /></div>
          <p className="small">Send through your email provider&apos;s SMTP server so messages come from your own address.</p>
          <form action={saveSmtpAction}>
            <div className="field-row">
              <div><label htmlFor="host">Server</label><input id="host" name="host" defaultValue={sc.host ?? ""} placeholder="smtp.example.com" required /></div>
              <div style={{ maxWidth: 110 }}><label htmlFor="port">Port</label><input id="port" name="port" type="number" min={1} max={65535} defaultValue={sc.port ?? 587} /></div>
            </div>
            <div className="field-row">
              <div><label htmlFor="user">Username</label><input id="user" name="user" defaultValue={sc.user ?? ""} autoComplete="off" /></div>
              <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" placeholder={smtpOn ? "Leave blank to keep the saved password" : ""} /></div>
            </div>
            <div className="field-row">
              <div><label htmlFor="fromAddress">From address (if not the username)</label><input id="fromAddress" name="fromAddress" type="email" defaultValue={sc.fromAddress ?? ""} /></div>
              <div style={{ maxWidth: 200 }}><label htmlFor="minIntervalSeconds">Seconds between emails</label><input id="minIntervalSeconds" name="minIntervalSeconds" type="number" min={0} max={3600} defaultValue={sc.minIntervalSeconds ?? 0} /></div>
            </div>
            <label className="row check"><input type="checkbox" name="startTls" defaultChecked={sc.startTls ?? true} /> Use STARTTLS (port 465 always uses TLS)</label>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary">Save, check and use</button>
            </div>
          </form>
          <div className="row" style={{ marginTop: 8 }}>
            {smtpOn && sender !== "smtp" && <form action={chooseSenderAction.bind(null, "smtp")}><button className="btn">Use this server</button></form>}
            {smtpOn && <form action={disconnectSenderAction.bind(null, "smtp")}><button className="btn danger small">Remove server</button></form>}
          </div>
          <p className="small muted">Your password is stored encrypted and never shown again. Some providers limit how fast you can send; set a gap between emails to stay within it.</p>
        </section>
        {oauthPanel("gmail", "Send from your Gmail or Google Workspace address. You will be asked to let us send email on your behalf; we cannot read your mailbox.")}
        {oauthPanel("outlook", "Send from your Outlook.com or Microsoft 365 mailbox. Microsoft limits sending to about 30 messages a minute.")}
      </div>
    </>
  );
}
