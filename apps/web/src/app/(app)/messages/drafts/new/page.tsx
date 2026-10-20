import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { roundsFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { clampDays, JOB_SHEET_STATUSES } from "@/lib/services/jobSheets";
import { listTemplates, TEMPLATE_PURPOSES } from "@/lib/services/templates";
import { DraftBuilder } from "@/components/DraftBuilder";
import { buildDraftsAction } from "../../actions";

export default async function NewDraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("send_messages");
  const sp = await searchParams;
  const [rounds, templates, users] = await Promise.all([
    roundsFor(user.accountId), listTemplates(user.accountId),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.accountId, user.accountId)).orderBy(asc(schema.users.name)),
  ]);
  return (
    <>
      <h1>New mass message</h1>
      <DraftBuilder
        action={buildDraftsAction}
        rounds={rounds}
        users={users}
        templates={templates.map((t) => ({ id: t.id, name: t.name, purpose: t.purpose, hasEmail: !!t.emailBody, hasSms: !!t.smsBody }))}
        statuses={JOB_SHEET_STATUSES}
        purposes={TEMPLATE_PURPOSES}
        d={{
          source: ["round", "debt", "job_sheet"].includes(sp.source ?? "") ? sp.source! : "job_sheet",
          start: /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? sp.start! : todayIso(),
          days: clampDays(sp.days ?? 1),
          status: sp.status && sp.status in JOB_SHEET_STATUSES ? sp.status : "all",
          user: sp.user ?? "all",
        }}
      />
    </>
  );
}
