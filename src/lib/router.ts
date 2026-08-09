// src/lib/router.ts
import { loadNetwork, Mode, Segment } from "./network";

type StateKey = string; // `${stopId}|${lastMode}`

function key(stopId: string, lastMode: Mode | null): StateKey {
  return `${stopId}|${lastMode ?? "NONE"}`;
}

function parseKey(k: StateKey): { stopId: string; lastMode: Mode | null } {
  const [stopId, last] = k.split("|");
  return { stopId, lastMode: last === "NONE" ? null : (last as Mode) };
}

export type RouteLeg =
  | { kind: "walk"; fromLabel: string; toLabel: string; minutes: number }
  | {
      kind: "ride";
      mode: Exclude<Mode, "walk">;
      fromStopId: string;
      toStopId: string;
      fromStop: string;
      toStop: string;
      minutes: number;
      fareMin: number;
      fareMax: number;
      notes?: string;
    };

export type ComputedRoute = {
  transfers: number; // vehicle changes (ride legs - 1)
  totalMinutes: number;
  totalFareMin: number;
  totalFareMax: number;
  legs: RouteLeg[];
};

export function computeRoute(params: {
  fromPlaceId: string;
  toPlaceId: string;
  avoidModes?: Exclude<Mode, "walk">[];
}): ComputedRoute | null {
  const network = loadNetwork();
  const avoid = new Set(params.avoidModes ?? []);

  const fromLinks = network.placeStopLinks.filter((l) => l.placeId === params.fromPlaceId);
  const toLinks = network.placeStopLinks.filter((l) => l.placeId === params.toPlaceId);
  if (!fromLinks.length || !toLinks.length) return null;

  const startStops = fromLinks.map((l) => l.stopId);
  const endStops = new Set(toLinks.map((l) => l.stopId));

  // Build adjacency list (directed)
  const outgoing = new Map<string, Segment[]>();
  for (const seg of network.segments) {
    if (avoid.has(seg.mode)) continue;
    const arr = outgoing.get(seg.fromStopId) ?? [];
    arr.push(seg);
    outgoing.set(seg.fromStopId, arr);
  }

  // Fewest transfers default: heavily penalize *mode changes* during search,
  // but final "transfers" shown to user is vehicle changes (ride legs - 1).
  const TRANSFER_PENALTY = 10000;
  const TIME_WEIGHT = 1;
  const COST_WEIGHT = 0.05;

  const dist = new Map<StateKey, number>();
  const prev = new Map<StateKey, { prevKey: StateKey; seg: Segment }>();

  // Naive PQ is fine for MVP-sized graphs
  const pq: { k: StateKey; d: number }[] = [];
  for (const s of startStops) {
    const k0 = key(s, null);
    dist.set(k0, 0);
    pq.push({ k: k0, d: 0 });
  }

  function popMin() {
    let bestIdx = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bestIdx].d) bestIdx = i;
    return pq.splice(bestIdx, 1)[0];
  }

  let bestEndKey: StateKey | null = null;

  while (pq.length) {
    const cur = popMin();
    if (cur.d !== dist.get(cur.k)) continue;

    const { stopId, lastMode } = parseKey(cur.k);

    // Early exit: first time we reach any end stop is optimal in Dijkstra
    if (endStops.has(stopId)) {
      bestEndKey = cur.k;
      break;
    }

    const edges = outgoing.get(stopId) ?? [];
    for (const seg of edges) {
      const transfer = lastMode && lastMode !== seg.mode ? 1 : 0;
      const fareMid = (seg.fareMin + seg.fareMax) / 2;

      const w =
        TRANSFER_PENALTY * transfer +
        TIME_WEIGHT * seg.typicalMinutes +
        COST_WEIGHT * fareMid;

      const nk = key(seg.toStopId, seg.mode);
      const nd = cur.d + w;

      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, { prevKey: cur.k, seg });
        pq.push({ k: nk, d: nd });
      }
    }
  }

  if (!bestEndKey) return null;

  // Reconstruct segments
  const segs: Segment[] = [];
  let cursor = bestEndKey;
  while (prev.has(cursor)) {
    const p = prev.get(cursor)!;
    segs.push(p.seg);
    cursor = p.prevKey;
  }
  segs.reverse();

  // Determine which start stop was used
  const startUsed = parseKey(cursor).stopId;
  const endUsed = parseKey(bestEndKey).stopId;

  const fromPlace = network.places.find((p) => p.id === params.fromPlaceId);
  const toPlace = network.places.find((p) => p.id === params.toPlaceId);
  const startStop = network.stops.find((s) => s.id === startUsed);
  const endStop = network.stops.find((s) => s.id === endUsed);

  if (!fromPlace || !toPlace || !startStop || !endStop) return null;

  const walkIn = network.placeStopLinks.find((l) => l.placeId === fromPlace.id && l.stopId === startUsed);
  const walkOut = network.placeStopLinks.find((l) => l.placeId === toPlace.id && l.stopId === endUsed);

  const legs: RouteLeg[] = [];

  if (walkIn?.walkMinutes && walkIn.walkMinutes > 0) {
    legs.push({
      kind: "walk",
      fromLabel: fromPlace.name,
      toLabel: startStop.name,
      minutes: walkIn.walkMinutes
    });
  }

  for (const s of segs) {
    legs.push({
      kind: "ride",
      mode: s.mode,
      fromStopId: s.fromStopId,
      toStopId: s.toStopId,
      fromStop: network.stops.find((x) => x.id === s.fromStopId)?.name ?? s.fromStopId,
      toStop: network.stops.find((x) => x.id === s.toStopId)?.name ?? s.toStopId,
      minutes: s.typicalMinutes,
      fareMin: s.fareMin,
      fareMax: s.fareMax,
      notes: s.notes
    });
  }

  if (walkOut?.walkMinutes && walkOut.walkMinutes > 0) {
    legs.push({
      kind: "walk",
      fromLabel: endStop.name,
      toLabel: toPlace.name,
      minutes: walkOut.walkMinutes
    });
  }

  // Summary
  let rideCount = 0;
  let totalMinutes = 0;
  let totalFareMin = 0;
  let totalFareMax = 0;

  for (const leg of legs) {
    if (leg.kind === "walk") {
      totalMinutes += leg.minutes;
      continue;
    }
    rideCount += 1;
    totalMinutes += leg.minutes;
    totalFareMin += leg.fareMin;
    totalFareMax += leg.fareMax;
  }

  const transfers = Math.max(0, rideCount - 1);

  return { transfers, totalMinutes, totalFareMin, totalFareMax, legs };
}
