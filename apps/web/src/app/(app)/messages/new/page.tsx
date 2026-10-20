import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { channelsFor } from "@/lib/services/drafts";
import { getTemplate, listTemplates, loadMergeCustomers, mergeContextFor, mergeTemplate, TEMPLATE_PURPOSES } from "@/lib/services/templates";
import { ComposeForm } from "@/components/ComposeForm";
import { CustomerMessagesLink } from "@/components/MessageCustomerLink";
import { sendToCustomerAction } from "../actions";

export default async function ComposePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("send_messages");
  const sp = await searchParams;
  const uuid = /^[0-9a-f-]{36}$/;
  if (!sp.customer || !uuid.test(sp.customer)) {
    return (
      <div className="panel">
        <h1>New message</h1>
        <p>Open a customer and choose Message to write to one customer, or start a <Link href="/messages/drafts/new">mass message</Link>.</p>
      </div>
    );
  }
  const [merge, templates, account] = await Promise.all([
    loadMergeCustomers(user.accountId, [sp.customer]), listTemplates(user.accountId), accountFor(user.accountId),
  ]);
  const c = merge.get(sp.customer);
  if (!c) notFound();
  const template = sp.template && uuid.test(sp.template) ? await getTemplate(user.accountId, sp.template) : undefined;
  const purpose = template?.purpose ?? "general";
  const ctx = mergeContextFor(c, account?.businessName ?? "");
  const opts = (["email", "sms"] as const).map((ch) => {
    const r = channelsFor(c, ch, purpose);
    return { value: ch, label: ch === "email" ? `Email ${c.email ?? ""}` : `SMS ${c.phone ?? ""}`, disabled: r.channels.includes(ch) ? undefined : r.reason };
  });
  const firstOk = opts.find((o) => !o.disabled)?.value;
  const wanted = sp.channel === "sms" || sp.channel === "email" ? sp.channel : undefined;
  const channel = wanted && !opts.find((o) => o.value === wanted)?.disabled ? wanted : firstOk ?? "email";
  return (
    <>
      <div className="spread">
        <h1>Message {ctx.name}</h1>
        <div className="row">
          <CustomerMessagesLink customerId={sp.customer} className="btn" label="Previous messages" />
          <Link className="btn" href={`/customers/${sp.customer}`}>Back to customer</Link>
        </div>
      </div>
      {!firstOk && <div className="notice error">This customer can't be messaged: {opts[0]!.disabled}.</div>}
      <form className="row panel" style={{ marginBottom: 12 }}>
        <input type="hidden" name="customer" value={sp.customer} />
        <select name="template" defaultValue={template?.id ?? ""} style={{ maxWidth: 320 }} aria-label="Template">
          <option value="">No template</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({TEMPLATE_PURPOSES[t.purpose as keyof typeof TEMPLATE_PURPOSES] ?? t.purpose})</option>)}
        </select>
        <button className="btn">Use template</button>
      </form>
      {firstOk && (
        <section className="panel" style={{ maxWidth: 820 }}>
          <ComposeForm
            key={template?.id ?? "blank"}
            action={sendToCustomerAction.bind(null, sp.customer)}
            channels={opts}
            d={{
              channel, purpose,
              subject: template?.emailSubject ? mergeTemplate(template.emailSubject, ctx) : "",
              emailBody: template?.emailBody ? mergeTemplate(template.emailBody, ctx) : "",
              smsBody: template?.smsBody ? mergeTemplate(template.smsBody, ctx) : "",
            }}
          />
        </section>
      )}
    </>
  );
}
