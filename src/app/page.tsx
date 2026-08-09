"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { RouteLeg } from "@/lib/router";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Place = { id: string; name: string };
type Stop = { id: string; name: string; lat: number; lng: number };
type Phase = "from" | "to" | "route" | "transit" | "arrived";

type Waypoint = {
  name: string;
  minutes: number;
  isRide: boolean;
  mode?: string;
  fromStopId?: string;
  toStopId?: string;
  fareMin?: number;
  fareMax?: number;
};

const COLORS = ["#0ea5e9", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];
const MODE_LABEL: Record<string, string> = { bus: "BUS", keke: "KEEKE", okada: "OKADA", walk: "WALK" };

export default function Home() {
  const [phase, setPhase] = useState<Phase>("from");
  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ] = useState("");
  const [fromResults, setFromResults] = useState<Place[]>([]);
  const [toResults, setToResults] = useState<Place[]>([]);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [route, setRoute] = useState<{ legs: RouteLeg[]; transfers: number; totalMinutes: number; totalFareMin: number; totalFareMax: number } | null>(null);
  const [error, setError] = useState("");
  const [stops, setStops] = useState<Stop[]>([]);

  const [tripIndex, setTripIndex] = useState(0);
  const [atStop, setAtStop] = useState(false);
  const [fareAmount, setFareAmount] = useState("");
  const [fareLogged, setFareLogged] = useState(false);
  const [fareSaving, setFareSaving] = useState(false);

  useEffect(() => {
    fetch("/api/stops")
      .then((r) => r.json())
      .then((j) => setStops(j.stops ?? []))
      .catch(() => {});
  }, []);

  const waypoints: Waypoint[] = useMemo(() => {
    if (!route) return [];
    return route.legs.map((leg) =>
      leg.kind === "walk"
        ? { name: leg.toLabel, minutes: leg.minutes, isRide: false }
        : {
            name: leg.toStop,
            minutes: leg.minutes,
            isRide: true,
            mode: leg.mode,
            fromStopId: leg.fromStopId,
            toStopId: leg.toStopId,
            fareMin: leg.fareMin,
            fareMax: leg.fareMax
          }
    );
  }, [route]);

  async function search(q: string): Promise<Place[]> {
    const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    return j.results ?? [];
  }

  useEffect(() => {
    if (phase !== "from" || fromQ.length < 2) return setFromResults([]);
    const t = setTimeout(async () => setFromResults(await search(fromQ)), 150);
    return () => clearTimeout(t);
  }, [fromQ, phase]);

  useEffect(() => {
    if (phase !== "to" || toQ.length < 2) return setToResults([]);
    const t = setTimeout(async () => setToResults(await search(toQ)), 150);
    return () => clearTimeout(t);
  }, [toQ, phase]);

  async function getRoute() {
    setError("");
    if (!fromPlace || !toPlace) return;
    const r = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPlaceId: fromPlace.id, toPlaceId: toPlace.id, avoidModes: [] })
    });
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "Failed");
    setRoute(j.route);
    setTripIndex(0);
    setAtStop(false);
    setFareAmount("");
    setFareLogged(false);
    setPhase("route");
  }

  function startTransit() {
    setAtStop(false);
    setFareAmount("");
    setFareLogged(false);
    setPhase("transit");
  }

  function advance() {
    if (tripIndex + 1 >= waypoints.length) {
      setPhase("arrived");
      return;
    }
    setTripIndex((i) => i + 1);
    setAtStop(false);
    setFareAmount("");
    setFareLogged(false);
  }

  async function logFare() {
    const leg = route?.legs[tripIndex];
    if (!leg || leg.kind !== "ride") return;
    const amount = Number(fareAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setFareSaving(true);
    try {
      await fetch("/api/fare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromStopId: leg.fromStopId,
          toStopId: leg.toStopId,
          mode: leg.mode,
          amount
        })
      });
      setFareLogged(true);
    } finally {
      setFareSaving(false);
    }
  }

  function reset() {
    setPhase("from");
    setFromQ("");
    setToQ("");
    setFromPlace(null);
    setToPlace(null);
    setFromResults([]);
    setToResults([]);
    setRoute(null);
    setError("");
    setTripIndex(0);
    setAtStop(false);
    setFareAmount("");
    setFareLogged(false);
  }

  const currentLeg = route?.legs[tripIndex];
  const currentWp = waypoints[tripIndex];
  const showMap = phase === "route" || phase === "transit" || phase === "arrived";

  return (
    <main style={phase === "from" || phase === "to" ? styles.pageCenter : styles.pageMap}>
      {phase === "arrived" && <Confetti />}

      {showMap && (
        <div style={styles.mapWrap}>
          <MapView stops={stops} legs={route?.legs ?? []} tripIndex={tripIndex} atStop={atStop} phase={phase} />
        </div>
      )}

      {phase === "from" && (
        <div style={styles.cardCenter}>
          <Picker
            key="from"
            title="Where are you?"
            subtitle="Pick your current location"
            q={fromQ}
            setQ={setFromQ}
            results={fromResults}
            accent="START"
            onPick={(p) => {
              setFromPlace(p);
              setFromQ(p.name);
              setFromResults([]);
              setPhase("to");
            }}
          />
          {error && <div style={styles.error}>{error}</div>}
        </div>
      )}

      {phase === "to" && (
        <div style={styles.cardCenter}>
          <Picker
            key="to"
            title="Where are you going?"
            subtitle="Pick your destination"
            q={toQ}
            setQ={setToQ}
            results={toResults}
            onPick={(p) => {
              setToPlace(p);
              setToQ(p.name);
              setToResults([]);
              getRoute();
            }}
            onBack={() => setPhase("from")}
          />
          {error && <div style={styles.error}>{error}</div>}
        </div>
      )}

      {phase === "route" && route && (
        <div style={styles.cardBelow}>
          <div className="fade-up" style={styles.stack}>
            <div style={styles.routeHeader}>
              <button style={styles.linkBtn} onClick={() => setPhase("from")}>
                ⇦ change start
              </button>
              <div style={styles.routeHeaderTitle}>
                <span style={{ fontSize: 34, fontWeight: 800, color: "#0b9d58" }}>{fromPlace?.name}</span>
                <span style={styles.arrow}>→</span>
                <span style={{ fontSize: 34, fontWeight: 800 }}>{toPlace?.name}</span>
              </div>
            </div>

            <div style={styles.metrics}>
              <div style={styles.metric}>
                <div style={styles.metricValue}>{route.totalMinutes}</div>
                <div style={styles.metricLabel}>MINUTES</div>
              </div>
              <div style={styles.metric}>
                <div style={styles.metricValue}>{route.transfers}</div>
                <div style={styles.metricLabel}>TRANSFERS</div>
              </div>
              <div style={styles.metric}>
                <div style={styles.metricValue}>
                  ₦{route.totalFareMin}–{route.totalFareMax}
                </div>
                <div style={styles.metricLabel}>FARE</div>
              </div>
            </div>

            <ol style={{ ...styles.steps, listStyle: "none" }}>
              {route.legs.map((leg, i) => (
                <li key={i} style={styles.step}>
                  {leg.kind === "walk" ? (
                    <div style={styles.stepText}>
                      <div style={styles.stepTitle}>Walk {leg.minutes} min</div>
                      <div style={styles.stepSub}>
                        {leg.fromLabel} → {leg.toLabel}
                      </div>
                    </div>
                  ) : (
                    <div style={styles.stepText}>
                      <div style={{ ...styles.stepTitle, color: "#0b9d58" }}>
                        {MODE_LABEL[leg.mode]} · {leg.minutes} min · ₦{leg.fareMin}–{leg.fareMax}
                      </div>
                      <div style={styles.stepSub}>
                        {leg.fromStop} → {leg.toStop}
                      </div>
                      {leg.notes && <div style={styles.stepNote}>{leg.notes}</div>}
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <button style={styles.cta} onClick={startTransit}>
              START TRANSIT
            </button>
          </div>
        </div>
      )}

      {phase === "transit" && route && currentLeg && currentWp && (
        <div style={styles.floatingCard}>
          <div className="fade-up" style={styles.stack}>
            <div style={styles.progress}>
              Stop {Math.min(tripIndex + 1, waypoints.length)} of {waypoints.length}
            </div>

            <div style={styles.eyebrow}>NEXT STOP</div>
            <div style={styles.stopName}>{currentWp.name}</div>

            <div style={styles.timeToNext}>
              ~ {currentLeg.minutes} min{" "}
              {currentWp.isRide && currentWp.mode && <span style={styles.modeTag}>{MODE_LABEL[currentWp.mode]}</span>}
            </div>

            {!currentWp.isRide && !atStop && <div style={styles.walkHint}>walk there</div>}

            {!atStop && (
              <button style={styles.cta} onClick={() => setAtStop(true)}>
                ARE YOU HERE?
              </button>
            )}

            {atStop && currentLeg.kind === "ride" && !fareLogged && (
              <div style={styles.fareCard}>
                <div style={styles.fareTitle}>How much did you pay?</div>
                <div style={styles.fareHint}>
                  usually ₦{currentLeg.fareMin}–{currentLeg.fareMax}
                </div>
                <div style={styles.fareRow}>
                  <span style={styles.currency}>₦</span>
                  <input
                    style={styles.fareInput}
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={fareAmount}
                    onChange={(e) => setFareAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") logFare();
                    }}
                  />
                  <button style={styles.fareBtn} onClick={logFare} disabled={fareSaving || !fareAmount}>
                    {fareSaving ? "..." : "LOG IT"}
                  </button>
                </div>
              </div>
            )}

            {atStop && currentLeg.kind === "ride" && fareLogged && (
              <div style={styles.logged}>Logged ✓ thanks for keeping fares real</div>
            )}

            {atStop && (
              <button style={styles.nextBtn} onClick={advance}>
                {tripIndex + 1 >= waypoints.length ? "YOU'RE THERE 🎉" : "SHOW NEXT →"}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "arrived" && (
        <div style={styles.arrivalOverlay}>
          <div className="fade-up" style={styles.arrivalCard}>
            <div style={styles.bigEmoji}>🎉</div>
            <div style={styles.arrivalTitle}>You made it!</div>
            <div style={styles.arrivalSub}>
              {fromPlace?.name} → {toPlace?.name}
              <br />
              about {route?.totalMinutes} minutes, around ₦{route?.totalFareMin}–{route?.totalFareMax}
            </div>
            <button style={styles.cta} onClick={reset}>
              PLAN ANOTHER TRIP
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Picker(props: {
  title: string;
  subtitle: string;
  q: string;
  setQ: (s: string) => void;
  results: Place[];
  accent?: string;
  onPick: (p: Place) => void;
  onBack?: () => void;
}) {
  return (
    <div className="fade-up" style={styles.stack}>
      {props.onBack && (
        <button style={styles.linkBtn} onClick={props.onBack}>
          ⇦ back
        </button>
      )}
      <div style={styles.eyebrow}>{props.accent ?? "DESTINATION"}</div>
      <h1 style={styles.question}>{props.title}</h1>
      <div style={styles.subtitle}>{props.subtitle}</div>
      <input
        style={styles.input}
        autoFocus
        value={props.q}
        onChange={(e) => props.setQ(e.target.value)}
        placeholder="type a place…"
      />
      {props.results.length > 0 && (
        <div style={styles.dropdown}>
          {props.results.map((p) => (
            <button key={p.id} style={styles.dropdownItem} onClick={() => props.onPick(p)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {props.q.length >= 2 && props.results.length === 0 && <div style={styles.noResults}>no matches — try another spelling</div>}
    </div>
  );
}

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 90 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 3 + Math.random() * 3,
      drift: (Math.random() - 0.5) * 160,
      color: COLORS[i % COLORS.length],
      scale: 0.6 + Math.random() * 0.9
    }))
  );
  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ["--drift" as string]: `${p.drift}px`,
            transform: `scale(${p.scale})`
          }}
        />
      ))}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageCenter: {
    minHeight: "100dvh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "4vh 4vw",
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#f4f7f6",
    color: "#0d1117"
  },
  pageMap: {
    minHeight: "100dvh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#f4f7f6",
    color: "#0d1117",
    position: "relative"
  },
  mapWrap: {
    width: "100%",
    flex: "0 0 45vh",
    position: "relative",
    overflow: "hidden",
    borderBottom: "3px solid #e2e8f0"
  },
  cardCenter: {
    width: "100%",
    maxWidth: 560,
    background: "#ffffff",
    borderRadius: 40,
    padding: "clamp(28px, 6vw, 64px)",
    boxShadow: "0 24px 80px rgba(13, 17, 23, 0.12)",
    display: "flex",
    flexDirection: "column"
  },
  cardBelow: {
    width: "100%",
    maxWidth: 640,
    margin: "0 auto",
    padding: "clamp(20px, 4vw, 40px)",
    flex: "1 1 auto"
  },
  floatingCard: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "0 4vw 4vh",
    zIndex: 50
  },
  arrivalOverlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4vh 4vw",
    zIndex: 50
  },
  arrivalCard: {
    maxWidth: 480,
    width: "100%",
    background: "rgba(255, 255, 255, 0.97)",
    backdropFilter: "blur(16px)",
    borderRadius: 40,
    padding: "48px 32px",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.2)",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    textAlign: "center"
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  eyebrow: {
    fontSize: "clamp(16px, 3.4vw, 22px)",
    fontWeight: 800,
    letterSpacing: "0.22em",
    color: "#0b9d58"
  },
  question: {
    fontSize: "clamp(40px, 11vw, 64px)",
    fontWeight: 900,
    lineHeight: 1.04,
    letterSpacing: "-0.03em",
    margin: 0
  },
  subtitle: {
    fontSize: "clamp(18px, 4.4vw, 24px)",
    color: "#5b6570",
    marginTop: -12
  },
  input: {
    width: "100%",
    fontSize: "clamp(24px, 6vw, 32px)",
    padding: "22px 24px",
    borderRadius: 24,
    border: "3px solid #0d1117",
    outline: "none",
    background: "#fff",
    color: "#0d1117"
  },
  dropdown: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  dropdownItem: {
    textAlign: "left",
    fontSize: "clamp(22px, 5.4vw, 28px)",
    fontWeight: 700,
    padding: "22px 24px",
    borderRadius: 20,
    border: "2px solid #e2e8f0",
    background: "#fff",
    color: "#0d1117",
    cursor: "pointer"
  },
  noResults: {
    fontSize: 20,
    color: "#94a3b8",
    textAlign: "center"
  },
  cta: {
    fontSize: "clamp(22px, 5.6vw, 30px)",
    fontWeight: 900,
    letterSpacing: "0.04em",
    color: "#fff",
    background: "#0b9d58",
    border: "none",
    borderRadius: 999,
    padding: "24px",
    cursor: "pointer",
    boxShadow: "0 14px 30px rgba(11, 157, 88, 0.35)"
  },
  nextBtn: {
    fontSize: "clamp(22px, 5.6vw, 30px)",
    fontWeight: 900,
    letterSpacing: "0.04em",
    color: "#0d1117",
    background: "#ffd54a",
    border: "3px solid #0d1117",
    borderRadius: 999,
    padding: "22px",
    cursor: "pointer"
  },
  linkBtn: {
    alignSelf: "flex-start",
    background: "none",
    border: "none",
    fontSize: "clamp(16px, 4vw, 20px)",
    fontWeight: 700,
    color: "#5b6570",
    cursor: "pointer",
    padding: 8
  },
  routeHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  routeHeaderTitle: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    lineHeight: 1.15
  },
  arrow: {
    fontSize: 28,
    color: "#94a3b8"
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10
  },
  metric: {
    background: "#f1f5f9",
    borderRadius: 20,
    padding: "16px 10px",
    textAlign: "center"
  },
  metricValue: {
    fontSize: "clamp(20px, 4.6vw, 26px)",
    fontWeight: 900
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: "#5b6570",
    marginTop: 4
  },
  steps: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 0,
    margin: 0
  },
  step: {
    background: "#f8fafc",
    border: "2px solid #e2e8f0",
    borderRadius: 20,
    padding: "16px 20px"
  },
  stepText: {
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  stepTitle: {
    fontSize: "clamp(18px, 4.4vw, 24px)",
    fontWeight: 800
  },
  stepSub: {
    fontSize: "clamp(16px, 3.8vw, 20px)",
    color: "#5b6570"
  },
  stepNote: {
    fontSize: 15,
    color: "#94a3b8",
    marginTop: 6
  },
  progress: {
    fontSize: "clamp(18px, 4.4vw, 24px)",
    fontWeight: 700,
    color: "#5b6570"
  },
  stopName: {
    fontSize: "clamp(36px, 10vw, 56px)",
    fontWeight: 900,
    lineHeight: 1.02,
    letterSpacing: "-0.02em",
    marginTop: -8
  },
  timeToNext: {
    fontSize: "clamp(24px, 6vw, 34px)",
    fontWeight: 800,
    color: "#0b9d58"
  },
  modeTag: {
    display: "inline-block",
    fontSize: "clamp(16px, 4vw, 22px)",
    fontWeight: 900,
    letterSpacing: "0.12em",
    color: "#0d1117",
    background: "#ffd54a",
    borderRadius: 999,
    padding: "6px 16px",
    marginLeft: 10,
    verticalAlign: "middle"
  },
  walkHint: {
    fontSize: 20,
    color: "#5b6570"
  },
  fareCard: {
    background: "rgba(241, 245, 249, 0.95)",
    borderRadius: 24,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  fareTitle: {
    fontSize: "clamp(22px, 5.4vw, 30px)",
    fontWeight: 900
  },
  fareHint: {
    fontSize: 17,
    color: "#5b6570"
  },
  fareRow: {
    display: "flex",
    alignItems: "center",
    gap: 10
  },
  currency: {
    fontSize: "clamp(24px, 6vw, 34px)",
    fontWeight: 900
  },
  fareInput: {
    flex: 1,
    fontSize: "clamp(24px, 6vw, 34px)",
    fontWeight: 800,
    padding: "14px 18px",
    borderRadius: 16,
    border: "3px solid #0d1117",
    outline: "none",
    background: "#fff"
  },
  fareBtn: {
    fontSize: "clamp(18px, 4.6vw, 24px)",
    fontWeight: 900,
    color: "#fff",
    background: "#0b9d58",
    border: "none",
    borderRadius: 16,
    padding: "16px 20px",
    cursor: "pointer"
  },
  logged: {
    fontSize: "clamp(18px, 4.6vw, 24px)",
    fontWeight: 800,
    color: "#0b9d58",
    textAlign: "center",
    padding: 8
  },
  error: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: 700,
    color: "#dc2626",
    textAlign: "center"
  },
  bigEmoji: {
    fontSize: 80
  },
  arrivalTitle: {
    fontSize: "clamp(40px, 11vw, 60px)",
    fontWeight: 900,
    letterSpacing: "-0.03em"
  },
  arrivalSub: {
    fontSize: "clamp(20px, 5vw, 26px)",
    color: "#5b6570",
    lineHeight: 1.5
  }
};
