"use client";
import { useState } from "react";

type Item = { id: string; name: string; customerName: string; detail: string };

/** Sortable list of a round's jobs: drag rows, or use the up/down buttons. Submits `order` inputs. */
export function RoundOrderList({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => setItems((prev) => {
    if (to < 0 || to >= prev.length || from === to) return prev;
    const next = [...prev];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    return next;
  });
  const q = filter.trim().toLowerCase();
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 8 }}>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter..." style={{ maxWidth: 280 }} />
        <button type="button" className="btn small" onClick={() => setItems(initial)}>Undo changes</button>
      </div>
      <ol className="order-list">
        {items.map((it, i) => {
          const hidden = q && !`${it.name} ${it.customerName}`.toLowerCase().includes(q);
          return (
            <li key={it.id} draggable hidden={!!hidden}
              className={dragging === i ? "dragging" : undefined}
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) { move(dragging, i); setDragging(i); } }}
              onDragEnd={() => setDragging(null)}>
              <input type="hidden" name="order" value={it.id} />
              <span className="order-num">{i + 1}</span>
              <span className="order-name"><strong>{it.name}</strong> <span className="small muted">{it.customerName}{it.detail ? ` · ${it.detail}` : ""}</span></span>
              <span className="row">
                <button type="button" className="btn small" aria-label="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}>↑</button>
                <button type="button" className="btn small" aria-label="Move down" onClick={() => move(i, i + 1)} disabled={i === items.length - 1}>↓</button>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
