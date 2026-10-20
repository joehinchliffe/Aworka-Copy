/**
 * Optimistic application of queued changes to the device snapshot, using the
 * same domain rules as the server so balances and statuses look right offline.
 * The server's next snapshot always replaces the result.
 */
import { balanceAfterJob, grossFromNet, nextDebtSince, splitTip, type IsoDate } from "@rounds/domain";
import type { Change, Snapshot, SnapshotCustomer, SnapshotJob } from "@/lib/services/sync";

export const localJobId = (clientId: string) => `local:${clientId}`;

export function grossOf(price: number, vatStatus: string, vatRate: number) {
  return vatStatus === "ex_vat" ? grossFromNet(price, vatRate) : price;
}

function withCustomer(s: Snapshot, id: string, f: (c: SnapshotCustomer) => SnapshotCustomer): Snapshot {
  return { ...s, customers: s.customers.map((c) => (c.id === id ? f(c) : c)) };
}

function withJob(s: Snapshot, id: string, f: (j: SnapshotJob) => SnapshotJob): Snapshot {
  return { ...s, jobs: s.jobs.map((j) => (j.id === id ? f(j) : j)) };
}

function newBalance(c: SnapshotCustomer, balance: number, today: IsoDate): SnapshotCustomer {
  return { ...c, balance, debtSince: nextDebtSince(c.balance, balance, c.debtSince, today) };
}

export function applyChange(s: Snapshot, change: Change, today: IsoDate): Snapshot {
  switch (change.type) {
    case "complete_job": {
      const job = s.jobs.find((j) => j.id === change.jobId);
      if (!job) return s;
      const input = change.input;
      const price = input.price ?? job.price;
      const gross = grossOf(price, job.vatStatus, job.vatRate);
      const total = input.status === "to_do" ? 0 : input.paid ?? 0;
      const { paid, tip } = input.includesTip ? splitTip(total, gross) : { paid: total, tip: input.tip ?? 0 };
      const before = (s.customers.find((c) => c.id === job.customerId)?.balance ?? 0) + (job.status === "done" ? job.gross : 0);
      const after = balanceAfterJob(before, input.status === "done" ? gross : 0, paid, tip);
      const next = withJob(s, job.id, (j) => ({
        ...j, status: input.status, price, gross, paid: paid > 0,
        date: input.status === "done" && j.date > today ? today : j.date,
        notes: input.notes === undefined ? j.notes : input.notes,
        confirmed: input.confirmed === undefined ? j.confirmed : input.confirmed,
      }));
      return withCustomer(next, job.customerId, (c) => newBalance(c, after, today));
    }
    case "add_job": {
      const due = s.due.find((d) => d.jobSpecId === change.jobSpecId);
      if (!due || s.jobs.some((j) => j.jobSpecId === change.jobSpecId && j.date === change.date)) return s;
      const job: SnapshotJob = {
        id: localJobId(change.clientId), jobSpecId: due.jobSpecId, customerId: due.customerId, date: change.date,
        status: due.status === "estimate" ? "estimate" : "to_do", apptType: "manual", confirmed: null,
        name: due.name, customerName: due.customerName, roundName: due.roundName, price: due.price, gross: due.gross,
        vatStatus: due.vatStatus, vatRate: due.vatRate, timeRequired: 0, paid: false, notes: null, allowed: true, dayOrder: null,
      };
      return { ...s, jobs: [...s.jobs, job], due: s.due.filter((d) => d.jobSpecId !== change.jobSpecId) };
    }
    case "move_job":
      return withJob(s, change.jobId, (j) => ({ ...j, date: change.date, dayOrder: null }));
    case "payment":
      return withCustomer(s, change.customerId, (c) => newBalance(c, c.balance + change.paidPence, today));
    case "expense":
    case "mileage":
      return s;
  }
}

export function applyAll(s: Snapshot, changes: Change[], today: IsoDate): Snapshot {
  return changes.reduce((acc, c) => applyChange(acc, c, today), s);
}

/** Jobs for one day in working order. */
export function jobsOn(s: Snapshot, date: IsoDate): SnapshotJob[] {
  const order = new Map(s.jobs.map((j, i) => [j.id, i]));
  return s.jobs.filter((j) => j.date === date).sort((a, b) =>
    (a.dayOrder ?? 1e9) - (b.dayOrder ?? 1e9) || order.get(a.id)! - order.get(b.id)!);
}

export function describeChange(c: Change, s: Snapshot | null): string {
  const job = (id: string) => s?.jobs.find((j) => j.id === id)?.name ?? "job";
  switch (c.type) {
    case "complete_job": return `${job(c.jobId)}: ${c.input.status.replace("_", " ")}`;
    case "add_job": return `Add ${s?.due.find((d) => d.jobSpecId === c.jobSpecId)?.name ?? "job"} on ${c.date}`;
    case "move_job": return `Move ${job(c.jobId)} to ${c.date}`;
    case "payment": return `Payment from ${s?.customers.find((x) => x.id === c.customerId)?.name ?? "customer"}`;
    case "expense": return `Expense: ${c.categoryName}`;
    case "mileage": return `Mileage ${c.finish - c.start} miles`;
  }
}
