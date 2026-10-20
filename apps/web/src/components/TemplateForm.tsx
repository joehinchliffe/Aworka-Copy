"use client";
import { useActionState, useRef, useState } from "react";
import { smsSegments } from "@/lib/sms";

type FormState = { errors?: string[] } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;

export interface TemplateDefaults { name?: string; purpose?: string; emailSubject?: string | null; emailBody?: string | null; smsBody?: string | null }

export function SmsCounter({ text }: { text: string }) {
  const c = smsSegments(text);
  return (
    <div className="small muted">
      {c.units} characters · {c.segments} part{c.segments === 1 ? "" : "s"} · {c.remaining} left{c.encoding === "UCS-2" && " · contains characters that make it Unicode (70 per part)"}
      {" "}(merge tags are counted before they are filled in)
    </div>
  );
}

/** Buttons that insert a merge tag at the cursor in whichever field last had focus. */
export function MergeTagPicker({ tags, target }: { tags: Record<string, string>; target: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null> }) {
  return (
    <div className="merge-tags">
      {Object.entries(tags).map(([tag, help]) => (
        <button key={tag} type="button" className="btn small" title={help} onClick={() => {
          const el = target.current;
          if (!el) return;
          const start = el.selectionStart ?? el.value.length;
          const end = el.selectionEnd ?? start;
          const insert = `#${tag}`;
          el.setRangeText(insert, start, end, "end");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.focus();
        }}>#{tag}</button>
      ))}
    </div>
  );
}

export function TemplateForm({ action, d = {}, purposes, tags }: { action: Action; d?: TemplateDefaults; purposes: Record<string, string>; tags: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [sms, setSms] = useState(d.smsBody ?? "");
  const focused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const track = { onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { focused.current = e.currentTarget; } };
  return (
    <form action={formAction}>
      {state?.errors && <div className="notice error">{state.errors.join(". ")}</div>}
      <div className="field-row">
        <div><label>Template name</label><input name="name" defaultValue={d.name ?? ""} required maxLength={80} /></div>
        <div><label>Purpose</label>
          <select name="purpose" defaultValue={d.purpose ?? "general"}>
            {Object.entries(purposes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
      </div>
      <label>Merge tags (click to insert where the cursor is)</label>
      <MergeTagPicker tags={tags} target={focused} />
      <fieldset style={{ marginTop: 12 }}>
        <legend>Email</legend>
        <label>Subject</label><input name="emailSubject" defaultValue={d.emailSubject ?? ""} {...track} />
        <label>Body</label><textarea name="emailBody" rows={8} defaultValue={d.emailBody ?? ""} {...track} />
      </fieldset>
      <fieldset>
        <legend>SMS</legend>
        <textarea name="smsBody" rows={4} value={sms} onChange={(e) => setSms(e.target.value)} onInput={(e) => setSms(e.currentTarget.value)} {...track} />
        <SmsCounter text={sms} />
      </fieldset>
      <button className="btn primary" disabled={pending}>Save</button>
    </form>
  );
}
