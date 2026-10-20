export interface Point { lat: number; lng: number }

/** Great-circle distance in metres. */
export function haversine(a: Point, b: Point): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeLength(stops: Point[], start?: Point, end?: Point): number {
  const path = [...(start ? [start] : []), ...stops, ...(end ? [end] : [])];
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversine(path[i - 1]!, path[i]!);
  return d;
}

/**
 * Order stops to minimise travel: nearest-neighbour construction then 2-opt
 * improvement. `start`/`end` are fixed endpoints (e.g. home); omit for open routes.
 * Returns indices into `stops`.
 */
export function optimiseRoute(stops: Point[], start?: Point, end?: Point): number[] {
  const n = stops.length;
  if (n <= 1) return stops.map((_, i) => i);
  const remaining = new Set(stops.map((_, i) => i));
  const order: number[] = [];
  let current: Point = start ?? stops[0]!;
  if (!start) { order.push(0); remaining.delete(0); }
  while (remaining.size) {
    let best = -1, bestD = Infinity;
    for (const i of remaining) { const d = haversine(current, stops[i]!); if (d < bestD) { bestD = d; best = i; } }
    order.push(best); remaining.delete(best); current = stops[best]!;
  }
  const len = (o: number[]) => routeLength(o.map((i) => stops[i]!), start, end);
  let improved = true, bestLen = len(order);
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (let i = start ? 0 : 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        const l = len(candidate);
        if (l + 1e-6 < bestLen) { order.splice(0, n, ...candidate); bestLen = l; improved = true; }
      }
    }
  }
  return order;
}
