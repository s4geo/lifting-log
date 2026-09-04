import React, { useEffect, useMemo, useState } from "react";
import { C, display, mono } from "../theme";
import { slotAt, phaseOf, phaseIdx, blockOf, totalSlots, groupsFor } from "../programs";
import { db, patchSession, putSet, setsForSession } from "../db";
import { SetRow, TechCard, RestBar, FinishButton, Eyebrow } from "../components";
import { todayISO, num, int, e1rm } from "../lib";
import { suggest } from "../progression";

export default function Lift({ program, session, back }) {
  const slot = slotAt(program, session.slot_index);
  const day = program.sessions[slot.key];
  const phase = phaseOf(program, session.slot_index);
  const pi = phaseIdx(program, session.slot_index);
  const groups = useMemo(() => groupsFor(day), [day]);


  const [rows, setRows] = useState({});
  const [restEnds, setRestEnds] = useState(null);
  const [lastFor, setLastFor] = useState({});   // exercise_id -> history
  const [date, setDateState] = useState(session.performed_on || todayISO());
  const tips = useMemo(() => {
    const out = {};
    day.ex.forEach((x) => {
      const reps = pi === 1 && x.loadReps ? x.loadReps : x.reps;
      const t = suggest({ exerciseId: x.id, prescribedReps: reps, history: lastFor[x.id] });
      if (t) out[x.id] = t;
    });
    return out;
  }, [day, lastFor, pi]);

  const reload = async () => {
    const all = await setsForSession(session.id);
    const map = {};
    all.forEach((r) => { map[`${r.exercise_id}|${r.set_no}`] = r; });
    setRows(map);
  };

  useEffect(() => { reload(); }, [session.id]);

  // Per-exercise history, newest first, used to propose the next weight.
  useEffect(() => {
    (async () => {
      const sessions = await db.sessions.toArray();
      const done = sessions
        .filter((x) => x.id !== session.id && x.performed_on)
        .sort((a, b) => b.performed_on.localeCompare(a.performed_on));
      const all = await db.sets.toArray();
      const bySession = {};
      all.forEach((r) => { (bySession[r.session_id] = bySession[r.session_id] || []).push(r); });

      const hist = {};
      done.forEach((x) => {
        (bySession[x.id] || []).forEach((r) => {
          if (r.weight == null && r.reps == null) return;
          hist[r.exercise_id] = hist[r.exercise_id] || [];
          let entry = hist[r.exercise_id].find((e) => e.performed_on === x.performed_on);
          if (!entry) { entry = { performed_on: x.performed_on, sets: [] }; hist[r.exercise_id].push(entry); }
          entry.sets.push({ weight: r.weight, reps: r.reps });
        });
      });
      Object.values(hist).forEach((list) => {
        list.sort((a, b) => b.performed_on.localeCompare(a.performed_on));
        list.forEach((e) => e.sets.sort((a, b) => (a.set_no || 0) - (b.set_no || 0)));
      });
      setLastFor(hist);
    })();
  }, [session.id]);

  const change = async (exerciseId, setNo, field, value) => {
    const key = `${exerciseId}|${setNo}`;
    setRows((p) => ({ ...p, [key]: { ...(p[key] || {}), [field]: value } }));
    await putSet(session.id, exerciseId, setNo, { [field]: field === "reps" ? int(value) : num(value) });
  };

  const tick = async (exerciseId, setNo, rest, isLastOfRound) => {
    const key = `${exerciseId}|${setNo}`;
    const wasDone = rows[key]?.done;
    setRows((p) => ({ ...p, [key]: { ...(p[key] || {}), done: !wasDone } }));
    await putSet(session.id, exerciseId, setNo, { done: !wasDone });
    if (!wasDone && isLastOfRound) setRestEnds(Date.now() + rest * 1000);
  };

  const setDate = async (v) => {
    setDateState(v);
    await patchSession(session.id, { performed_on: v });
  };

  const finish = async () => {
    await patchSession(session.id, { done: true, performed_on: date });
    back();
  };

  return (
    <div style={{ padding: "0 20px 140px" }}>
      <Header back={back} phase={phase} index={session.slot_index} date={date} onDate={setDate} program={program} />
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 38, color: C.chalk, textTransform: "uppercase", lineHeight: 1, marginTop: 10 }}>
        {day.letter} · {day.title}
      </h1>
      <p style={{ color: C.steel, fontSize: 14, marginTop: 6 }}>{day.sub}.</p>

      <div style={{ marginTop: 24 }}>
        {groups.map((g, gi) => {
          const isSS = g.items.length > 1;
          const rounds = Math.max(...g.items.map((it) => it.x.sets));
          const rest = g.items[0].x.rest;
          const tech = g.items.find((it) => it.x.tech && pi >= (it.x.tech === "rp" ? 2 : 1) && program.tech[it.x.tech]);
          return (
            <div key={gi} style={{ background: C.plate, borderLeft: `3px solid ${isSS ? phase.color : C.rack}`, borderRadius: 2, padding: "14px 16px", marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <Eyebrow color={isSS ? phase.color : C.steel}>{isSS ? `Superset · ${rounds} rounds` : "Straight sets"}</Eyebrow>
                <span style={{ fontFamily: mono, color: C.steel, fontSize: 12 }}>{rest}s rest</span>
              </div>

              <div style={{ marginTop: 8 }}>
                {g.items.map((it, k) => {
                  const reps = pi === 1 && it.x.loadReps ? it.x.loadReps : it.x.reps;
                  return (
                    <div key={k} className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: 2 }}>
                      <span style={{ color: C.chalk, fontSize: 16, fontWeight: 500 }}>
                        {isSS && <span style={{ color: phase.color, fontFamily: mono, fontSize: 13, marginRight: 6 }}>{String.fromCharCode(97 + k)}</span>}
                        {it.x.name}
                      </span>
                      <span style={{ fontFamily: mono, color: C.steel, fontSize: 13, whiteSpace: "nowrap" }}>{it.x.sets} × {reps}</span>
                    </div>
                  );
                })}
              </div>

              {g.items.map((it, k) => {
                const tip = tips[it.x.id];
                if (!tip) return null;
                const tone = tip.kind === "up" ? C.green : tip.kind === "deload" ? C.yellow : C.steel;
                return (
                  <div key={`tip${k}`} style={{ color: tone, fontSize: 12, marginTop: 5, lineHeight: 1.4 }}>
                    {g.items.length > 1 ? `${String.fromCharCode(97 + k)} ` : ""}
                    <strong style={{ fontFamily: mono, fontWeight: 600 }}>{tip.weight} kg</strong> — {tip.reason}
                  </div>
                );
              })}

              {isSS && <div style={{ color: C.steel, fontSize: 12, marginTop: 6 }}>Straight from a into b, no rest. Rest {rest}s after b.</div>}

              <div style={{ marginTop: 12 }}>
                {Array.from({ length: rounds }).map((_, si) => (
                  <div key={si} style={{ marginBottom: 8 }}>
                    {isSS && <div style={{ color: C.steel, fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", marginBottom: 4 }}>ROUND {si + 1}</div>}
                    {g.items.map((it, k) => {
                      if (si >= it.x.sets) return null;
                      const key = `${it.x.id}|${si + 1}`;
                      const row = rows[key] || {};
                      const tip = tips[it.x.id];
                      return (
                        <div key={k} style={{ marginBottom: 6 }}>
                          <SetRow
                            label={isSS ? `${String.fromCharCode(97 + k)} ${it.x.name.split(" ")[0]}` : `Set ${si + 1}`}
                            row={row}
                            accent={phase.color}
                            placeholder={tip ? String(tip.weight) : "kg"}
                            onChange={(f, v) => change(it.x.id, si + 1, f, v)}
                            onTick={() => tick(it.x.id, si + 1, rest, k === g.items.length - 1)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {tech && <TechCard tech={program.tech[tech.x.tech]} accent={phase.color} />}
            </div>
          );
        })}
      </div>

      <FinishButton onClick={finish} done={session.done} />
      {restEnds && <RestBar endsAt={restEnds} onClose={() => setRestEnds(null)} />}
    </div>
  );
}

export function Header({ back, phase, index, date, onDate, program }) {
  return (
    <div style={{ paddingTop: 24 }}>
      <button onClick={back} style={{ color: C.steel, fontSize: 14, background: "none", border: "none", padding: 0 }}>← Block</button>
      <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <span style={{ background: phase.color, color: C.iron, fontFamily: mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 2 }}>
          {phase.name.toUpperCase()}
        </span>
        <span style={{ color: C.steel, fontFamily: mono, fontSize: 12 }}>
          Block {blockOf(program, index)} · Session {index + 1}/{totalSlots(program)}
        </span>
        <input
          type="date"
          value={date || ""}
          onChange={(e) => onDate(e.target.value)}
          aria-label="Session date"
          style={{ background: C.plate, color: C.steel, fontFamily: mono, fontSize: 12, border: "none", borderRadius: 2, padding: "4px 8px", colorScheme: "dark" }}
        />
      </div>
    </div>
  );
}
