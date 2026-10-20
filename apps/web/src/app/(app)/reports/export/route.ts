import { can } from "@rounds/domain";
import { ACTIVITY_CATEGORIES, activity, pnlCsvRows, profitAndLoss } from "@/lib/services/reports";
import { accountFor } from "@/lib/lookups";
import { getUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { activityParams, pnlParams } from "../params";

/** Quote a CSV cell; neutralise leading formula characters so spreadsheets do not execute them. */
function cell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

function csvResponse(name: string, rows: (string | number | null | undefined)[][]) {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Not logged in", { status: 401 });
  if (!can(user.permissions, "export_reports")) return new Response("You do not have permission to export reports", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const today = todayIso();

  if (sp.type === "pnl") {
    const account = await accountFor(user.accountId);
    if (!account) return new Response("Account not found", { status: 404 });
    const { start, end, basis, groupBy } = pnlParams(account, sp, today);
    const p = await profitAndLoss(user.accountId, start, end, basis, groupBy);
    return csvResponse(`profit-and-loss-${basis}-${start}-to-${end}.csv`, pnlCsvRows(p));
  }

  if (sp.type === "activity") {
    const f = activityParams(sp, today);
    const { period, rows } = await activity(user.accountId, { ...f, limit: 50_000 }, today);
    return csvResponse(`activity-${period.start}-to-${period.end}.csv`, [
      ["Date", "Type", "Detail", "Customer", "Description", "By", "Amount"],
      ...rows.map((r) => [
        r.date, ACTIVITY_CATEGORIES[r.category] ?? r.category, r.subcategory, r.customerName, r.summary, r.userName,
        r.amount == null ? "" : (r.amount / 100).toFixed(2),
      ]),
    ]);
  }

  return new Response("Unknown export type", { status: 400 });
}
