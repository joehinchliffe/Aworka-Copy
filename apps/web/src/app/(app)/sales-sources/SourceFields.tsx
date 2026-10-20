/** Fields shared by the new and edit sales source forms. */
export function SourceFields({ d = {}, types }: { d?: { type?: string; reference?: string | null; notes?: string | null }; types: string[] }) {
  const suggestions = [...new Set([...types, "Leaflet", "Word of mouth", "Website", "Facebook", "Canvassing", "Referral", "Bought round"])];
  return (
    <>
      <label>Source of sale</label>
      <input name="type" list="sales-source-types" defaultValue={d.type ?? ""} required maxLength={60} />
      <datalist id="sales-source-types">{suggestions.map((t) => <option key={t} value={t} />)}</datalist>
      <label>Reference</label><input name="reference" defaultValue={d.reference ?? ""} placeholder="e.g. March leaflet drop" />
      <label>Notes</label><textarea name="notes" defaultValue={d.notes ?? ""} />
    </>
  );
}
