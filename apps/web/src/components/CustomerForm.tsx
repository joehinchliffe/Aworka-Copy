"use client";
import { useActionState, useState } from "react";
import { DAY_NAMES } from "@/lib/format";
import { AddressLookup } from "./AddressLookup";

type FormState = { errors?: string[] } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;

interface Contact { title?: string | null; firstNames?: string | null; lastName?: string | null; company?: string | null; address?: string | null; postcode?: string | null; phone1?: string | null; phone2?: string | null; email?: string | null; emailCc?: string | null }
export interface CustomerDefaults {
  contact?: Contact;
  reference?: string | null;
  contactMethod?: string;
  acceptsMarketing?: boolean;
  paymentMethod?: string;
  invoiceFrequency?: string;
  invoicePeriodNum?: number;
  invoicePeriodUnit?: string;
  invoiceJobsThreshold?: number;
  invoiceValueThreshold?: number | null;
  paymentTermsType?: string | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
  startingBalance?: number;
}

export function ContactFields({ prefix, d = {} }: { prefix: string; d?: Contact }) {
  return (
    <>
      <div className="field-row">
        <div><label>Title</label><input name={`${prefix}title`} defaultValue={d.title ?? ""} /></div>
        <div><label>First name(s)</label><input name={`${prefix}firstNames`} defaultValue={d.firstNames ?? ""} /></div>
        <div><label>Last name</label><input name={`${prefix}lastName`} defaultValue={d.lastName ?? ""} /></div>
      </div>
      <label>Company</label><input name={`${prefix}company`} defaultValue={d.company ?? ""} />
      <AddressLookup prefix={prefix} />
      <label>Address</label><textarea name={`${prefix}address`} defaultValue={d.address ?? ""} rows={3} />
      <input type="hidden" name={`${prefix}lat`} defaultValue="" />
      <input type="hidden" name={`${prefix}lng`} defaultValue="" />
      <div className="field-row">
        <div><label>Postcode</label><input name={`${prefix}postcode`} defaultValue={d.postcode ?? ""} /></div>
        <div><label>Phone</label><input name={`${prefix}phone1`} type="tel" defaultValue={d.phone1 ?? ""} /></div>
        <div><label>Other phone</label><input name={`${prefix}phone2`} type="tel" defaultValue={d.phone2 ?? ""} /></div>
      </div>
      <div className="field-row">
        <div><label>Email</label><input name={`${prefix}email`} type="email" defaultValue={d.email ?? ""} /></div>
        <div><label>Email cc</label><input name={`${prefix}emailCc`} defaultValue={d.emailCc ?? ""} /></div>
      </div>
    </>
  );
}

