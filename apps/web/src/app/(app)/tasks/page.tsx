import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { money } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { listTasks } from "@/lib/services/tasks";
import { createTaskAction } from "./actions";
import { TaskFields } from "./TaskFields";

export default async function TasksPage() {
  const user = await requireUser();
  const rows = await listTasks(user.accountId);
  return (
    <>
      <h1>Tasks</h1>
      <p className="small muted">A task is a standard job with a set price, such as gutter clearing. Changing a task&apos;s price changes the price of every job using it.</p>
      <div className="grid cols-2">
        <div>
          {rows.length === 0 ? <div className="panel"><h2>No tasks yet</h2></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Task</th><th>Invoice description</th><th className="num">Time</th><th className="num">Price</th><th className="num">Jobs</th></tr></thead>
                <tbody>
                  {rows.map(({ task, jobs }) => (
                    <tr key={task.id}>
                      <td><Link href={`/tasks/${task.id}`}>{task.name}</Link></td>
                      <td>{task.description}</td>
                      <td className="num">{task.timeRequired != null ? `${task.timeRequired} min` : ""}</td>
                      <td className="num">{money(task.price)}</td>
                      <td className="num">{jobs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>New task</h2>
          <ActionForm action={createTaskAction} submitLabel="Add task"><TaskFields /></ActionForm>
        </div>
      </div>
    </>
  );
}
