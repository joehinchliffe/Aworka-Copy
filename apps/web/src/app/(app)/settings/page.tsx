import { ActionForm } from "@/components/ActionForm";
import { DAY_NAMES } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getAccount, RETENTION_RULES, retentionRule } from "@/lib/services/settings";
import {
  businessAction, invoicingAction, jobDefaultsAction, passwordAction, plannerAction, retentionAction, taxesAction,
} from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SECTIONS = [
  ["business", "Business details"], ["taxes", "Taxes"], ["invoicing", "Invoicing"], ["planner", "Planner"],
  ["job-defaults", "Job defaults"], ["retention", "Data retention"], ["password", "Password"],
] as const;

function Check({ name, label, checked, value }: { name: string; label: string; checked?: boolean; value?: string | number }) {
  return <label className="row check"><input type="checkbox" name={name} value={value} defaultChecked={checked} /> {label}</label>;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const a = await getAccount(user.accountId);
  const st = a.settings;
  const canEdit = user.isOwner || user.permissions.has("edit_settings") || user.permissions.has("administrator");
  const daysWorked = st.daysWorked ?? 62;
  const time = st.defaultTimeRequired ?? 30;
  return (
    <>
      <h1>Settings</h1>
      <nav className="row settings-index no-print">
        {SECTIONS.filter(([k]) => canEdit || k === "password").map(([k, label]) => <a key={k} href={`#${k}`} className="btn small">{label}</a>)}
      </nav>
      {!canEdit && <div className="notice error">Your role does not allow you to edit the business settings.</div>}
      <div className="settings-sections">
        {canEdit && (
          <>
            <section id="business" className="panel">
              <h2>Business details</h2>
              <ActionForm action={businessAction}>
                <label>Business name</label><input name="businessName" defaultValue={a.businessName} required />
                <label>Address</label><textarea name="address" rows={3} defaultValue={st.address ?? ""} />
                <div className="field-row">
                  <div><label>Phone</label><input name="phone" type="tel" defaultValue={st.phone ?? ""} /></div>
                  <div><label>Website</label><input name="website" defaultValue={st.website ?? ""} placeholder="https://" /></div>
                </div>
                <label>Tax year ends</label>
                <div className="field-row">
                  <select name="yearEndDay" defaultValue={a.yearEndDay}>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                  <select name="yearEndMonth" defaultValue={a.yearEndMonth}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                </div>
              </ActionForm>
            </section>

            <section id="taxes" className="panel">
              <h2>Taxes</h2>
              <ActionForm action={taxesAction}>
                <Check name="collectsVat" label="Collect VAT" checked={a.collectsVat} />
                <label>VAT rate (%)</label><input name="vatRatePercent" type="number" step="0.01" min="0" max="100" defaultValue={Math.round(a.vatRate * 10000) / 100} style={{ maxWidth: 140 }} />
              </ActionForm>
            </section>

            <section id="invoicing" className="panel">
              <h2>Invoicing</h2>
              <ActionForm action={invoicingAction}>
                <div className="field-row">
                  <div><label>Title</label><input name="invoiceTitle" defaultValue={st.invoiceTitle ?? ""} placeholder="Invoice" /></div>
                  <div><label>Default job description</label><input name="defaultJobDescription" defaultValue={st.defaultJobDescription ?? ""} placeholder="Window cleaning" /></div>
                </div>
                <label>Notes</label><textarea name="invoiceNotes" defaultValue={st.invoiceNotes ?? ""} />
                <label>Small print</label><textarea name="invoiceSmallPrint" defaultValue={st.invoiceSmallPrint ?? ""} />
                <div className="field-row">
                  <div><label>Payment terms</label>
                    <select name="paymentTermsType" defaultValue={st.paymentTermsType ?? "not_required"}>
                      <option value="not_required">Not required</option><option value="by_return">By return</option><option value="cod">Cash on delivery</option>
                      <option value="net_from_invoice_date">Days from invoice date</option><option value="net_from_month_end">Days from month end</option>
                    </select></div>
                  <div><label>Days</label><input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={st.paymentTermsDays ?? 0} /></div>
                </div>
                <Check name="showNextDueOnInvoices" label="Show the next job date on invoices" checked={st.showNextDueOnInvoices} />
              </ActionForm>
            </section>

            <section id="planner" className="panel">
              <h2>Planner</h2>
              <ActionForm action={plannerAction}>
                <label>Days worked</label>
                <div className="row">{DAY_NAMES.map((d, i) => <Check key={d} name="daysWorked" value={i} label={d} checked={(daysWorked & (1 << i)) !== 0} />)}</div>
                <div className="field-row">
                  <div><label>First day of the week</label>
                    <select name="firstWeekDay" defaultValue={st.firstWeekDay ?? 1}>{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
                  <div><label>Order the add-jobs list by</label>
                    <select name="addJobsOrder" defaultValue={st.addJobsOrder ?? "next_due"}><option value="next_due">Next due date</option><option value="round_order">Round order</option></select></div>
                </div>
                <div className="field-row">
                  <div><label>Replan from</label>
                    <select name="replanFrom" defaultValue={st.replanFrom ?? "last_job"}><option value="last_job">Last job date</option><option value="last_due">Last due date</option></select></div>
                  <div><label>Set paid to</label>
                    <select name="defaultPaid" defaultValue={st.defaultPaid ?? "job_price"}><option value="job_price">Job price</option><option value="debt_balance">Debt balance</option></select></div>
                </div>
                <div className="field-row">
                  <div><label>Jobs left To Do</label>
                    <select name="autoMarkPolicy" defaultValue={st.autoMarkPolicy ?? "assume_not_done"}>
                      <option value="assume_not_done">are assumed Not Done</option>
                      <option value="mark_done_overnight">are marked Done overnight</option>
                      <option value="keep_until_next_due">stay To Do until the next job is due</option>
                    </select></div>
                  <div><label>after</label>
                    <select name="autoMarkAfterDays" defaultValue={st.autoMarkAfterDays ?? 7}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>)}
                      <option value={7}>1 week</option><option value={14}>2 weeks</option>
                    </select></div>
                </div>
              </ActionForm>
            </section>

            <section id="job-defaults" className="panel">
              <h2>Job defaults</h2>
              <ActionForm action={jobDefaultsAction}>
                <label>Time required for new jobs</label>
                <div className="row">
                  <input name="hours" type="number" min="0" max="24" defaultValue={Math.floor(time / 60)} style={{ maxWidth: 90 }} /> hours
                  <input name="minutes" type="number" min="0" max="59" defaultValue={time % 60} style={{ maxWidth: 90 }} /> minutes
                </div>
              </ActionForm>
            </section>

            <section id="retention" className="panel">
              <h2>Customer data retention</h2>
              <p className="small muted">Each rule runs automatically every night when switched on.</p>
              <ActionForm action={retentionAction}>
                {RETENTION_RULES.map((r) => {
                  const v = retentionRule(st, r.key);
                  return (
                    <div key={r.key} className="retention-rule">
                      <Check name={`${r.key}.enabled`} label={r.label} checked={v.enabled} />
                      <div className="row">
                        <span className="small muted">after</span>
                        <select name={`${r.key}.num`} defaultValue={v.num} style={{ maxWidth: 80 }}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                        <select name={`${r.key}.unit`} defaultValue={v.unit} style={{ maxWidth: 120 }}><option value="week">weeks</option><option value="month">months</option><option value="year">years</option></select>
                      </div>
                      <div className="small muted">{r.help}</div>
                    </div>
                  );
                })}
              </ActionForm>
            </section>
          </>
        )}

        <section id="password" className="panel">
          <h2>Change password</h2>
          <ActionForm action={passwordAction} submitLabel="Change password">
            <label>Existing password</label><input name="current" type="password" autoComplete="current-password" required />
            <label>New password</label><input name="password" type="password" autoComplete="new-password" minLength={8} required />
            <label>Confirm new password</label><input name="confirmation" type="password" autoComplete="new-password" minLength={8} required />
          </ActionForm>
        </section>
      </div>
    </>
  );
}
