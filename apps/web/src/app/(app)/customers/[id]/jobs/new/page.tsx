import { NewJobForm } from "@/components/CustomerForm";
import { requireUser } from "@/lib/session";
import { roundsFor, tasksFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { addJobAction } from "../../../actions";

export default async function NewJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("create_jobs");
  const [rounds, tasks] = await Promise.all([roundsFor(user.accountId), tasksFor(user.accountId)]);
  return (
    <>
      <h1>Add a job</h1>
      <NewJobForm action={addJobAction.bind(null, id)} rounds={rounds} tasks={tasks} today={todayIso()} />
    </>
  );
}
