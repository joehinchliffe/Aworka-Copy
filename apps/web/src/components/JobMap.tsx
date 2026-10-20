"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface MapPoint { id: string; lat: number; lng: number; label: string; href: string; round: string | null; approx: boolean }

const PALETTE = ["#0f766e", "#1d4ed8", "#b54708", "#7a2e9e", "#b42318", "#067647", "#475467", "#c11574"];

export function JobMap({ points, tileUrl }: { points: MapPoint[]; tileUrl: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    (async () => {
      const L = await import("leaflet");
      if (!el.current) return;
      map = L.map(el.current);
      L.tileLayer(tileUrl, { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const rounds = [...new Set(points.map((p) => p.round ?? ""))];
      const bounds: [number, number][] = [];
      for (const p of points) {
        const color = PALETTE[rounds.indexOf(p.round ?? "") % PALETTE.length];
        L.circleMarker([p.lat, p.lng], { radius: 7, color, weight: 2, fillOpacity: p.approx ? 0.25 : 0.7, dashArray: p.approx ? "3" : undefined })
          .bindPopup(`<a href="${p.href}">${p.label.replace(/</g, "&lt;")}</a><br>${(p.round ?? "No round").replace(/</g, "&lt;")}${p.approx ? "<br><i>approximate (postcode)</i>" : ""}`)
          .addTo(map);
        bounds.push([p.lat, p.lng]);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else map.setView([54.0, -2.5], 6);
    })();
    return () => { map?.remove(); };
  }, [points, tileUrl]);
  return <div ref={el} style={{ height: "70vh", borderRadius: 8, border: "1px solid var(--line)" }} />;
}
