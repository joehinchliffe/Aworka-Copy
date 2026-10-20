import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { money } from "@/lib/format";
import { roundsFor } from "@/lib/lookups";
import { requireUser } from "@/lib/session";
import { errorsOf } from "@/lib/services/access";
import { describeRevision, previewRevision, revisionForm } from "@/lib/services/priceRevisions";
import { applyRevisionAction } from "../actions";

type SP = Record<string, string | undefined>;
const FIELDS = ["roundId", "priceMin", "priceMax", "changedOnOrBefore", "kind", "percentage", "fixed", "roundTo", "minimumChange"] as const;

export default async function NewPriceRevisionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const rounds = await roundsFor(user.accountId);
  const v = (k: string, d = "") => sp[k] ?? d;

  let preview: Awaited<ReturnType<typeof previewRevision>> | null = null;
  let description = "";
  let errors: string[] = [];
  if (sp.preview) {
    try {
      const req = revisionForm.parse(Object.fromEntries(FIELDS.map((k) => [k, sp[k]])));
      preview = await previewRevision(user.accountId, req);
      description = describeRevision(req, rounds.find((r) => r.id === req.roundId)?.name);
    } catch (e) { errors = errorsOf(e)?.errors ?? []; }
  }

  return (
    <>
      <h1>New price revision</h1>
      <form className="panel" method="get">
        <input type="hidden" name="preview" value="1" />
        <div className="field-row">
          <div><label>Apply to jobs in</label>
            <select name="roundId" defaultValue={v("roundId", "all")}>
              <option value="all">All rounds</option>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
          <div><label>where the current price is at least (£)</label><input name="priceMin" type="number" step="0.01" min="0" defaultValue={v("priceMin")} placeholder="Any" /></div>
          <div><label>and at most (£)</label><input name="priceMax" type="number" step="0.01" min="0" defaultValue={v("priceMax")} placeholder="Any" /></div>
          <div><label>and was last changed on or before</label><input name="changedOnOrBefore" type="date" defaultValue={v("changedOnOrBefore")} /></div>
        </div>
        <div className="field-row">
          <div><label>Change prices by</label>
            <select name="kind" defaultValue={v("kind", "percentage")}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></div>
          <div><label>Percentage (%; negative lowers)</label><input name="percentage" type="number" step="0.01" defaultValue={v("percentage", "0")} /></div>
          <div><label>Fixed amount (£; negative lowers)</label><input name="fixed" type="number" step="0.01" defaultValue={v("fixed", "0.00")} /></div>
        </div>
        <div className="field-row">
          <div><label>and round to the nearest (£)</label><input name="roundTo" type="number" step="0.01" min="0" defaultValue={v("roundTo", "0.50")} /></div>
          <div><label>Keep the old price unless it changes by at least (£)</label><input name="minimumChange" type="number" step="0.01" min="0" defaultValue={v("minimumChange", "1.00")} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary">Preview</button>
          <Link href="/price-revisions">Cancel</Link>
        </div>
      </form>

      {errors.length > 0 && <div className="notice error" style={{ marginTop: 12 }}>{errors.map((e) => <div key={e}>{e}</div>)}</div>}

      {preview && (
        <div className="panel" style={{ marginTop: 12 }}>
          <h2>Preview: {description}</h2>
          <p className="small muted">
            {preview.items.length} job{preview.items.length === 1 ? "" : "s"} will change.
            {preview.unchanged > 0 && <> {preview.unchanged} keep their price because the change is below the minimum.</>}
            {preview.onTask > 0 && <> {preview.onTask} on a task are skipped; change the task&apos;s price instead.</>}
          </p>
          {preview.items.length > 0 && (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Job</th><th>Customer</th><th>Round</th><th className="num">Current</th><th className="num">New</th><th className="num">Change</th></tr></thead>
                  <tbody>
                    {preview.items.map((i) => (
                      <tr key={i.jobSpecId}>
                        <td><Link href={`/customers/${i.customerId}`}>{i.name}</Link></td>
                        <td>{i.customerName}</td>
                        <td>{i.roundName}</td>
                        <td className="num">{money(i.from)}</td>
                        <td className="num">{money(i.to)}</td>
                        <td className={`num ${i.to < i.from ? "debt" : "credit"}`}>{money(i.to - i.from)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ActionForm action={applyRevisionAction} submitLabel={`Apply to ${preview.items.length} job${preview.items.length === 1 ? "" : "s"}`}>
                {FIELDS.map((k) => <input key={k} type="hidden" name={k} value={sp[k] ?? ""} />)}
              </ActionForm>
            </>
          )}
        </div>
      )}
    </>
  );
}
