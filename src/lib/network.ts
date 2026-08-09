import fs from "node:fs";
import path from "node:path";

export type Mode = "bus" | "keke" | "okada" | "walk";

export type Place = { id: string; name: string; aliases?: string[]; lat?: number; lng?: number };
export type Stop = { id: string; name: string; landmarks: string[]; lat: number; lng: number };
export type PlaceStopLink = { placeId: string; stopId: string; walkMinutes: number };
export type Segment = {
  id: string;
  fromStopId: string;
  toStopId: string;
  mode: Exclude<Mode, "walk">;
  typicalMinutes: number;
  fareMin: number;
  fareMax: number;
  notes?: string;
};

export type Network = {
  places: Place[];
  stops: Stop[];
  placeStopLinks: PlaceStopLink[];
  segments: Segment[];
};

let cached: { network: Network; indexedAt: number } | null = null;

export function loadNetwork(): Network {
  // Simple cache for dev
  if (cached && Date.now() - cached.indexedAt < 2000) return cached.network;

  const file = path.join(process.cwd(), "data", "network.json");
  const raw = fs.readFileSync(file, "utf-8");
  const network = JSON.parse(raw) as Network;

  cached = { network, indexedAt: Date.now() };
  return network;
}

export function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function findPlaceByQuery(network: Network, q: string) {
  const nq = normalize(q);
  return network.places.filter(p => {
    if (normalize(p.name).includes(nq)) return true;
    return (p.aliases ?? []).some(a => normalize(a).includes(nq));
  });
}