export function CustomerFields({ d = {} }: { d?: CustomerDefaults }) {
  const [method, setMethod] = useState(d.paymentMethod ?? "on_day");
  const [freq, setFreq] = useState(d.invoiceFrequency ?? "after_each_job");
  const invoiced = method === "email_invoice" || method === "paper_invoice";
  return (
    <fieldset>
      <legend>Customer</legend>
      <ContactFields prefix="c_" d={d.contact} />
      <div className="field-row">
        <div><label>Customer reference</label><input name="reference" maxLength={15} defaultValue={d.reference ?? ""} /></div>
        <div><label>Contact by</label>
          <select name="contactMethod" defaultValue={d.contactMethod ?? "email"}>
            <option value="none">None</option><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email and SMS</option>
          </select></div>
        <div><label>&nbsp;</label><label className="row"><input type="checkbox" name="acceptsMarketing" defaultChecked={d.acceptsMarketing ?? true} /> Accepts marketing</label></div>
      </div>
      <div className="field-row">
        <div><label>Pays by</label>
          <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="on_day">On the day</option><option value="card">Card</option><option value="collection">Collection</option>
            <option value="by_post">By post</option><option value="online">Online</option><option value="direct_to_bank">Direct to bank</option>
            <option value="email_invoice">Email invoice</option><option value="paper_invoice">Paper invoice</option><option value="direct_debit">Direct debit</option>
          </select></div>
        {(invoiced || method === "direct_debit") && (
          <div><label>{invoiced ? "Invoice" : "Collect"}</label>
            <select name="invoiceFrequency" value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="manually">Manually</option>
              {invoiced && <option value="after_each_job">After each job</option>}
              {invoiced && <option value="overnight">Overnight</option>}
              <option value="periodically">Periodically</option>
              {invoiced && <option value="when_value_reaches">When value reaches</option>}
              {invoiced && <option value="when_jobs_done_reaches">When jobs done reaches</option>}
              {invoiced && <option value="before_each_job">Before each job</option>}
            </select></div>
        )}
        {freq === "periodically" && (invoiced || method === "direct_debit") && (
          <div><label>Every</label><div className="row">
            <input name="invoicePeriodNum" type="number" min={1} max={12} defaultValue={d.invoicePeriodNum ?? 1} style={{ width: 70 }} />
            <select name="invoicePeriodUnit" defaultValue={d.invoicePeriodUnit ?? "month"} style={{ width: 110 }}>
              <option value="day">days</option><option value="week">weeks</option><option value="month">months</option>
            </select></div></div>
        )}
        {freq === "when_jobs_done_reaches" && invoiced && (
          <div><label>Jobs done</label><input name="invoiceJobsThreshold" type="number" min={1} defaultValue={d.invoiceJobsThreshold ?? 2} /></div>
        )}
        {freq === "when_value_reaches" && invoiced && (
          <div><label>Value (£)</label><input name="invoiceValueThreshold" type="number" step="0.01" defaultValue={d.invoiceValueThreshold != null ? d.invoiceValueThreshold / 100 : ""} /></div>
        )}
      </div>
      {invoiced && (
        <div className="field-row">
          <div><label>Payment terms</label>
            <select name="paymentTermsType" defaultValue={d.paymentTermsType ?? ""}>
              <option value="">From settings</option><option value="not_required">Not required</option><option value="by_return">By return</option>
              <option value="cod">Cash on delivery</option><option value="net_from_invoice_date">Days from invoice date</option><option value="net_from_month_end">Days from month end</option>
            </select></div>
          <div><label>Days</label><input name="paymentTermsDays" type="number" min={0} defaultValue={d.paymentTermsDays ?? ""} /></div>
        </div>
      )}
      <div className="field-row">
        <div><label>Starting balance £ (negative if they owe you)</label><input name="startingBalance" type="number" step="0.01" defaultValue={(d.startingBalance ?? 0) / 100} /></div>
      </div>
      <label>Customer notes</label><textarea name="notes" defaultValue={d.notes ?? ""} />
    </fieldset>
  );
}

export interface JobDefaults { reference?: string | null; roundId?: string | null; taskId?: string | null; description?: string | null; notes?: string | null; price?: number; vatStatus?: string; timeRequired?: number; regularity?: string; timesPerPeriod?: number; numPeriods?: number; periodUnit?: string; allowedDays?: number; appointments?: string; nextDueOn?: string | null }

