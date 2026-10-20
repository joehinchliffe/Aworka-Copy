import Link from "next/link";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";
import { PERIOD_UNIT_LABELS, type ExpensePeriodUnit } from "@/lib/expenseOptions";
import { listMileages, listVehicles, periodRange, suggestedStart } from "@/lib/services/expenses";
import { saveTripAction, saveVehicleAction } from "../actions";
import { TripForm, VehicleForm } from "../forms";

export default async function MileagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("record_expenses");
  const sp = await searchParams;
  const today = todayIso();
  const vehicles = await listVehicles(user.accountId);
  const starts = Object.fromEntries(await Promise.all(vehicles.map(async (v) => [v.id, await suggestedStart(user.accountId, v.id)] as const)));

  const n = Math.max(1, Number(sp.n) || 3);
  const unit = (sp.unit ?? "month") as ExpensePeriodUnit | "";
  const anchor = sp.anchor === "starting" ? "starting" : "ending";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const range = unit ? periodRange({ num: n, unit, anchor, date }) : null;
  const { trips, totals } = await listMileages(user.accountId, { vehicleId: sp.vehicle || undefined, from: range?.from, to: range?.to });

  return (
    <>
      <h1>Mileage</h1>
      <div className="grid cols-2" style={{ marginBottom: 12 }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Log a trip</h2>
          {vehicles.length > 0
            ? <TripForm action={saveTripAction.bind(null, null)} d={{ date: today }} vehicles={vehicles} starts={starts} submitLabel="Save trip" />
            : <p className="muted">Add a vehicle first.</p>}
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Vehicles</h2>
          {vehicles.map((v) => (
            <div key={v.id} className="spread exp-vehicle">
              <div>
                <Link href={`/expenses/mileage/vehicles/${v.id}`}><strong>{v.name}</strong></Link>
                {v.registration && <span className="muted"> · {v.registration}</span>}
                <div className="small muted">{money(v.ratePerMile)} a mile · latest reading {starts[v.id]?.toLocaleString("en-GB")}</div>
              </div>
            </div>
          ))}
          <details style={{ marginTop: 8 }} open={vehicles.length === 0}>
            <summary>Add a vehicle</summary>
            <VehicleForm action={saveVehicleAction.bind(null, null)} submitLabel="Add vehicle" />
          </details>
        </div>
      </div>

      <form className="panel no-print exp-filters" style={{ marginBottom: 12 }}>
        <select name="vehicle" defaultValue={sp.vehicle ?? ""} aria-label="Vehicle">
          <option value="">All vehicles</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <span className="row exp-period">
          <input name="n" type="number" min={1} defaultValue={n} aria-label="Number of periods" style={{ width: 70 }} />
          <select name="unit" defaultValue={unit} aria-label="Period">
            {Object.entries(PERIOD_UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <option value="">all time</option>
          </select>
          <select name="anchor" defaultValue={anchor} aria-label="Starting or ending">
            <option value="ending">ending</option><option value="starting">starting</option>
          </select>
          <input name="date" type="date" defaultValue={date} aria-label="Date" style={{ width: 160 }} />
        </span>
        <button className="btn">Show</button>
      </form>

      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Trips</div><div className="value">{trips.length}</div></div>
        <div className="stat"><div className="label">Miles</div><div className="value">{totals.miles.toLocaleString("en-GB")}</div></div>
        <div className="stat"><div className="label">Value</div><div className="value">{money(totals.value)}</div></div>
        <div className="stat"><div className="label">Pending</div><div className="value">{totals.pending}</div></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Vehicle</th><th className="num">Start</th><th className="num">Finish</th><th className="num">Miles</th><th className="num">Value</th><th>Notes</th></tr></thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.trip.id}>
                <td><Link href={`/expenses/mileage/${t.trip.id}`}>{formatDate(t.trip.date)}</Link></td>
                <td>{t.vehicle.name}</td>
                <td className="num">{t.trip.start.toLocaleString("en-GB")}</td>
                <td className="num">{t.pending ? <span className="badge warn">pending</span> : t.trip.finish?.toLocaleString("en-GB")}</td>
                <td className="num">{t.miles?.toLocaleString("en-GB")}</td>
                <td className="num">{money(t.value)}</td>
                <td>{t.trip.notes}</td>
              </tr>
            ))}
            {trips.length === 0 && <tr><td colSpan={7} className="muted">No trips for this selection.</td></tr>}
          </tbody>
          <tfoot><tr><th colSpan={4}>Total ({trips.length})</th><th className="num">{totals.miles.toLocaleString("en-GB")}</th><th className="num">{money(totals.value)}</th><th /></tr></tfoot>
        </table>
      </div>
    </>
  );
}
