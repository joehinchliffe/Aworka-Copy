"use client";
import { useActionState, useState } from "react";
import { SmsCounter } from "./TemplateForm";

type FormState = { errors?: string[] } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;

export function ComposeForm({ action, channels, d }: {
  action: Action;
  channels: { value: "email" | "sms"; label: string; disabled?: string }[];
  d: { channel: "email" | "sms"; subject: string; emailBody: string; smsBody: string; purpose: string };
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [channel, setChannel] = useState(d.channel);
  const [body, setBody] = useState(d.channel === "sms" ? d.smsBody : d.emailBody);
  return (
    <form action={formAction}>
      {state?.errors && <div className="notice error">{state.errors.join(". ")}</div>}
      <input type="hidden" name="purpose" value={d.purpose} />
      <label>Send by</label>
      <div className="row">
        {channels.map((c) => (
          <label key={c.value} className="row" style={{ margin: 0 }}>
            <input type="radio" name="channel" value={c.value} checked={channel === c.value} disabled={!!c.disabled}
              onChange={() => { setChannel(c.value); setBody(c.value === "sms" ? d.smsBody : d.emailBody); }} />
            {c.label}{c.disabled && <span className="small muted"> ({c.disabled})</span>}
          </label>
        ))}
      </div>
      {channel === "email" && (<><label>Subject</label><input name="subject" defaultValue={d.subject} /></>)}
      <label>Message</label>
      <textarea name="body" rows={channel === "sms" ? 4 : 10} value={body} onChange={(e) => setBody(e.target.value)} required />
      {channel === "sms" && <SmsCounter text={body} />}
      <p className="small muted">Merge tags such as #first_name are filled in when the message is sent.</p>
      <button className="btn primary" disabled={pending}>Send</button>
    </form>
  );
}
