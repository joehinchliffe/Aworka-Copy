import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { getUserRow, listRoles, listUsers } from "@/lib/services/users";
import { removeUserAction, updateUserAction } from "../../actions";
import { UserFields } from "../UserFields";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("administrator");
  const u = await getUserRow(user.accountId, id);
  if (!u) notFound();
  const [roles, users] = await Promise.all([listRoles(user.accountId), listUsers(user.accountId)]);
  return (
    <>
      <h1>Edit {u.name}</h1>
      <div className="panel narrow">
        <ActionForm action={updateUserAction.bind(null, id)}>
          <UserFields roles={roles.map((r) => r.role)} managers={users.map((x) => x.user).filter((x) => x.id !== id)} d={u} isOwner={u.isOwner} />
        </ActionForm>
        <p><Link href="/settings/users">Back to users</Link></p>
      </div>
      {!u.isOwner && u.id !== user.id && (
        <div className="panel narrow" style={{ marginTop: 12 }}>
          <h2>Remove user</h2>
          <p className="small muted">They will no longer be able to log in. Their rounds become unassigned.</p>
          <ActionForm action={removeUserAction.bind(null, id)} submitLabel="Remove user" danger confirm={`Remove ${u.name}?`} />
        </div>
      )}
    </>
  );
}
