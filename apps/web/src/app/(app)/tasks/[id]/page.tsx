import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { getTask } from "@/lib/services/tasks";
import { deleteTaskAction, updateTaskAction } from "../actions";
import { TaskFields } from "../TaskFields";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const task = await getTask(user.accountId, id);
  if (!task) notFound();
  return (
    <>
      <h1>Edit task</h1>
      <div className="panel narrow">
        <p className="small muted">Saving a new price or time updates every job using this task.</p>
        <ActionForm action={updateTaskAction.bind(null, id)}><TaskFields d={task} /></ActionForm>
        <p><Link href="/tasks">Back to tasks</Link></p>
      </div>
      <div className="panel narrow" style={{ marginTop: 12 }}>
        <h2>Delete task</h2>
        <p className="small muted">Jobs using it keep their current price.</p>
        <ActionForm action={deleteTaskAction.bind(null, id)} submitLabel="Delete task" danger confirm={`Delete ${task.name}?`} />
      </div>
    </>
  );
}
