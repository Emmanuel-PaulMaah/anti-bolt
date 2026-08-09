"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LMap, Layer } from "leaflet";

type Stop = { id: string; name: string; lat: number; lng: number };
type RouteLeg = {
  kind: "walk" | "ride";
  fromStopId?: string;
  toStopId?: string;
  fromStop?: string;
  toStop?: string;
  minutes: number;
  mode?: string;
};

type Props = {
  stops: Stop[];
  legs: RouteLeg[];
  tripIndex: number;
  atStop: boolean;
  phase: string;
};

export default function MapView({ stops, legs, tripIndex, atStop, phase }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<LMap | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || instRef.current) return;
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead) return;
      LRef.current = L;

      const map = L.map(mapRef.current!, { zoomControl: false }).setView([4.785, 7.0], 13);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19
      }).addTo(map);

      instRef.current = map;
      setReady(true);
    })();
    return () => {
      dead = true;
      instRef.current?.remove();
      instRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = instRef.current;
    const L = LRef.current;
    if (!map || !L || !ready) return;

    map.eachLayer((layer: Layer) => {
      if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
    });

    for (const stop of stops) {
      L.circleMarker([stop.lat, stop.lng], {
        radius: 4,
        fillColor: "#cbd5e1",
        color: "#fff",
        weight: 1.5,
        fillOpacity: 0.9
      })
        .addTo(map)
        .bindTooltip(stop.name, { permanent: false, direction: "top", offset: [0, -6], className: "stop-tooltip" });
    }

    if (legs.length === 0) {
      if (stops.length) map.fitBounds(L.latLngBounds(stops.map((s: Stop) => [s.lat, s.lng])).pad(0.15));
      return;
    }

    const coords: [number, number][] = [];
    const routeIds = new Set<string>();

    for (const leg of legs) {
      if (leg.kind !== "ride" || !leg.fromStopId || !leg.toStopId) continue;
      const f = stops.find((s) => s.id === leg.fromStopId);
      const t = stops.find((s) => s.id === leg.toStopId);
      if (!f || !t) continue;
      routeIds.add(leg.fromStopId);
      routeIds.add(leg.toStopId);
      if (!coords.length) coords.push([f.lat, f.lng]);
      coords.push([t.lat, t.lng]);
    }

    if (coords.length >= 2) {
      L.polyline(coords, { color: "#e2e8f0", weight: 7, opacity: 0.9 }).addTo(map);
    }

    if (phase === "transit" || phase === "arrived") {
      const end = phase === "arrived" ? coords.length : tripIndex + 1;
      const active = coords.slice(0, end);
      if (active.length >= 2) {
        L.polyline(active, { color: "#0b9d58", weight: 5, opacity: 1 }).addTo(map);
      }
    } else if (coords.length >= 2) {
      L.polyline(coords, { color: "#0b9d58", weight: 5, opacity: 0.85 }).addTo(map);
    }

    if (phase === "transit" && tripIndex > 0) {
      const vis = coords.slice(0, tripIndex + 1);
      if (vis.length >= 2) {
        L.polyline(vis, { color: "#94a3b8", weight: 4, opacity: 0.7, dashArray: "10 8" }).addTo(map);
      }
    }

    for (const sid of routeIds) {
      const stop = stops.find((s) => s.id === sid);
      if (!stop) continue;

      const isOrigin = legs[0]?.kind === "ride" && legs[0].fromStopId === sid;
      const isDest = legs[legs.length - 1]?.kind === "ride" && legs[legs.length - 1].toStopId === sid;
      const isNext =
        phase === "transit" && legs[tripIndex]?.kind === "ride" && legs[tripIndex].toStopId === sid;
      const isVisited =
        phase === "transit" &&
        legs.slice(0, tripIndex).some((l) => l.kind === "ride" && (l.fromStopId === sid || l.toStopId === sid));

      if (isNext) {
        const icon = L.divIcon({ className: "", html: '<div class="next-dot"></div>', iconSize: [32, 32], iconAnchor: [16, 16] });
        L.marker([stop.lat, stop.lng], { icon })
          .addTo(map)
          .bindTooltip(stop.name, { permanent: true, direction: "top", offset: [0, -20], className: "stop-label" });
      } else if (isOrigin) {
        const icon = L.divIcon({ className: "", html: '<div class="origin-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([stop.lat, stop.lng], { icon })
          .addTo(map)
          .bindTooltip("START", { permanent: true, direction: "top", offset: [0, -16], className: "stop-label" });
      } else if (isDest) {
        const icon = L.divIcon({ className: "", html: '<div class="dest-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([stop.lat, stop.lng], { icon })
          .addTo(map)
          .bindTooltip("FINISH", { permanent: true, direction: "top", offset: [0, -16], className: "stop-label" });
      } else {
        L.circleMarker([stop.lat, stop.lng], {
          radius: isVisited ? 6 : 8,
          fillColor: isVisited ? "#94a3b8" : "#0b9d58",
          color: "#fff",
          weight: isVisited ? 2 : 3,
          fillOpacity: 1
        })
          .addTo(map)
          .bindTooltip(stop.name, { permanent: false, direction: "top", offset: [0, -10], className: "stop-tooltip" });
      }
    }

    if (phase === "transit" && legs[tripIndex]) {
      const leg = legs[tripIndex];
      if (leg.kind === "ride" && leg.fromStopId && leg.toStopId) {
        const f = stops.find((s) => s.id === leg.fromStopId);
        const t = stops.find((s) => s.id === leg.toStopId);
        if (f && t) {
          const pos: [number, number] = atStop ? [t.lat, t.lng] : [(f.lat + t.lat) / 2, (f.lng + t.lng) / 2];
          L.circleMarker(pos, { radius: 20, fillColor: "#0b9d58", color: "#0b9d58", weight: 2, fillOpacity: 0.15 }).addTo(map);
          const icon = L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [28, 28], iconAnchor: [14, 14] });
          L.marker(pos, { icon }).addTo(map);
          if (!atStop) map.panTo(pos, { animate: true, duration: 0.5 });
        }
      }
    }

    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords).pad(0.2));
    }
  }, [stops, legs, tripIndex, atStop, phase, ready]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
