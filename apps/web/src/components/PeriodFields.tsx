import { periodRange, type PeriodUnit } from "@/lib/period";

export interface PeriodParams { num: number; unit: PeriodUnit; anchor: "starting" | "ending"; date: string }

/** Read a "N units starting/ending on date" period from search params. */
export function readPeriod(sp: Record<string, string | undefined>, defaults: PeriodParams) {
  const num = Math.min(52, Math.max(1, Math.trunc(Number(sp.num)) || defaults.num));
  const unit = (["day", "week", "month", "year"].includes(sp.unit ?? "") ? sp.unit : defaults.unit) as PeriodUnit;
  const anchor = sp.anchor === "starting" || sp.anchor === "ending" ? sp.anchor : defaults.anchor;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : defaults.date;
  const p: PeriodParams = { num, unit, anchor, date };
  return { ...p, ...periodRange(num, unit, anchor, date) };
}

export function PeriodFields({ p }: { p: PeriodParams }) {
  return (
    <>
      <select name="num" defaultValue={p.num} style={{ maxWidth: 80 }} aria-label="Number of periods">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select name="unit" defaultValue={p.unit} style={{ maxWidth: 110 }} aria-label="Period">
        <option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option>
      </select>
      <select name="anchor" defaultValue={p.anchor} style={{ maxWidth: 120 }} aria-label="Starting or ending">
        <option value="starting">starting</option><option value="ending">ending</option>
      </select>
      <input type="date" name="date" defaultValue={p.date} style={{ maxWidth: 170 }} aria-label="Date" />
    </>
  );
}
