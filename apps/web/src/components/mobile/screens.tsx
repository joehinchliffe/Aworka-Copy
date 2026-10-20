"use client";
import { useMemo, useState } from "react";
import { addDays, balanceAfterJob, defaultPaid, formatPence, splitTip, toPence } from "@rounds/domain";
import type { SnapshotCustomer, SnapshotJob } from "@/lib/services/sync";
import { PAY_METHODS } from "@/lib/format";
import { formatDate, formatDay } from "@/lib/time";
import { describeChange, grossOf, jobsOn } from "./apply";
import type { AppApi } from "./MobileApp";
import type { OutboxItem, SyncMeta } from "./store";

const STATUS_LABEL: Record<string, string> = { to_do: "To do", done: "Done", not_done: "Not done", skipped: "Skipped", estimate: "Estimate" };
const QUICK_METHODS = ["cash", "card", "bank_transfer", "cheque", "online"];

const pounds = (p: number) => (p / 100).toFixed(2);
function parseMoney(s: string): number | null {
  try { return s.trim() === "" ? null : toPence(s); } catch { return null; }
}
function balanceText(b: number) {
  if (b < 0) return <span className="m-owed">{formatPence(-b)} owed</span>;
  if (b > 0) return <span className="m-credit">{formatPence(b)} credit</span>;
  return <span className="m-muted">Nothing owed</span>;
}
function relDay(d: string, today: string) {
  if (d === today) return "Today";
  if (d === addDays(today, -1)) return "Yesterday";
  if (d === addDays(today, 1)) return "Tomorrow";
  return formatDay(d);
}

function MethodSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="m-sheet-wrap" onClick={onClose}>
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <h2>{title}</h2>
          <button className="m-btn m-ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Jobs for a day ---------- */

