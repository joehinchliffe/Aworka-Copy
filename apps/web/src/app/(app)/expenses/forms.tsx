"use client";
import { useActionState, useState } from "react";
import { Errors } from "@/components/CustomerForm";
import {
  EXPENSE_METHOD_LABELS, EXPENSE_VAT_LABELS, PERIOD_UNIT_LABELS, SCHEDULE_LABELS, type TaxTreatment,
} from "@/lib/expenseOptions";

type FormState = { errors?: string[]; ok?: string; at?: number } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;
type Option = { id: string; name: string; enabled: boolean };

const pounds = (p: number | null | undefined) => (p == null ? "" : (p / 100).toFixed(2));
const pct = (r: number | null | undefined) => (r == null ? "" : String(Math.round(r * 10000) / 100));

function Status({ state }: { state: FormState }) {
  return (
    <>
      <Errors state={state} />
      {state?.ok && <div className="notice ok">{state.ok}</div>}
    </>
  );
}

/** A select of existing records plus "New…", which reveals a text box. */
function PickOrNew({ kind, label, options, value, required }: { kind: "category" | "supplier"; label: string; options: Option[]; value?: string | null; required?: boolean }) {
  const [v, setV] = useState(value ?? (required && options.length === 0 ? "new" : ""));
  const shown = options.filter((o) => o.enabled || o.id === value);
  return (
    <div>
      <label htmlFor={`${kind}Id`}>{label}</label>
      <select id={`${kind}Id`} name={`${kind}Id`} value={v} onChange={(e) => setV(e.target.value)}>
        {!required && <option value="">None</option>}
        {required && v === "" && <option value="">Choose…</option>}
        {shown.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        <option value="new">New {kind}…</option>
      </select>
      {v === "new" && <input name={`new_${kind}`} placeholder={`New ${kind} name`} aria-label={`New ${kind} name`} style={{ marginTop: 4 }} autoFocus />}
    </div>
  );
}

function MethodSelect({ value }: { value?: string | null }) {
  return (
    <div>
      <label htmlFor="method">Paid by</label>
      <select id="method" name="method" defaultValue={value ?? ""}>
        <option value="">Not set</option>
        {Object.entries(EXPENSE_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}

export interface ExpenseDefaults {
  date: string;
  categoryId?: string | null;
  supplierId?: string | null;
  reference?: string | null;
  description?: string | null;
  amount?: number | null;
  vatStatus?: string;
  vatRate?: number;
  vatCharged?: number | null;
  method?: string | null;
  paymentReference?: string | null;
  taxTreatment?: TaxTreatment;
  privateUsePercent?: number | null;
  allowable?: number | null;
  taxNotes?: string | null;
}

export function ExpenseForm({ action, d, categories, suppliers, isNew }: { action: Action; d: ExpenseDefaults; categories: Option[]; suppliers: Option[]; isNew?: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [vatStatus, setVatStatus] = useState(d.vatStatus ?? "inc_at_rate");
  const [treatment, setTreatment] = useState<TaxTreatment>(d.taxTreatment ?? "all_business");
  return (
    <form action={formAction} style={{ maxWidth: 760 }}>
      <Status state={state} />
      <fieldset>
        <legend>Expense</legend>
        <div className="field-row">
          <div><label htmlFor="date">Date</label><input id="date" name="date" type="date" required defaultValue={d.date} /></div>
          <PickOrNew kind="category" label="Category" options={categories} value={d.categoryId} required />
          <PickOrNew kind="supplier" label="Supplier" options={suppliers} value={d.supplierId} />
        </div>
        <div className="field-row">
          <div><label htmlFor="reference">Reference</label><input id="reference" name="reference" defaultValue={d.reference ?? ""} placeholder="e.g. receipt number" /></div>
          <div style={{ gridColumn: "span 2" }}><label htmlFor="description">Description</label><input id="description" name="description" defaultValue={d.description ?? ""} /></div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor="amount">Amount (£)</label>
            <input id="amount" name="amount" inputMode="decimal" defaultValue={pounds(d.amount)} placeholder="Leave blank to add later" />
          </div>
          <MethodSelect value={d.method} />
          <div><label htmlFor="paymentReference">Payment reference</label><input id="paymentReference" name="paymentReference" defaultValue={d.paymentReference ?? ""} /></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>VAT</legend>
        <div className="field-row">
          <div>
            <label htmlFor="vatStatus">VAT status</label>
            <select id="vatStatus" name="vatStatus" value={vatStatus} onChange={(e) => setVatStatus(e.target.value)}>
              {Object.entries(EXPENSE_VAT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {vatStatus === "inc_at_rate" && (
            <div><label htmlFor="vatRate">VAT rate (%)</label><input id="vatRate" name="vatRate" inputMode="decimal" defaultValue={pct(d.vatRate ?? 0.2)} /></div>
          )}
          {vatStatus === "inc_charged" && (
            <div><label htmlFor="vatCharged">VAT charged (£)</label><input id="vatCharged" name="vatCharged" inputMode="decimal" defaultValue={pounds(d.vatCharged)} /></div>
          )}
        </div>
        {vatStatus !== "inc_at_rate" && <input type="hidden" name="vatRate" value={pct(d.vatRate ?? 0.2)} />}
      </fieldset>
      <fieldset>
        <legend>Income tax</legend>
        <div className="row exp-radios" role="radiogroup" aria-label="Tax treatment">
          {([["all_business", "All business use"], ["private_use", "Part private use"], ["custom", "Custom amount"]] as const).map(([k, l]) => (
            <label key={k} className="row"><input type="radio" name="taxTreatment" value={k} checked={treatment === k} onChange={() => setTreatment(k)} /> {l}</label>
          ))}
        </div>
        <div className="field-row">
          {treatment !== "all_business" && (
            <div><label htmlFor="privateUsePercent">Private use (%)</label><input id="privateUsePercent" name="privateUsePercent" inputMode="decimal" defaultValue={d.privateUsePercent ?? ""} /></div>
          )}
          {treatment === "custom" && (
            <div><label htmlFor="allowable">Allowable for income tax (£)</label><input id="allowable" name="allowable" inputMode="decimal" defaultValue={pounds(d.allowable)} /></div>
          )}
        </div>
        <p className="small muted">Reclaimable VAT and the allowable amount are worked out when you save{treatment === "custom" ? "; the custom amount replaces the allowable amount" : ""}.</p>
        <label htmlFor="taxNotes">Tax notes</label><textarea id="taxNotes" name="taxNotes" defaultValue={d.taxNotes ?? ""} rows={2} />
      </fieldset>
      <div className="row">
        <button className="btn primary" disabled={pending}>Save</button>
        {isNew && <button className="btn" name="another" value="1" disabled={pending}>Save and add another</button>}
      </div>
    </form>
  );
}

export interface RecurringDefaults {
  categoryId?: string | null;
  supplierId?: string | null;
  description?: string | null;
  amount?: number | null;
  vatStatus?: string;
  vatRate?: number;
  method?: string | null;
  everyNum?: number;
  everyUnit?: string;
  nextDueOn: string;
  schedule?: string;
  endOn?: string | null;
  count?: number | null;
  totalLimit?: number | null;
}

export function RecurringForm({ action, d, categories, suppliers }: { action: Action; d: RecurringDefaults; categories: Option[]; suppliers: Option[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [vatStatus, setVatStatus] = useState(d.vatStatus ?? "inc_at_rate");
  const [schedule, setSchedule] = useState(d.schedule ?? "forever");
  return (
    <form action={formAction} style={{ maxWidth: 760 }}>
      <Status state={state} />
      <fieldset>
        <legend>Expense to repeat</legend>
        <div className="field-row">
          <PickOrNew kind="category" label="Category" options={categories} value={d.categoryId} required />
          <PickOrNew kind="supplier" label="Supplier" options={suppliers} value={d.supplierId} />
          <MethodSelect value={d.method} />
        </div>
        <div className="field-row">
          <div style={{ gridColumn: "span 2" }}><label htmlFor="description">Description</label><input id="description" name="description" defaultValue={d.description ?? ""} /></div>
          <div><label htmlFor="amount">Amount (£)</label><input id="amount" name="amount" inputMode="decimal" defaultValue={pounds(d.amount)} placeholder="Blank to add later" /></div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor="vatStatus">VAT status</label>
            <select id="vatStatus" name="vatStatus" value={vatStatus} onChange={(e) => setVatStatus(e.target.value)}>
              {Object.entries(EXPENSE_VAT_LABELS).filter(([k]) => k !== "inc_charged").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {vatStatus === "inc_at_rate"
            ? <div><label htmlFor="vatRate">VAT rate (%)</label><input id="vatRate" name="vatRate" inputMode="decimal" defaultValue={pct(d.vatRate ?? 0.2)} /></div>
            : <input type="hidden" name="vatRate" value={pct(d.vatRate ?? 0.2)} />}
        </div>
      </fieldset>
      <fieldset>
        <legend>Schedule</legend>
        <div className="field-row">
          <div><label htmlFor="everyNum">Every</label><input id="everyNum" name="everyNum" type="number" min={1} defaultValue={d.everyNum ?? 1} /></div>
          <div><label htmlFor="everyUnit">&nbsp;</label>
            <select id="everyUnit" name="everyUnit" aria-label="Period" defaultValue={d.everyUnit ?? "month"}>
              {Object.entries(PERIOD_UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div><label htmlFor="nextDueOn">Next due</label><input id="nextDueOn" name="nextDueOn" type="date" required defaultValue={d.nextDueOn} /></div>
        </div>
        <div className="field-row">
          <div>
            <label htmlFor="schedule">Continue</label>
            <select id="schedule" name="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
              {Object.entries(SCHEDULE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {schedule === "count" && <div><label htmlFor="count">Payments left</label><input id="count" name="count" type="number" min={1} defaultValue={d.count ?? ""} /></div>}
          {schedule === "until_date" && <div><label htmlFor="endOn">Last date</label><input id="endOn" name="endOn" type="date" defaultValue={d.endOn ?? ""} /></div>}
          {schedule === "until_total" && <div><label htmlFor="totalLimit">Total (£)</label><input id="totalLimit" name="totalLimit" inputMode="decimal" defaultValue={pounds(d.totalLimit)} /></div>}
        </div>
        <p className="small muted">Any payments already due are added as expenses when you save. Changing this later never alters expenses already added.</p>
      </fieldset>
      <button className="btn primary" disabled={pending}>Save</button>
    </form>
  );
}

/** One editable category or supplier, with its flags. */
export function NamedItemRow({ save, remove, d, flags }: {
  save: Action; remove?: Action;
  d: { name: string; enabled: boolean } & Record<string, unknown>;
  flags: { name: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(save, undefined);
  const [delState, delAction, delPending] = useActionState(remove ?? (async () => undefined), undefined);
  return (
    <div className="exp-item">
      <form action={formAction} className="exp-item-form">
        <input name="name" defaultValue={d.name} aria-label="Name" required />
        <label className="row"><input type="checkbox" name="enabled" defaultChecked={d.enabled} /> Enabled</label>
        {flags.map((fl) => <label key={fl.name} className="row"><input type="checkbox" name={fl.name} defaultChecked={!!d[fl.name]} /> {fl.label}</label>)}
        <button className="btn small" disabled={pending}>Save</button>
        {remove && <button className="btn small danger" formAction={delAction} disabled={delPending}
          onClick={(e) => { if (!confirm(`Delete ${d.name}?`)) e.preventDefault(); }}>Delete</button>}
      </form>
      <Status state={delState?.errors ? delState : state} />
    </div>
  );
}

export function NewNamedItem({ save, flags, placeholder }: { save: Action; flags: { name: string; label: string }[]; placeholder: string }) {
  const [state, formAction, pending] = useActionState(save, undefined);
  return (
    <form action={formAction} key={state?.ok ?? ""} className="panel" style={{ marginBottom: 12 }}>
      <Status state={state} />
      <div className="exp-item-form">
        <input name="name" placeholder={placeholder} aria-label={placeholder} required />
        <input type="hidden" name="enabled" value="on" />
        {flags.map((fl) => <label key={fl.name} className="row"><input type="checkbox" name={fl.name} /> {fl.label}</label>)}
        <button className="btn primary small" disabled={pending}>Add</button>
      </div>
    </form>
  );
}

export interface VehicleDefaults { name?: string; registration?: string | null; acquiredOn?: string | null; startMileage?: number; ratePerMile?: number; notes?: string | null }

export function VehicleForm({ action, d = {}, submitLabel }: { action: Action; d?: VehicleDefaults; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} key={state?.ok ?? ""}>
      <Status state={state} />
      <div className="field-row">
        <div><label htmlFor="v_name">Name</label><input id="v_name" name="name" required defaultValue={d.name ?? ""} placeholder="e.g. Van" /></div>
        <div><label htmlFor="v_reg">Registration</label><input id="v_reg" name="registration" defaultValue={d.registration ?? ""} /></div>
        <div><label htmlFor="v_acq">Acquired</label><input id="v_acq" name="acquiredOn" type="date" defaultValue={d.acquiredOn ?? ""} /></div>
      </div>
      <div className="field-row">
        <div><label htmlFor="v_start">Initial mileage</label><input id="v_start" name="startMileage" type="number" min={0} defaultValue={d.startMileage ?? 0} /></div>
        <div><label htmlFor="v_rate">Rate per mile (£)</label><input id="v_rate" name="ratePerMile" inputMode="decimal" defaultValue={pounds(d.ratePerMile ?? 45)} /></div>
      </div>
      <label htmlFor="v_notes">Notes</label><textarea id="v_notes" name="notes" rows={2} defaultValue={d.notes ?? ""} />
      <button className="btn primary" disabled={pending} style={{ marginTop: 8 }}>{submitLabel}</button>
    </form>
  );
}

export interface TripDefaults { vehicleId?: string; date: string; start?: number | null; finish?: number | null; notes?: string | null }

export function TripForm({ action, d, vehicles, starts, submitLabel }: {
  action: Action; d: TripDefaults; vehicles: { id: string; name: string }[]; starts?: Record<string, number>; submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      <Status state={state} />
      {/* Remount after each saved trip so the start reading picks up the new latest finish. */}
      <TripFields key={state?.at ?? "first"} d={d} vehicles={vehicles} starts={starts} />
      <button className="btn primary" disabled={pending} style={{ marginTop: 8 }}>{submitLabel}</button>
    </form>
  );
}

function TripFields({ d, vehicles, starts }: { d: TripDefaults; vehicles: { id: string; name: string }[]; starts?: Record<string, number> }) {
  const [vehicleId, setVehicleId] = useState(d.vehicleId ?? vehicles[0]?.id ?? "");
  const [start, setStart] = useState(String(d.start ?? starts?.[vehicleId] ?? ""));
  return (
    <>
      <div className="field-row">
        <div><label htmlFor="t_vehicle">Vehicle</label>
          <select id="t_vehicle" name="vehicleId" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); if (starts) setStart(String(starts[e.target.value] ?? "")); }}>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></div>
        <div><label htmlFor="t_date">Date</label><input id="t_date" name="date" type="date" required defaultValue={d.date} /></div>
        <div><label htmlFor="t_start">Start mileage</label><input id="t_start" name="start" type="number" min={0} required value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label htmlFor="t_finish">Finish mileage</label><input id="t_finish" name="finish" type="number" min={0} defaultValue={d.finish ?? ""} placeholder="Blank if not finished" /></div>
      </div>
      <label htmlFor="t_notes">Notes</label><input id="t_notes" name="notes" defaultValue={d.notes ?? ""} />
    </>
  );
}

/** A button that runs a server action after the user confirms. */
export function ConfirmButton({ action, label, question }: { action: () => Promise<void>; label: string; question: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(question)) e.preventDefault(); }}>
      <button className="btn danger">{label}</button>
    </form>
  );
}