export function JobFields({ rounds, tasks, today, d, edit }: { rounds: { id: string; name: string }[]; tasks: { id: string; name: string; price: number | null }[]; today: string; d?: JobDefaults; edit?: boolean }) {
  const [location, setLocation] = useState("customer");
  const [roundId, setRoundId] = useState(d?.roundId ?? rounds[0]?.id ?? "new");
  const [regularity, setRegularity] = useState(d?.regularity ?? "regularly");
  return (
    <fieldset>
      <legend>Job</legend>
      {!edit && <label className="row"><input type="checkbox" name="estimate" /> This is an estimate (quote) for now</label>}
      <div className="field-row">
        {!edit && <div><label>Location</label>
          <select name="location" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="customer">Customer address</option><option value="other">Other address</option><option value="none">Not applicable</option>
          </select></div>}
        <div><label>Job reference</label><input name="jobReference" defaultValue={d?.reference ?? ""} placeholder="Defaults to first address line" /></div>
      </div>
      {!edit && location === "other" && <fieldset><legend>Job address</legend><ContactFields prefix="j_" /></fieldset>}
      <div className="field-row">
        <div><label>Round</label>
          <select name="roundId" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            <option value="new">New round…</option>
          </select></div>
        {roundId === "new" && <div><label>New round name</label><input name="newRoundName" required /></div>}
        <div><label>Task</label>
          <select name="taskId" defaultValue={d?.taskId ?? ""}>
            <option value="">None</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
      </div>
      <label>Description (shown on invoices)</label><textarea name="description" rows={2} defaultValue={d?.description ?? ""} />
      <div className="field-row">
        <div><label>Price £</label><input name="price" type="number" step="0.01" min={0} defaultValue={((d?.price ?? 0) / 100).toFixed(2)} /></div>
        <div><label>VAT</label>
          <select name="vatStatus" defaultValue={d?.vatStatus ?? "inc_vat"}>
            <option value="inc_vat">Inc VAT</option><option value="ex_vat">Ex VAT</option><option value="zero_rated">Zero rated</option>
            <option value="exempt">Exempt</option><option value="out_of_scope">Out of scope</option>
          </select></div>
        <div><label>Time (h : m)</label><div className="row">
          <input name="timeHours" type="number" min={0} max={24} defaultValue={Math.floor((d?.timeRequired ?? 30) / 60)} style={{ width: 64 }} />
          <input name="timeMinutes" type="number" min={0} max={59} defaultValue={(d?.timeRequired ?? 30) % 60} style={{ width: 64 }} /></div></div>
      </div>
      <label>Job notes (not shown on invoices)</label><textarea name="jobNotes" rows={2} defaultValue={d?.notes ?? ""} />
      <div className="field-row">
        <div><label>Frequency</label>
          <select name="regularity" value={regularity} onChange={(e) => setRegularity(e.target.value)}>
            <option value="one_off">One off</option><option value="on_request">On request</option><option value="regularly">Regularly</option>
          </select></div>
        {regularity === "regularly" && (
          <div><label>How often</label><div className="row">
            <select name="timesPerPeriod" defaultValue={String(d?.timesPerPeriod ?? 1)} style={{ width: 110 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 1 ? "Once" : n === 2 ? "Twice" : `${n} times`}</option>)}
            </select>
            <span>every</span>
            <input name="numPeriods" type="number" min={1} max={52} defaultValue={d?.numPeriods ?? 4} style={{ width: 64 }} />
            <select name="periodUnit" defaultValue={d?.periodUnit ?? "week"} style={{ width: 100 }}>
              <option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option>
            </select></div></div>
        )}
      </div>
      <label>Allowed days</label>
      <div className="row">{DAY_NAMES.map((n, i) => (
        <label key={n} className="row" style={{ margin: 0 }}><input type="checkbox" name="allowedDays" value={i} defaultChecked={((d?.allowedDays ?? 127) & (1 << i)) !== 0} /> {n}</label>
      ))}</div>
      <div className="field-row">
        <div><label>Appointments</label>
          <select name="appointments" defaultValue={d?.appointments ?? "none"}>
            <option value="none">No need to confirm</option><option value="confirm_day_before">Confirm the day before</option><option value="confirm_few_days_before">Confirm a few days before</option>
          </select></div>
        <div><label>{edit ? "Next due" : "First due"}</label><input name="firstDueOn" type="date" defaultValue={edit ? d?.nextDueOn ?? "" : today} /></div>
      </div>
    </fieldset>
  );
}

export function Errors({ state }: { state: FormState }) {
  if (!state?.errors?.length) return null;
  return <div className="notice error">{state.errors.map((e) => <div key={e}>{e}</div>)}</div>;
}

export function NewCustomerForm({ action, rounds, tasks, today }: { action: Action; rounds: { id: string; name: string }[]; tasks: { id: string; name: string; price: number | null }[]; today: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <Errors state={state} />
      <div className="grid cols-2">
        <CustomerFields />
        <JobFields rounds={rounds} tasks={tasks} today={today} />
      </div>
      <button className="btn primary" disabled={pending}>Save customer and job</button>
    </form>
  );
}

export function EditCustomerForm({ action, d }: { action: Action; d: CustomerDefaults }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} style={{ maxWidth: 760 }}>
      <Errors state={state} />
      <CustomerFields d={d} />
      <button className="btn primary" disabled={pending}>Save</button>
    </form>
  );
}

export function NewJobForm({ action, rounds, tasks, today }: { action: Action; rounds: { id: string; name: string }[]; tasks: { id: string; name: string; price: number | null }[]; today: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} style={{ maxWidth: 760 }}>
      <Errors state={state} />
      <JobFields rounds={rounds} tasks={tasks} today={today} />
      <button className="btn primary" disabled={pending}>Save job</button>
    </form>
  );
}

export function EditJobForm({ action, rounds, tasks, today, d }: { action: Action; rounds: { id: string; name: string }[]; tasks: { id: string; name: string; price: number | null }[]; today: string; d: JobDefaults }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} style={{ maxWidth: 760 }}>
      <Errors state={state} />
      <JobFields rounds={rounds} tasks={tasks} today={today} d={d} edit />
      <button className="btn primary" disabled={pending}>Save job</button>
    </form>
  );
}
