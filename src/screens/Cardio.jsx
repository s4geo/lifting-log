import React, { useState } from "react";
import { C, display, mono } from "../theme";
import { slotAt, phaseOf } from "../programs";
import { patchSession } from "../db";
import { FinishButton, Eyebrow } from "../components";
import { Header } from "./Lift";
import { todayISO, num } from "../lib";

export default function Cardio({ program, session, back }) {
  const MODES = program.modes;
  const slot = slotAt(program, session.slot_index);
  const phase = phaseOf(program, session.slot_index);
  const steady = slot.kind === "steady";
  const [local, setLocal] = useState({
    mode: session.mode || (steady ? "run" : "rower"),
    distance: session.distance ?? "",
    duration: session.duration ?? "",
    notes: session.notes ?? "",
    performed_on: session.performed_on || todayISO(),
  });

  const set = async (patch) => {
    setLocal((p) => ({ ...p, ...patch }));
    await patchSession(session.id, patch.distance !== undefined ? { ...patch, distance: num(patch.distance) } : patch);
  };

  const finish = async () => {
    await patchSession(session.id, {
      done: true,
      performed_on: local.performed_on,
      mode: local.mode,
      distance: num(local.distance),
      duration: local.duration,
      notes: local.notes,
    });
    back();
  };

  const field = { padding: "12px 16px", borderRadius: 2, background: C.plate, color: C.chalk, fontFamily: mono, fontSize: 16, border: "none", minWidth: 0 };

  return (
    <div style={{ padding: "0 20px 140px" }}>
      <Header back={back} phase={phase} index={session.slot_index} date={local.performed_on} onDate={(v) => set({ performed_on: v })} program={program} />
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 38, color: C.chalk, textTransform: "uppercase", lineHeight: 1, marginTop: 10 }}>
        {steady ? "Steady run" : "Intervals"}
      </h1>
      <p style={{ color: C.steel, fontSize: 14, marginTop: 6 }}>
        {steady
          ? "7-10 km continuous. Conversational — if you can't nose-breathe it, slow down."
          : "5 min easy to open, 5 min easy to close. Hard means hard."}
      </p>

      {!steady && (
        <>
          <div style={{ marginTop: 24 }}><Eyebrow>Machine</Eyebrow></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            {Object.keys(MODES).map((k) => (
              <button
                key={k}
                onClick={() => set({ mode: k })}
                style={{
                  padding: "12px 0", borderRadius: 2, border: "none",
                  background: local.mode === k ? C.chalk : C.plate,
                  color: local.mode === k ? C.iron : C.steel,
                  fontFamily: display, fontWeight: 600, fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase",
                }}
              >
                {MODES[k].label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 2, background: C.plate, borderLeft: `3px solid ${phase.color}` }}>
            <div style={{ color: C.chalk, fontFamily: mono, fontSize: 15 }}>{MODES[local.mode]?.protocol || "Intervals"}</div>
          </div>
        </>
      )}

      <div style={{ marginTop: 24 }}><Eyebrow>Log it</Eyebrow></div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input inputMode="decimal" value={local.distance} onChange={(e) => set({ distance: e.target.value })}
          placeholder={steady ? "km" : MODES[local.mode]?.unit || "distance"} style={{ ...field, flex: 1 }} />
        <input value={local.duration} onChange={(e) => set({ duration: e.target.value })}
          placeholder="time" style={{ ...field, flex: 1 }} />
      </div>
      <input value={local.notes} onChange={(e) => set({ notes: e.target.value })}
        placeholder="How it felt" style={{ ...field, width: "100%", marginTop: 8, fontFamily: "inherit", fontSize: 15 }} />

      <FinishButton onClick={finish} done={session.done} />
    </div>
  );
}
