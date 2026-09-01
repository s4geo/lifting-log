import React, { useMemo, useRef, useState } from "react";
import { C, display, mono } from "../theme";
import { slotAt, blockOf, phaseOf, totalSlots, sessionLabel } from "../programs";
import { Eyebrow, Knurl, SyncChip } from "../components";
import { exportAll, importAll, wipe, noteBackupTaken } from "../db";
import { fmtDate, daysBetween, todayISO } from "../lib";

function Dial({ program, index, onPick }) {
  const pos = index % program.slots.length;
  return (
    <div className="row" style={{ gap: 6 }}>
      {program.slots.map((s, i) => {
        const live = i === pos;
        return (
          <button
            key={i}
            onClick={() => onPick(index - pos + i)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 2, border: "none",
              background: live ? C.chalk : C.rack, color: live ? C.iron : C.steel,
              fontFamily: display, fontWeight: 700, fontSize: 15, letterSpacing: "0.1em",
            }}
          >
            {s.kind === "lift" ? s.key : s.kind === "steady" ? "RUN" : "INT"}
          </button>
        );
      })}
    </div>
  );
}

export default function Home({ program, cycle, sessions, cursor, go, openProgress, openCycles, openStatus, syncStatus, pending, onSignIn, email, onReload }) {
  const [paste, setPaste] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef();

  const TOTAL = totalSlots(program);
  const phase = phaseOf(program, cursor);
  const slot = slotAt(program, cursor);
  const done = sessions.filter((s) => s.done).length;
  const day = slot.kind === "lift" ? program.sessions[slot.key] : null;
  const title = day ? day.title : slot.kind === "steady" ? "Steady run" : "Intervals";
  const sub = day ? `Session ${day.letter} · ${day.sub}`
    : slot.kind === "steady" ? "7-10 km continuous" : "Rower, ski erg, bike or run";

  const dated = useMemo(() => sessions.filter((s) => s.done && s.performed_on).sort((a, b) => b.performed_on.localeCompare(a.performed_on)), [sessions]);
  const gap = dated.length ? daysBetween(dated[0].performed_on, todayISO()) : null;
  const byIndex = useMemo(() => Object.fromEntries(sessions.map((s) => [s.slot_index, s])), [sessions]);

  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lifting-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    await noteBackupTaken();
  };

  const restore = async (text) => {
    try {
      await importAll(JSON.parse(text));
      setMsg("Restored. Everything below is back.");
      setPaste("");
      setShowRestore(false);
      onReload();
    } catch {
      setMsg("Couldn't read that. It should be the JSON file this app exports.");
    }
  };

  const link = { color: C.chalk, fontSize: 13, textDecoration: "underline", background: "none", border: "none", padding: 0 };

  return (
    <div style={{ padding: "0 20px 60px" }}>
      <div style={{ paddingTop: 28, paddingBottom: 20 }}>
        <button onClick={openCycles} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
          <Eyebrow>{cycle?.name || program.name} ›</Eyebrow>
        </button>
        <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 40, lineHeight: 1, color: C.chalk, textTransform: "uppercase", marginTop: 6 }}>
          Block {blockOf(program, cursor)} of {program.blocks}
        </h1>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <span style={{ background: phase.color, color: C.iron, fontFamily: mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 2 }}>
            {phase.kg} KG · {phase.name.toUpperCase()}
          </span>
          <span style={{ color: C.steel, fontSize: 13, fontFamily: mono }}>{done}/{TOTAL} logged</span>
        </div>
        <p style={{ color: C.steel, fontSize: 14, lineHeight: 1.5, marginTop: 12 }}>{phase.note}</p>
      </div>

      <Knurl />

      <div style={{ paddingTop: 20 }}><Dial program={program} index={cursor} onPick={go} /></div>

      <button onClick={() => go(cursor)} style={{ width: "100%", textAlign: "left", marginTop: 20, borderRadius: 2, background: C.plate, border: "none", boxShadow: `inset 0 0 0 1px ${C.rack}`, padding: "20px" }}>
        <Eyebrow color={phase.color}>Up next</Eyebrow>
        <div style={{ fontFamily: display, fontWeight: 600, fontSize: 34, color: C.chalk, lineHeight: 1.05, marginTop: 4, textTransform: "uppercase" }}>{title}</div>
        <div style={{ color: C.steel, fontSize: 14, marginTop: 4 }}>{sub}</div>
        <div style={{ marginTop: 16, display: "inline-block", padding: "8px 16px", borderRadius: 2, background: C.chalk, color: C.iron, fontWeight: 600, fontSize: 14 }}>Start</div>
      </button>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button onClick={openProgress} style={{ flex: 1, padding: "14px", borderRadius: 2, background: "none", border: `1px solid ${C.rack}`, color: C.chalk, fontSize: 14, textAlign: "left" }}>
          Progress &amp; pace →
        </button>
        <button onClick={openCycles} style={{ flex: 1, padding: "14px", borderRadius: 2, background: "none", border: `1px solid ${C.rack}`, color: C.chalk, fontSize: 14, textAlign: "left" }}>
          Cycles →
        </button>
      </div>

      {dated.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <Eyebrow>Recent</Eyebrow>
          <div style={{ marginTop: 10 }}>
            {dated.slice(0, 4).map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "baseline", background: C.plate, borderRadius: 2, padding: "9px 12px", marginBottom: 5 }}>
                <span style={{ color: C.chalk, fontSize: 14 }}>
                  {sessionLabel(s, program)}
                </span>
                <span style={{ fontFamily: mono, color: C.steel, fontSize: 12 }}>{fmtDate(s.performed_on)}</span>
              </div>
            ))}
          </div>
          {gap !== null && (
            <div style={{ color: gap > 3 ? C.yellow : C.steel, fontSize: 13, marginTop: 8 }}>
              {gap === 0 ? "Trained today." : gap === 1 ? "Last session yesterday." : `${gap} days since your last session.`}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <Eyebrow>All {TOTAL} sessions</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginTop: 12 }}>
          {Array.from({ length: TOTAL }).map((_, i) => {
            const s = byIndex[i];
            const k = slotAt(program, i);
            return (
              <button key={i} onClick={() => go(i)}
                style={{
                  aspectRatio: "1", borderRadius: 2, border: "none",
                  background: s?.done ? phaseOf(program, i).color : C.plate,
                  opacity: k.kind !== "lift" && !s?.done ? 0.55 : 1,
                  color: s?.done ? C.iron : C.steel,
                  fontFamily: mono, fontSize: 11, fontWeight: 600,
                  boxShadow: i === cursor ? `0 0 0 2px ${C.chalk}` : "none",
                }}>
                {k.kind === "lift" ? k.key : k.kind === "steady" ? "~" : "/"}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.rack}` }}>
        <SyncChip status={syncStatus} pending={pending} />
        <div style={{ color: C.steel, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
          {email
            ? `Backed up to your account (${email}). Every set is saved on this phone first, then synced.`
            : "Working offline on this phone only. Sign in to back up to the cloud."}
        </div>
        <div className="row" style={{ gap: 16, marginTop: 12, flexWrap: "wrap" }}>
          {!email && <button onClick={onSignIn} style={link}>Sign in</button>}
          <button onClick={openStatus} style={link}>Data status</button>
          <button onClick={download} style={link}>Download backup</button>
          <button onClick={() => setShowRestore((v) => !v)} style={{ ...link, color: C.steel }}>Restore</button>
        </div>
        {showRestore && (
          <div style={{ marginTop: 12 }}>
            <input ref={fileRef} type="file" accept="application/json" style={{ color: C.steel, fontSize: 13 }}
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) restore(await f.text()); }} />
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder="…or paste the backup JSON here"
              style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 2, background: C.plate, color: C.chalk, fontFamily: mono, fontSize: 13, border: "none", resize: "vertical" }} />
            <button onClick={() => restore(paste)} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 2, background: C.chalk, color: C.iron, fontSize: 14, fontWeight: 600, border: "none" }}>
              Restore
            </button>
          </div>
        )}
        {msg && <div style={{ color: C.steel, fontSize: 13, marginTop: 8 }}>{msg}</div>}
        <button onClick={async () => { if (confirm("Clear everything on this device and start block 1 again?")) { await wipe(); onReload(); } }}
          style={{ ...link, color: C.steel, marginTop: 16, display: "block" }}>
          Start the cycle over
        </button>
      </div>
    </div>
  );
}
