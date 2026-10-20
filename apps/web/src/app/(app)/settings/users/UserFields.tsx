interface Opt { id: string; name: string }

/** Fields shared by the new and edit user forms. */
export function UserFields({ d = {}, roles, managers, isNew, isOwner }: {
  d?: { email?: string; name?: string; phone?: string | null; roleId?: string | null; managerId?: string | null };
  roles: Opt[];
  managers: Opt[];
  isNew?: boolean;
  isOwner?: boolean;
}) {
  return (
    <>
      <div className="field-row">
        <div><label>Name</label><input name="name" defaultValue={d.name ?? ""} required /></div>
        <div><label>Phone</label><input name="phone" type="tel" defaultValue={d.phone ?? ""} /></div>
      </div>
      <label>Email</label><input name="email" type="email" defaultValue={d.email ?? ""} required autoComplete="off" />
      <div className="field-row">
        <div><label>{isNew ? "Password" : "New password (leave blank to keep)"}</label>
          <input name="password" type="password" minLength={8} required={isNew} autoComplete="new-password" /></div>
        {isNew && <div><label>Confirm password</label><input name="passwordConfirmation" type="password" minLength={8} required autoComplete="new-password" /></div>}
      </div>
      <div className="field-row">
        <div><label>Role</label>
          {isOwner ? <input disabled value="Owner (all permissions)" /> : (
            <select name="roleId" defaultValue={d.roleId ?? ""}>
              <option value="">No role</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}</div>
        <div><label>Manager</label>
          <select name="managerId" defaultValue={d.managerId ?? ""}>
            <option value="">Self managed</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
      </div>
    </>
  );
}
