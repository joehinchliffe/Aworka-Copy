import { exportCustomersCsv } from "@/lib/services/importExport";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";

export async function GET() {
  const user = await requireUser("export_jobs");
  const csv = await exportCustomersCsv(user.accountId);
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="customers-${todayIso()}.csv"` },
  });
}
