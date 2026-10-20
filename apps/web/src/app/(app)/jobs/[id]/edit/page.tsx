import Link from "next/link";
import { notFound } from "next/navigation";
import { EditJobForm } from "@/components/CustomerForm";
import { getJobSpec } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";
import { roundsFor, tasksFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { setStatusAction, updateJobSpecAction } from "../../actions";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("edit_job_details");
  const [spec, rounds, tasks] = await Promise.all([getJobSpec(user.accountId, id), roundsFor(user.accountId), tasksFor(user.accountId)]);
  if (!spec) notFound();
  return (
    <main>
      <div className="spread">
        <h1>Edit job</h1>
        <div className="row">
          <Link className="btn" href={`/customers/${spec.customerId}`}>Back</Link>
          {spec.status === "suspended"
            ? <form action={setStatusAction.bind(null, id, "active")}><button className="btn">Reactivate</button></form>
            : <form action={setStatusAction.bind(null, id, "suspended")}><button className="btn">Suspend</button></form>}
          <form action={setStatusAction.bind(null, id, "deleted")}><button className="btn danger">Delete job</button></form>
        </div>
      </div>
      {spec.status !== "active" && <div className="notice error">This job is {spec.status}.</div>}
      <EditJobForm action={updateJobSpecAction.bind(null, id, spec.customerId)} rounds={rounds} tasks={tasks} today={todayIso()} d={spec} />
    </main>
  );
}
