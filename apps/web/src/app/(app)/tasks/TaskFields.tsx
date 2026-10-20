/** Fields shared by the new and edit task forms. Price and time are stored in pence and minutes. */
export function TaskFields({ d = {} }: { d?: { name?: string; description?: string | null; timeRequired?: number | null; price?: number | null } }) {
  return (
    <>
      <label>Name</label><input name="name" defaultValue={d.name ?? ""} required />
      <label>Invoice description</label><input name="description" defaultValue={d.description ?? ""} placeholder="Shown on invoices" />
      <div className="field-row">
        <div><label>Hours</label><input name="hours" type="number" min="0" max="24" defaultValue={d.timeRequired != null ? Math.floor(d.timeRequired / 60) : ""} /></div>
        <div><label>Minutes</label><input name="minutes" type="number" min="0" max="59" defaultValue={d.timeRequired != null ? d.timeRequired % 60 : ""} /></div>
        <div><label>Price (£)</label><input name="price" type="number" step="0.01" min="0" defaultValue={d.price != null ? (d.price / 100).toFixed(2) : ""} /></div>
      </div>
    </>
  );
}
