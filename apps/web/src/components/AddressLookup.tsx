"use client";
import { useEffect, useRef, useState } from "react";

interface Suggestion { id: string; label: string }
interface Resolved { address: string; postcode: string; lat?: number; lng?: number; partial?: boolean }

/**
 * Type-ahead UK address finder. Fills the sibling `${prefix}address`,
 * `${prefix}postcode`, `${prefix}lat` and `${prefix}lng` fields of the
 * enclosing form. Hides itself when lookup is not available, leaving the
 * manual fields as they are.
 */
export function AddressLookup({ prefix }: { prefix: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (name: string) =>
    box.current?.closest("form")?.elements.namedItem(`${prefix}${name}`) as HTMLInputElement | HTMLTextAreaElement | null | undefined;

  // Typing in the address or postcode by hand means stored coordinates no longer match.
  useEffect(() => {
    const clear = () => { const lat = field("lat"), lng = field("lng"); if (lat) lat.value = ""; if (lng) lng.value = ""; };
    const els = [field("address"), field("postcode")].filter(Boolean) as HTMLElement[];
    els.forEach((el) => el.addEventListener("input", clear));
    return () => els.forEach((el) => el.removeEventListener("input", clear));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const body = (await res.json()) as { enabled?: boolean; results?: Suggestion[]; error?: string };
        if (body.enabled === false) { setEnabled(false); return; }
        if (!res.ok) { setMessage(body.error ?? "Address lookup failed"); setResults([]); return; }
        setMessage(body.results?.length ? null : "No matches. Keep typing, or enter the address below.");
        setResults(body.results ?? []);
        setActive(-1);
      } catch {
        /* aborted or offline: manual entry still works */
      }
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query]);

  async function pick(s: Suggestion) {
    setBusy(true);
    try {
      const res = await fetch(`/api/address/resolve?id=${encodeURIComponent(s.id)}`);
      const r = (await res.json()) as Resolved & { error?: string };
      if (!res.ok) { setMessage(r.error ?? "Could not fetch that address"); return; }
      const address = field("address"), postcode = field("postcode"), lat = field("lat"), lng = field("lng");
      if (address) address.value = r.partial ? `\n${r.address}` : r.address;
      if (postcode) postcode.value = r.postcode;
      if (lat) lat.value = r.lat != null ? String(r.lat) : "";
      if (lng) lng.value = r.lng != null ? String(r.lng) : "";
      setResults([]);
      setQuery("");
      setMessage(r.partial ? "Area filled in from the postcode. Add the house number and street on the first line." : null);
      if (r.partial && address) { address.focus(); address.setSelectionRange?.(0, 0); }
    } catch {
      setMessage("Could not fetch that address");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault(); // never submit the customer form from the finder
      const s = results[active] ?? (results.length === 1 ? results[0] : undefined);
      if (s) void pick(s);
    } else if (e.key === "Escape") setResults([]);
  }

  if (!enabled) return <div ref={box} hidden />;
  return (
    <div ref={box} className="address-lookup" style={{ position: "relative" }}>
      <label htmlFor={`${prefix}addressLookup`}>Find address</label>
      <input
        id={`${prefix}addressLookup`} type="search" autoComplete="off" value={query} placeholder="Start typing an address or postcode"
        onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} disabled={busy}
        role="combobox" aria-expanded={results.length > 0} aria-controls={`${prefix}addressResults`} aria-autocomplete="list"
      />
      {results.length > 0 && (
        <ul id={`${prefix}addressResults`} role="listbox" className="panel"
          style={{ position: "absolute", zIndex: 20, left: 0, right: 0, margin: 0, padding: 4, listStyle: "none", maxHeight: 260, overflowY: "auto" }}>
          {results.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); void pick(s); }}
              style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 4, background: i === active ? "var(--info-soft)" : undefined }}>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {message && <div className="small muted">{message}</div>}
    </div>
  );
}
