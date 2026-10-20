import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { getRole } from "@/lib/services/users";
import { deleteRoleAction, updateRoleAction } from "../../actions";
import { RoleEditor } from "../RoleEditor";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("administrator");
  const role = await getRole(user.accountId, id);
  if (!role) notFound();
  return (
    <>
      <h1>Edit role</h1>
      <div className="panel">
        <RoleEditor action={updateRoleAction.bind(null, id)} name={role.name} permissions={role.permissions} />
        <p><Link href="/settings/roles">Back to roles</Link></p>
      </div>
      <div className="panel narrow" style={{ marginTop: 12 }}>
        <h2>Delete role</h2>
        <p className="small muted">Only roles with no users can be deleted.</p>
        <ActionForm action={deleteRoleAction.bind(null, id)} submitLabel="Delete role" danger confirm={`Delete the ${role.name} role?`} />
      </div>
    </>
  );
}
