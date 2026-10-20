import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { hasFeature } from "@/lib/plans";
import { computeVatReturn } from "@/lib/services/vat";
import { cumulativeSummary, HMRC_EXPENSE_CATEGORIES, taxYearLabel } from "@/lib/services/incomeTax";
import { reportsTaxYearStart } from "./taxYear";
import { SubmitToHmrc } from "@/components/SubmitToHmrc";
import { money } from "@/lib/format";
import { todayIso } from "@/lib/time";
import { connectHmrcAction, saveTaxSettingsAction, submitIncomeTaxAction, submitVatAction } from "./actions";

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; periodKey?: string; connected?: string }> }) {
  const user = await requireUser("edit_settings");
  const account = (await accountFor(user.accountId))!;
  const sp = await searchParams;
  const today = todayIso();
  const hmrc = await db.query.integrations.findFirst({ where: and(eq(schema.integrations.accountId, user.accountId), eq(schema.integrations.provider, "hmrc")) });
  const reg = account.settings.vatRegistration;
  const it = account.settings.incomeTax;
  const qStart = sp.start ?? `${today.slice(0, 7)}-01`;
  const qEnd = sp.end ?? today;
  const vat = reg?.regNo && account.collectsVat ? await computeVatReturn(user.accountId, { ...reg, rate: account.vatRate }, qStart, qEnd) : null;
  const tyStart = reportsTaxYearStart(today);
  const income = await cumulativeSummary(user.accountId, tyStart, today, { basis: it?.basis ?? "cash", consolidated: it?.consolidated });
  return (
    <>
      <h1>Tax and Making Tax Digital</h1>
      {sp.connected && <div className="notice ok">Connected to HMRC.</div>}
      <div className="grid cols-2">
        <form action={saveTaxSettingsAction} className="panel">
          <h2 style={{ marginTop: 0 }}>Your details</h2>
          <label>VAT registration number</label><input name="regNo" defaultValue={reg?.regNo ?? ""} />
          <div className="field-row">
            <div><label>VAT scheme</label><select name="scheme" defaultValue={reg?.scheme ?? "standard"}>
              <option value="standard">Standard</option><option value="cash_accounting">Cash accounting</option>
              <option value="flat_rate">Flat rate</option><option value="flat_rate_cash">Flat rate (cash turnover)</option><option value="annual">Annual accounting</option></select></div>
            <div><label>Flat rate %</label><input name="flatRate" type="number" step="0.1" defaultValue={reg?.flatRate ? reg.flatRate * 100 : ""} /></div>
          </div>
          <label>National Insurance number</label><input name="nino" defaultValue={it?.nino ?? ""} />
          <label>HMRC self-employment business ID</label><input name="businessId" defaultValue={it?.businessId ?? ""} placeholder="e.g. XAIS12345678901" />
          <div className="field-row">
            <div><label>Accounting basis</label><select name="basis" defaultValue={it?.basis ?? "cash"}><option value="cash">Cash basis</option><option value="accrual">Traditional (accrual)</option></select></div>
            <div><label>&nbsp;</label><label className="row"><input type="checkbox" name="consolidated" defaultChecked={it?.consolidated} /> Send expenses as one total</label></div>
          </div>
          <p><button className="btn">Save</button></p>
        </form>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>HMRC connection</h2>
          <p>{hmrc ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>} <span className="small muted">{process.env.HMRC_ENV === "production" ? "Live" : "HMRC sandbox"}</span></p>
          <form action={connectHmrcAction} className="row">
            <select name="scope" defaultValue="vat_and_income_tax" style={{ maxWidth: 240 }}>
              <option value="vat">VAT</option><option value="income_tax">Income Tax</option><option value="vat_and_income_tax">VAT and Income Tax</option></select>
            <button className="btn primary">{hmrc ? "Reconnect" : "Connect to HMRC"}</button>
          </form>
          <p className="small muted">You will sign in with your Government Gateway account on HMRC's site.</p>
        </div>
      </div>

      <h2>VAT return</h2>
      {!account.collectsVat ? <p className="muted">Turn on "Collect VAT" in Settings to prepare VAT returns.</p>
        : !hasFeature(account, "vat", today) ? <p className="muted">VAT returns are part of the Team plan.</p>
        : !vat ? <p className="muted">Enter your VAT registration number above.</p> : (
        <div className="panel">
          <form className="row" style={{ marginBottom: 8 }}>
            <label>From</label><input type="date" name="start" defaultValue={qStart} style={{ width: 170 }} />
            <label>To</label><input type="date" name="end" defaultValue={qEnd} style={{ width: 170 }} />
            <label>Period key</label><input name="periodKey" defaultValue={sp.periodKey ?? ""} style={{ width: 90 }} />
            <button className="btn">Calculate</button>
          </form>
          <table><tbody>
            <tr><td>1 VAT due on sales</td><td className="num">{money(vat.vatDueSales)}</td></tr>
            <tr><td>2 VAT due on acquisitions</td><td className="num">{money(vat.vatDueAcquisitions)}</td></tr>
            <tr><td>3 Total VAT due</td><td className="num">{money(vat.totalVatDue)}</td></tr>
            <tr><td>4 VAT reclaimed on purchases</td><td className="num">{money(vat.vatReclaimedCurrPeriod)}</td></tr>
            <tr><th>5 Net VAT {vat.totalVatDue >= vat.vatReclaimedCurrPeriod ? "to pay" : "to reclaim"}</th><th className="num">{money(vat.netVatDue)}</th></tr>
            <tr><td>6 Total sales ex VAT</td><td className="num">£{vat.totalValueSalesExVAT}</td></tr>
            <tr><td>7 Total purchases ex VAT</td><td className="num">£{vat.totalValuePurchasesExVAT}</td></tr>
            <tr><td>8 Goods supplied to EU</td><td className="num">£0</td></tr>
            <tr><td>9 Acquisitions from EU</td><td className="num">£0</td></tr>
          </tbody></table>
          {hmrc && sp.periodKey && <div style={{ marginTop: 8 }}><SubmitToHmrc action={submitVatAction} hidden={{ start: qStart, end: qEnd, periodKey: sp.periodKey }} label="Submit to HMRC" /></div>}
          {!sp.periodKey && <p className="small muted">Enter the period key from your HMRC obligations to submit.</p>}
        </div>
      )}

      <h2>Income Tax quarterly update · {taxYearLabel(today)} to date</h2>
      <div className="panel">
        <p>Turnover: <strong>£{income.periodIncome.turnover.toFixed(2)}</strong> ({it?.basis === "accrual" ? "work done" : "money received"})</p>
        {income.periodExpensesConsolidated != null ? <p>Expenses (one total): <strong>£{income.periodExpensesConsolidated.toFixed(2)}</strong></p> : (
          <table><tbody>{Object.entries(income.periodExpenses ?? {}).map(([k, v]) => (
            <tr key={k}><td>{HMRC_EXPENSE_CATEGORIES[k as keyof typeof HMRC_EXPENSE_CATEGORIES]}</td><td className="num">£{(v as number).toFixed(2)}</td></tr>
          ))}</tbody></table>
        )}
        {hmrc && hasFeature(account, "mtd_income_tax", today)
          ? <SubmitToHmrc action={submitIncomeTaxAction} hidden={{ start: tyStart, end: today }} label="Send quarterly update" />
          : <p className="small muted">Connect to HMRC to send quarterly updates.</p>}
        <p className="small muted">Updates are cumulative: each one replaces the year-to-date figures HMRC holds.</p>
      </div>
    </>
  );
}
