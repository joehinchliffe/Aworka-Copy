import { NewCustomerForm } from "@/components/CustomerForm";
import { requireUser } from "@/lib/session";
import { roundsFor, tasksFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { createCustomerAction } from "../actions";

export default async function NewCustomerPage() {
  const user = await requireUser("create_jobs");
  const [rounds, tasks] = await Promise.all([roundsFor(user.accountId), tasksFor(user.accountId)]);
  return (
    <>
      <h1>New customer</h1>
      <NewCustomerForm action={createCustomerAction} rounds={rounds} tasks={tasks} today={todayIso()} />
    </>
  );
}
