import React, { useEffect, useState, useRef } from "react";
import { C, display, mono } from "./theme";
import { fmtDate } from "./lib";

export const Eyebrow = ({ children, color = C.steel }) => (
  <div style={{ color, fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase" }}>{children}</div>
);

export const Knurl = () => (
  <div style={{ height: 3, backgroundImage: `repeating-linear-gradient(115deg, ${C.steel}55 0 1px, transparent 1px 5px)` }} />
);

/*
 * Rest timer keyed on a wall-clock end time, not a tick count.
 * iOS suspends JS the moment the screen locks, so an interval-based
 * countdown freezes in your pocket. This recomputes from Date.now().
 */
export function RestBar({ endsAt, onClose }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  const total = useRef(Math.max(1, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt]);
  const pct = Math.max(0, (left / total.current) * 100);
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: C.rack, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ height: 3, width: `${pct}%`, background: left ? C.yellow : C.green, transition: "width .25s linear" }} />
      <div className="row" style={{ justifyContent: "space-between", padding: "12px 20px" }}>
        <span style={{ fontFamily: mono, color: C.chalk, fontSize: 22 }}>
          {left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "GO"}
        </span>
        <span style={{ color: C.steel, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          {left ? "Rest" : "Next round"}
        </span>
        <button onClick={onClose} style={{ color: C.steel, fontSize: 13, background: "none", border: "none" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function SetRow({ label, row, placeholder, accent, onChange, onTick }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ fontFamily: mono, color: C.steel, fontSize: 12, width: 78, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <input
        inputMode="decimal"
        value={row.weight ?? ""}
        onChange={(e) => onChange("weight", e.target.value)}
        placeholder={placeholder || "kg"}
        style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 2, background: C.rack, color: C.chalk, fontFamily: mono, fontSize: 15, border: "none" }}
      />
      <input
        inputMode="numeric"
        value={row.reps ?? ""}
        onChange={(e) => onChange("reps", e.target.value)}
        placeholder="reps"
        style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 2, background: C.rack, color: C.chalk, fontFamily: mono, fontSize: 15, border: "none" }}
      />
      <button
        onClick={onTick}
        aria-label="Log set"
        style={{ width: 44, height: 38, borderRadius: 2, border: "none", background: row.done ? accent : C.rack, color: row.done ? C.iron : C.steel, fontSize: 16 }}
      >
        ✓
      </button>
    </div>
  );
}

export function TechCard({ tech, accent }) {
  const t = tech;
  if (!t) return null;
  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 2, background: C.iron, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
        <span style={{ color: accent, fontFamily: display, fontWeight: 700, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {t.label}
        </span>
        <span style={{ color: C.steel, fontSize: 12 }}>{t.when}</span>
      </div>
      <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
        {t.steps.map((s, i) => (
          <li key={i} className="row" style={{ gap: 8, alignItems: "flex-start", marginTop: 6, color: C.chalk, fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ color: C.steel, fontFamily: mono, fontSize: 12 }}>{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Chart({ points, color, unit = "" }) {
  if (!points || points.length < 2)
    return (
      <div style={{ padding: "22px 16px", borderRadius: 2, background: C.plate, color: C.steel, fontSize: 13 }}>
        Log this twice and the trend shows up here.
      </div>
    );
  const W = 320, H = 130, PAD = 26;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  const xs = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const ys = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = points.map((p, i) => `${xs(i)},${ys(p.v)}`).join(" ");
  const change = points[points.length - 1].v - points[0].v;
  return (
    <div style={{ borderRadius: 2, background: C.plate, padding: "12px 12px 8px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Progress over time">
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(p.v)} r="3" fill={color} />)}
        <text x={PAD} y={14} fill={C.steel} fontSize="10" fontFamily="monospace">{max}{unit}</text>
        <text x={PAD} y={H - 6} fill={C.steel} fontSize="10" fontFamily="monospace">{min}{unit}</text>
      </svg>
      <div className="row" style={{ justifyContent: "space-between", color: C.steel, fontSize: 11, fontFamily: mono, padding: "0 4px 4px" }}>
        <span>{fmtDate(points[0].t)}</span>
        <span style={{ color: change >= 0 ? color : C.steel }}>
          {change >= 0 ? "+" : ""}{Math.round(change * 10) / 10}{unit} over {points.length}
        </span>
        <span>{fmtDate(points[points.length - 1].t)}</span>
      </div>
    </div>
  );
}

export function FinishButton({ onClick, done }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "16px 0", marginTop: 28, borderRadius: 2, border: "none",
        background: done ? C.plate : C.chalk, color: done ? C.steel : C.iron,
        fontFamily: display, fontWeight: 700, fontSize: 19, letterSpacing: "0.1em", textTransform: "uppercase",
        boxShadow: done ? `inset 0 0 0 1px ${C.rack}` : "none",
      }}
    >
      {done ? "Logged — save again" : "Log session"}
    </button>
  );
}

export function SyncChip({ status, pending }) {
  const map = {
    synced: { c: C.green, t: "Synced" },
    syncing: { c: C.yellow, t: "Syncing…" },
    pending: { c: C.yellow, t: `${pending} waiting to sync` },
    error: { c: C.red, t: "Sync failed — saved on this phone" },
    offline: { c: C.steel, t: "Offline — saved on this phone" },
    local: { c: C.steel, t: "Saved on this phone" },
  };
  const s = map[status] || map.local;
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: s.c }} />
      <span style={{ color: C.steel, fontSize: 13 }}>{s.t}</span>
    </div>
  );
}

/*
 * Always-visible status strip. Sits at the top of every screen, including
 * mid-session, because that's when you want to know your sets are landing.
 */
export function StatusBar({ status, onOpen }) {
  const { sync, pending, lastWriteAt, signedIn } = status;
  const recent = lastWriteAt && Date.now() - lastWriteAt < 8000;

  const map = {
    syncing: { c: C.yellow, t: "Syncing…" },
    synced:  { c: C.green,  t: signedIn ? "Saved & backed up" : "Saved on this phone" },
    pending: { c: C.yellow, t: `${pending} change${pending === 1 ? "" : "s"} waiting to back up` },
    error:   { c: C.red,    t: "Saved here · cloud sync failed" },
    offline: { c: C.steel,  t: "Offline · saved on this phone" },
    local:   { c: C.steel,  t: signedIn ? "Saved on this phone" : "Saved on this phone · not signed in" },
  };
  const s = map[sync] || map.local;

  return (
    <button
      onClick={onOpen}
      style={{
        position: "sticky", top: 0, zIndex: 20, width: "100%",
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 20px", border: "none", borderBottom: `1px solid ${C.rack}`,
        background: C.iron, color: C.steel, fontSize: 12, textAlign: "left",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 99, background: recent ? C.green : s.c, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {recent ? "Set logged ✓" : s.t}
      </span>
      <span style={{ color: C.steel, opacity: 0.7 }}>details ›</span>
    </button>
  );
}