export function TodayScreen({ api, day, setDay, onAddDue }: { api: AppApi; day: string; setDay: (d: string) => void; onAddDue: () => void }) {
  const { snapshot: s, today } = api;
  const [open, setOpen] = useState<string | null>(null);
  const jobs = jobsOn(s, day);
  const customers = useMemo(() => new Map(s.customers.map((c) => [c.id, c])), [s.customers]);
  const value = jobs.reduce((t, j) => t + j.gross, 0);
  const done = jobs.filter((j) => j.status === "done").reduce((t, j) => t + j.gross, 0);
  const left = jobs.filter((j) => j.status === "to_do").length;
  const chips = [-1, 0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, n));
  const canPrev = addDays(day, -1) >= s.window.start;
  const canNext = addDays(day, 1) <= s.window.end;
  const job = jobs.find((j) => j.id === open) ?? s.jobs.find((j) => j.id === open);

  return (
    <>
      <div className="m-daybar">
        <button className="m-btn" disabled={!canPrev} onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">‹</button>
        <h1>{relDay(day, today)}<small>{formatDate(day)}</small></h1>
        <button className="m-btn" disabled={!canNext} onClick={() => setDay(addDays(day, 1))} aria-label="Next day">›</button>
      </div>
      <div className="m-chips" role="tablist" aria-label="Choose day">
        {chips.map((d) => (
          <button key={d} role="tab" aria-selected={d === day} className={d === day ? "on" : ""} onClick={() => setDay(d)}>
            {d === today ? "Today" : d === addDays(today, -1) ? "Yest." : formatDay(d).split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
      </div>
      <div className="m-summary">
        <span><b>{jobs.length}</b> job{jobs.length === 1 ? "" : "s"}</span><span><b>{left}</b> left</span>
        <span><b>{formatPence(done)}</b> of {formatPence(value)}</span>
      </div>
      {jobs.length === 0 && <p className="m-empty">No jobs on this day.</p>}
      <ul className="m-list">
        {jobs.map((j) => {
          const c = customers.get(j.customerId);
          return (
            <li key={j.id}>
              <button className="m-job" onClick={() => setOpen(j.id)}>
                <span className="m-job-main">
                  <b>{j.name || j.customerName}</b>
                  <span className="m-muted">{j.customerName}{j.roundName ? ` · ${j.roundName}` : ""}</span>
                  {c && c.balance < 0 && <span className="m-owed small">{formatPence(-c.balance)} owed</span>}
                </span>
                <span className="m-job-side">
                  <span>{formatPence(j.gross)}</span>
                  <span className={`m-chip s-${j.status}`}>{STATUS_LABEL[j.status] ?? j.status}</span>
                  {j.paid && <span className="m-chip s-paid">Paid</span>}
                  {j.id.startsWith("local:") && <span className="m-chip">Not synced</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {api.can("add_jobs") && <button className="m-btn m-wide" onClick={onAddDue}>Add due jobs to {relDay(day, today).toLowerCase()}</button>}
      {job && <JobSheet api={api} job={job} customer={customers.get(job.customerId)} onClose={() => setOpen(null)} />}
    </>
  );
}

function JobSheet({ api, job, customer, onClose }: { api: AppApi; job: SnapshotJob; customer?: SnapshotCustomer; onClose: () => void }) {
  const { snapshot: s, today } = api;
  const canPay = api.can("enter_payments");
  const canPrice = api.can("adjust_prices");
  const balance = customer?.balance ?? 0;
  // The balance before this visit was charged (an already-done job is in the balance).
  const balanceBefore = balance + (job.status === "done" ? job.gross : 0);
  const [status, setStatus] = useState<"done" | "not_done" | "skipped">(job.status === "not_done" || job.status === "skipped" ? job.status : "done");
  const [priceText, setPriceText] = useState(pounds(job.price));
  const [keepPrice, setKeepPrice] = useState(false);
  const price = canPrice ? parseMoney(priceText) ?? job.price : job.price;
  const gross = grossOf(price, job.vatStatus, job.vatRate);
  const suggested = defaultPaid(balanceBefore, gross, s.settings.defaultPaid);
  const [paidText, setPaidText] = useState<string | null>(null);
  const paidShown = paidText ?? pounds(suggested);
  const [incTip, setIncTip] = useState(true);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState(job.notes ?? "");
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const paid = status === "done" && canPay ? parseMoney(paidShown) ?? 0 : 0;
  const split = incTip ? splitTip(paid, gross) : { paid, tip: 0 };
  const after = balanceAfterJob(balanceBefore, status === "done" ? gross : 0, split.paid, split.tip);
  const moveDays = useMemo(() => {
    const out: string[] = [];
    for (let d = today; d <= s.window.end; d = addDays(d, 1)) if (d !== job.date) out.push(d);
    return out;
  }, [today, s.window.end, job.date]);

  async function save() {
    if (status === "done" && canPay && parseMoney(paidShown) === null && paidShown.trim() !== "") return setError("Enter the amount paid, like 15.00");
    if (canPrice && parseMoney(priceText) === null) return setError("Enter a price, like 15.00");
    await api.queue({
      type: "complete_job", clientId: api.newId(), jobId: job.id,
      input: {
        status,
        ...(paid !== 0 ? { paid, includesTip: incTip, method } : {}),
        ...(canPrice && price !== job.price ? { price, permanent: keepPrice } : {}),
        notes: notes.trim() ? notes.trim() : null,
      },
    }, `${job.name || job.customerName}: ${STATUS_LABEL[status]}`);
    onClose();
  }

  async function move() {
    if (!moveTo) return;
    await api.queue({ type: "move_job", clientId: api.newId(), jobId: job.id, date: moveTo }, `Moved to ${formatDay(moveTo)}`);
    onClose();
  }

  return (
    <Sheet title={job.name || job.customerName} onClose={onClose}>
      <p className="m-muted">
        {job.customerName}{customer?.address ? ` · ${customer.address}` : ""}
        {customer?.phone && <> · <a href={`tel:${customer.phone.replace(/\s/g, "")}`}>{customer.phone}</a></>}
      </p>
      <p>Now: <span className={`m-chip s-${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span> · {balanceText(balance)}</p>
      {job.notes && <p className="m-note">{job.notes}</p>}
      <div className="m-seg" role="group" aria-label="What happened">
        {(["done", "not_done", "skipped"] as const).map((st) => (
          <button key={st} aria-pressed={status === st} className={status === st ? "on" : ""} onClick={() => setStatus(st)}>
            {st === "done" ? "Done" : st === "not_done" ? "Not done" : "Skip"}
          </button>
        ))}
      </div>
      {status === "done" && canPay && (
        <>
          <label htmlFor="m-paid">Paid £</label>
          <input id="m-paid" inputMode="decimal" value={paidShown} onChange={(e) => setPaidText(e.target.value)} onFocus={(e) => e.target.select()} />
          <div className="m-row">
            <button className="m-btn m-small" onClick={() => setPaidText(pounds(gross))}>Price {formatPence(gross)}</button>
            {balanceBefore < 0 && <button className="m-btn m-small" onClick={() => setPaidText(pounds(gross - balanceBefore))}>All owed {formatPence(gross - balanceBefore)}</button>}
            <button className="m-btn m-small" onClick={() => setPaidText("0.00")}>Unpaid</button>
          </div>
          <label className="m-check"><input type="checkbox" checked={incTip} onChange={(e) => setIncTip(e.target.checked)} /> Anything over the price is a tip</label>
          {incTip && split.tip > 0 && <p className="m-muted">Tip {formatPence(split.tip)}</p>}
          <label htmlFor="m-method">Method</label>
          <MethodSelect id="m-method" value={method} onChange={setMethod} />
        </>
      )}
      {canPrice ? (
        <>
          <label htmlFor="m-price">Price £</label>
          <input id="m-price" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
          {price !== job.price && <label className="m-check"><input type="checkbox" checked={keepPrice} onChange={(e) => setKeepPrice(e.target.checked)} /> Keep new price for future visits</label>}
        </>
      ) : <p>Price {formatPence(gross)}</p>}
      <label htmlFor="m-notes">Notes</label>
      <textarea id="m-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {status === "done" && <p>Balance after: {balanceText(after)}</p>}
      {error && <p className="m-error" role="alert">{error}</p>}
      <button className="m-btn m-primary m-wide" onClick={() => void save()}>Save</button>
      {api.can("move_jobs") && (job.status === "to_do" || job.status === "estimate") && (
        <div className="m-move">
          <label htmlFor="m-move">Move to another day</label>
          <div className="m-row">
            <select id="m-move" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Choose a day…</option>
              {moveDays.map((d) => <option key={d} value={d}>{relDay(d, today)}{d === today || d === addDays(today, 1) ? ` (${formatDay(d)})` : ""}</option>)}
            </select>
            <button className="m-btn" disabled={!moveTo} onClick={() => void move()}>Move</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Add due jobs ---------- */

export function AddDueScreen({ api, day, onDone }: { api: AppApi; day: string; onDone: () => void }) {
  const { snapshot: s, today } = api;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const onDay = new Set(s.jobs.filter((j) => j.date === day).map((j) => j.jobSpecId));
  const due = s.due.filter((d) => !onDay.has(d.jobSpecId));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function add() {
    for (const id of picked) await api.queue({ type: "add_job", clientId: api.newId(), jobSpecId: id, date: day }, `Added ${picked.size} job${picked.size === 1 ? "" : "s"}`);
    onDone();
  }

  return (
    <>
      <div className="m-daybar">
        <button className="m-btn" onClick={onDone} aria-label="Back">‹</button>
        <h1>Add to {relDay(day, today).toLowerCase()}<small>{formatDate(day)}</small></h1>
        <span />
      </div>
      {due.length === 0 && <p className="m-empty">Nothing is due.</p>}
      <ul className="m-list">
        {due.map((d) => {
          const late = d.lateness ?? 0;
          const cls = d.status === "estimate" ? "est" : late > 0.25 ? "late" : late > -0.1 ? "" : "early";
          return (
            <li key={d.jobSpecId}>
              <label className={`m-job m-pick ${cls}`}>
                <input type="checkbox" checked={picked.has(d.jobSpecId)} onChange={() => toggle(d.jobSpecId)} />
                <span className="m-job-main">
                  <b>{d.name || d.customerName}</b>
                  <span className="m-muted">{d.customerName}{d.roundName ? ` · ${d.roundName}` : ""}</span>
                  <span className="small">{d.status === "estimate" ? "Estimate" : d.nextDueOn ? `Due ${formatDate(d.nextDueOn)}` : "On request"}</span>
                </span>
                <span className="m-job-side">{formatPence(d.gross)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="m-sticky">
        <button className="m-btn m-primary m-wide" disabled={picked.size === 0} onClick={() => void add()}>
          Add {picked.size || ""} job{picked.size === 1 ? "" : "s"}
        </button>
      </div>
    </>
  );
}

/* ---------- Debts ---------- */

export function DebtsScreen({ api }: { api: AppApi }) {
  const { snapshot: s, today } = api;
  const [sort, setSort] = useState<"amount" | "date">("amount");
  const [open, setOpen] = useState<string | null>(null);
  const debts = s.customers.filter((c) => c.balance < 0).sort((a, b) =>
    sort === "amount" ? a.balance - b.balance : (a.debtSince ?? "9999").localeCompare(b.debtSince ?? "9999"));
  const total = debts.reduce((t, c) => t - c.balance, 0);
  const cust = s.customers.find((c) => c.id === open);
  return (
    <>
      <div className="m-spread"><h1>Debts</h1><span className="m-owed"><b>{formatPence(total)}</b></span></div>
      <div className="m-seg" role="group" aria-label="Sort by">
        <button aria-pressed={sort === "amount"} className={sort === "amount" ? "on" : ""} onClick={() => setSort("amount")}>Largest first</button>
        <button aria-pressed={sort === "date"} className={sort === "date" ? "on" : ""} onClick={() => setSort("date")}>Oldest first</button>
      </div>
      {debts.length === 0 && <p className="m-empty">Nobody owes anything.</p>}
      <ul className="m-list">
        {debts.map((c) => (
          <li key={c.id}>
            <button className="m-job" onClick={() => setOpen(c.id)}>
              <span className="m-job-main"><b>{c.name}</b><span className="m-muted">{c.address}</span>
                {c.debtSince && <span className="small">Since {formatDate(c.debtSince)}</span>}</span>
              <span className="m-job-side m-owed">{formatPence(-c.balance)}</span>
            </button>
          </li>
        ))}
      </ul>
      {cust && <PaymentSheet api={api} customer={cust} today={today} onClose={() => setOpen(null)} />}
    </>
  );
}

function PaymentSheet({ api, customer, today, onClose }: { api: AppApi; customer: SnapshotCustomer; today: string; onClose: () => void }) {
  const [amount, setAmount] = useState(pounds(Math.max(0, -customer.balance)));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canPay = api.can("enter_payments");
  async function save() {
    const p = parseMoney(amount);
    if (!p) return setError("Enter the amount received, like 15.00");
    await api.queue({ type: "payment", clientId: api.newId(), customerId: customer.id, paidPence: p, method, reference: reference.trim() || null, date: today },
      `${formatPence(p)} from ${customer.name}`);
    onClose();
  }
  return (
    <Sheet title={customer.name} onClose={onClose}>
      <p className="m-muted">{customer.address}{customer.phone && <> · <a href={`tel:${customer.phone.replace(/\s/g, "")}`}>{customer.phone}</a></>}</p>
      <p>{balanceText(customer.balance)}</p>
      {canPay ? (
        <>
          <label htmlFor="m-amt">Amount received £</label>
          <input id="m-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} />
          <label htmlFor="m-pmethod">Method</label>
          <MethodSelect id="m-pmethod" value={method} onChange={setMethod} />
          <label htmlFor="m-ref">Reference (optional)</label>
          <input id="m-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          {error && <p className="m-error" role="alert">{error}</p>}
          <button className="m-btn m-primary m-wide" onClick={() => void save()}>Take payment</button>
        </>
      ) : <p className="m-muted">Your role cannot take payments.</p>}
    </Sheet>
  );
}

/* ---------- Expenses and mileage ---------- */

export function ExpenseScreen({ api }: { api: AppApi }) {
  const { snapshot: s, today } = api;
  const cats = s.expenseCategories;
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState(cats[0]?.name ?? "");
  const [newCat, setNewCat] = useState("");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState<"inc_at_rate" | "no_vat" | "zero_rated" | "exempt">("inc_at_rate");
  const [method, setMethod] = useState("card");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const categoryName = (category === "__new" || cats.length === 0 ? newCat : category).trim();

  async function save() {
    const p = parseMoney(amount);
    if (p === null || p <= 0) return setError("Enter the amount, like 12.50");
    if (!categoryName) return setError("Choose or type a category");
    await api.queue({ type: "expense", clientId: api.newId(), date, categoryName, amountPence: p, vatStatus: vat, method, description: description.trim() || null },
      `Expense ${formatPence(p)} saved`);
    setAmount(""); setDescription(""); setNewCat(""); setError(null);
  }
  return (
    <>
      <h1>Add expense</h1>
      <div className="m-card m-form">
        <label htmlFor="e-date">Date</label>
        <input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label htmlFor="e-cat">Category</label>
        {cats.length > 0 && (
          <select id="e-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__new">New category…</option>
          </select>
        )}
        {(cats.length === 0 || category === "__new") && (
          <input id={cats.length ? "e-newcat" : "e-cat"} aria-label="New category" placeholder="e.g. Fuel" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        )}
        <label htmlFor="e-amt">Amount £</label>
        <input id="e-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label htmlFor="e-vat">VAT</label>
        <select id="e-vat" value={vat} onChange={(e) => setVat(e.target.value as typeof vat)}>
          <option value="inc_at_rate">Includes VAT</option>
          <option value="no_vat">No VAT</option>
          <option value="zero_rated">Zero rated</option>
          <option value="exempt">Exempt</option>
        </select>
        <label htmlFor="e-method">Paid by</label>
        <select id="e-method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {QUICK_METHODS.map((k) => <option key={k} value={k}>{PAY_METHODS[k]}</option>)}
        </select>
        <label htmlFor="e-desc">Description</label>
        <input id="e-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <p className="m-error" role="alert">{error}</p>}
        <button className="m-btn m-primary m-wide" onClick={() => void save()}>Save expense</button>
      </div>
    </>
  );
}

export function MileageScreen({ api }: { api: AppApi }) {
  const { snapshot: s, today } = api;
  const [vehicleId, setVehicleId] = useState(s.vehicles[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const a = Number.parseInt(start, 10);
  const b = Number.parseInt(finish, 10);
  const miles = Number.isFinite(a) && Number.isFinite(b) ? b - a : null;

  if (s.vehicles.length === 0) return <><h1>Mileage</h1><p className="m-empty">Add a vehicle on the desktop site first.</p></>;
  async function save() {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0) return setError("Enter the start and finish readings");
    if (b < a) return setError("The finish reading is lower than the start");
    await api.queue({ type: "mileage", clientId: api.newId(), vehicleId, date, start: a, finish: b }, `${b - a} miles saved`);
    setStart(String(b)); setFinish(""); setError(null);
  }
  return (
    <>
      <h1>Mileage</h1>
      <div className="m-card m-form">
        <label htmlFor="v-veh">Vehicle</label>
        <select id="v-veh" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {s.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.registration ? ` (${v.registration})` : ""}</option>)}
        </select>
        <label htmlFor="v-date">Date</label>
        <input id="v-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label htmlFor="v-start">Start reading</label>
        <input id="v-start" inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} />
        <label htmlFor="v-finish">Finish reading</label>
        <input id="v-finish" inputMode="numeric" value={finish} onChange={(e) => setFinish(e.target.value)} />
        {miles !== null && miles >= 0 && <p className="m-muted">{miles} miles</p>}
        {error && <p className="m-error" role="alert">{error}</p>}
        <button className="m-btn m-primary m-wide" onClick={() => void save()}>Save mileage</button>
      </div>
    </>
  );
}

/* ---------- Sync status ---------- */

export function SyncScreen({ api, pending, meta, online, syncing, onSync, onReset, onDismiss }: {
  api: AppApi; pending: OutboxItem[]; meta: SyncMeta; online: boolean; syncing: boolean;
  onSync: () => void; onReset: () => Promise<void>; onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const last = meta.lastSyncedAt ? new Date(meta.lastSyncedAt) : null;
  return (
    <>
      <h1>Sync</h1>
      <div className="m-card">
        <dl className="m-dl">
          <dt>Connection</dt><dd>{online ? "Online" : "Offline"}</dd>
          <dt>Waiting to sync</dt><dd data-testid="pending-count">{pending.length}</dd>
          <dt>Last synced</dt><dd>{last ? `${formatDate(last.toISOString().slice(0, 10))} ${last.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Never"}</dd>
          <dt>Signed in as</dt><dd>{api.snapshot.settings.userName}</dd>
        </dl>
        {meta.lastError && <p className="m-muted">{meta.lastError}</p>}
        <button className="m-btn m-primary m-wide" disabled={syncing} onClick={onSync}>{syncing ? "Syncing…" : "Sync now"}</button>
      </div>
      {pending.length > 0 && (
        <div className="m-card">
          <h2>Waiting to sync</h2>
          <ul className="m-plain">{pending.map((p) => <li key={p.change.clientId}>{describeChange(p.change, api.snapshot)}</li>)}</ul>
        </div>
      )}
      {meta.failures.length > 0 && (
        <div className="m-card">
          <div className="m-spread"><h2>Not accepted</h2><button className="m-btn m-small" onClick={onDismiss}>Clear</button></div>
          <p className="m-muted small">The office copy was kept for these changes.</p>
          <ul className="m-plain">{meta.failures.map((f) => <li key={f.clientId}><b>{f.summary}</b><br /><span className="m-error">{f.error}</span></li>)}</ul>
        </div>
      )}
      <div className="m-card">
        <h2>Reset this device</h2>
        {!confirming ? (
          <button className="m-btn m-danger m-wide" onClick={() => setConfirming(true)}>Reset…</button>
        ) : (
          <div role="alert">
            <p>This removes everything stored on this phone and downloads it again.
              {pending.length > 0 && <b> {pending.length} change{pending.length === 1 ? "" : "s"} not yet synced will be lost.</b>}</p>
            <div className="m-row">
              <button className="m-btn m-danger" onClick={() => { setConfirming(false); void onReset(); }}>Yes, reset</button>
              <button className="m-btn" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <p className="m-center"><a href="/planner">Open the full site</a></p>
    </>
  );
}
