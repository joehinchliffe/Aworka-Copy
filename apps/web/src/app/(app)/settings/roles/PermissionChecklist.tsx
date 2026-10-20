"use client";
import { useState } from "react";

type Group = { title: string; items: { key: string; label: string }[] };

/** The role editor's grouped permission checkboxes with preset buttons. */
export function PermissionChecklist({ groups, initial, presets }: {
  groups: Group[];
  initial: string[];
  presets: { label: string; permissions: string[] }[];
}) {
  const [checked, setChecked] = useState(() => new Set(initial));
  const toggle = (k: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  return (
    <>
      <div className="row" style={{ margin: "8px 0" }}>
        <span className="small muted">Presets:</span>
        {presets.map((p) => (
          <button key={p.label} type="button" className="btn small" onClick={() => setChecked(new Set(p.permissions))}>{p.label}</button>
        ))}
        <button type="button" className="btn small" onClick={() => setChecked(new Set())}>Clear all</button>
      </div>
      <div className="perm-groups">
        {groups.map((g) => (
          <fieldset key={g.title}>
            <legend>{g.title}</legend>
            {g.items.map((p) => (
              <label key={p.key} className="row check">
                <input type="checkbox" name="permissions" value={p.key} checked={checked.has(p.key)} onChange={() => toggle(p.key)} /> {p.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {checked.has("administrator") && <p className="small muted">Administrators can do everything, whatever else is ticked.</p>}
    </>
  );
}
