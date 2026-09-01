import React, { useEffect, useMemo, useState } from "react";
import { C, display, mono } from "../theme";
import { getProgram, phaseOf, totalSlots, exerciseName, sessionLabel, modeLabel } from "../programs";
import { db } from "../db";
import { Chart, Eyebrow } from "../components";
import { fmtDate, fmtFull, daysBetween, e1rm, num, int, DAY } from "../lib";

export default function Progress({ back, cycle }) {
  const [tab, setTab] = useState("lifts");
  const [scope, setScope] = useState("cycle");
  const [pick, setPick] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sets, setSets] = useState([]);

  useEffect(() => {
    (async () => {
      const [ss, xs] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
      const scoped = scope === "cycle" && cycle ? ss.filter((s) => s.cycle_id === cycle.id) : ss;
      setSessions(scoped.filter((s) => s.performed_on).sort((a, b) => a.performed_on.localeCompare(b.performed_on)));
      setSets(xs);
    })();
  }, [scope, cycle]);

  const byId = useMemo(() => Object.fromEntries(sessions.map((s) => [s.id, s])), [sessions]);
  const scored = useMemo(
    () => sets.filter((r) => byId[r.session_id] && num(r.weight) !== null && int(r.reps)),
    [sets, byId]
  );

  const names = useMemo(() => {
    const ids = [...new Set(scored.map((r) => r.exercise_id))];
    return ids.map((id) => ({ id, name: exerciseName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [scored]);
  const chosen = pick || names[0]?.id;

  const exPoints = useMemo(() => {
    const per = {};
    scored.filter((r) => r.exercise_id === chosen).forEach((r) => {
      const d = byId[r.session_id].performed_on;
      const v = e1rm(num(r.weight), int(r.reps));
      if (v && (!per[d] || v > per[d])) per[d] = v;
    });
    return Object.entries(per).sort().map(([t, v]) => ({ t, v }));
  }, [chosen, scored, byId]);

  const volPoints = useMemo(() => {
    const per = {};
    scored.forEach((r) => {
      const d = byId[r.session_id].performed_on;
      per[d] = (per[d] || 0) + num(r.weight) * int(r.reps);
    });
    return Object.entries(per).sort().map(([t, v]) => ({ t, v: Math.round(v / 100) / 10 }));
  }, [scored, byId]);

  const cardioSessions = useMemo(() => sessions.filter((s) => s.kind !== "lift" && s.done), [sessions]);
  const cardioPoints = useMemo(
    () => cardioSessions.filter((s) => num(s.distance)).map((s) => ({ t: s.performed_on, v: num(s.distance) })),
    [cardioSessions]
  );

  const doneList = sessions.filter((s) => s.done);
  const cadence = useMemo(() => {
    if (doneList.length < 2) return null;
    const first = doneList[0].performed_on;
    const last = doneList[doneList.length - 1].performed_on;
    const span = Math.max(1, daysBetween(first, last));
    return { count: doneList.length, perWeek: (doneList.length / span) * 7, first, last };
  }, [doneList]);
  const program = cycle ? getProgram(cycle.program_id, cycle.program_version) : null;
  const TOTAL = program ? totalSlots(program) : doneList.length;
  const remaining = Math.max(0, TOTAL - doneList.length);
  const finishBy = cadence && cadence.perWeek > 0 ? new Date(Date.now() + (remaining / cadence.perWeek) * 7 * DAY).toISOString().slice(0, 10) : null;

  const tabBtn = (t) => ({
    flex: 1, padding: "10px 0", borderRadius: 2, border: "none",
    background: tab === t ? C.chalk : C.plate, color: tab === t ? C.iron : C.steel,
    fontFamily: display, fontWeight: 600, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.08em",
  });

  return (
    <div style={{ padding: "0 20px 100px" }}>
      <div style={{ paddingTop: 24 }}>
        <button onClick={back} style={{ color: C.steel, fontSize: 14, background: "none", border: "none", padding: 0 }}>← Block</button>
      </div>
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 38, color: C.chalk, textTransform: "uppercase", lineHeight: 1, marginTop: 14 }}>
        Progress
      </h1>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        {[["cycle", cycle?.name || "This cycle"], ["all", "All time"]].map(([k, label]) => (
          <button key={k} onClick={() => setScope(k)}
            style={{
              padding: "7px 14px", borderRadius: 2, border: "none",
              background: scope === k ? C.chalk : C.plate, color: scope === k ? C.iron : C.steel,
              fontFamily: mono, fontSize: 12, letterSpacing: "0.06em",
            }}>
            {label}
          </button>
        ))}
      </div>
      {scope === "all" && (
        <div style={{ color: C.steel, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          Every cycle and programme together. Exercises share ids across programmes, so a back squat is a back squat.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 20 }}>
        {[
          { k: "Sessions", v: doneList.length },
          { k: "Per week", v: cadence ? Math.round(cadence.perWeek * 10) / 10 : "—" },
          { k: "Finish by", v: finishBy ? fmtDate(finishBy) : "—" },
        ].map((s) => (
          <div key={s.k} style={{ background: C.plate, borderRadius: 2, padding: "12px 12px" }}>
            <div style={{ fontFamily: mono, color: C.chalk, fontSize: 20 }}>{s.v}</div>
            <div style={{ color: C.steel, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>{s.k}</div>
          </div>
        ))}
      </div>
      {cadence && (
        <p style={{ color: C.steel, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
          Started {fmtFull(cadence.first)}, last session {fmtFull(cadence.last)}. The block wants about 4.7 a week — under 3.5 and the phases stretch out.
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 24 }}>
        {["lifts", "cardio", "log"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(t)}>{t}</button>
        ))}
      </div>

      {tab === "lifts" && (
        <div style={{ marginTop: 20 }}>
          {!names.length ? (
            <div style={{ color: C.steel, fontSize: 14 }}>Nothing logged yet. Weights you enter show up here as trends.</div>
          ) : (
            <>
              <Eyebrow>Estimated one-rep max</Eyebrow>
              <select
                value={chosen}
                onChange={(e) => setPick(e.target.value)}
                style={{ width: "100%", padding: "12px", borderRadius: 2, background: C.rack, color: C.chalk, fontSize: 15, border: "none", margin: "8px 0 12px" }}
              >
                {names.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <Chart points={exPoints} color={C.yellow} unit=" kg" />
              <div style={{ marginTop: 24 }}>
                <Eyebrow>Session volume</Eyebrow>
                <div style={{ color: C.steel, fontSize: 12, margin: "2px 0 8px" }}>Hundreds of kg moved, all sets counted</div>
                <Chart points={volPoints} color={C.blue} />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "cardio" && (
        <div style={{ marginTop: 20 }}>
          <Eyebrow>Distance per session</Eyebrow>
          <div style={{ marginTop: 8 }}><Chart points={cardioPoints} color={C.red} /></div>
          <div style={{ marginTop: 16 }}>
            {[...cardioSessions].reverse().map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "baseline", background: C.plate, borderRadius: 2, padding: "10px 12px", marginBottom: 6 }}>
                <span style={{ color: C.chalk, fontSize: 14 }}>
                  {modeLabel(s.mode, getProgram(s.program_id, s.program_version))} · {s.kind === "steady" ? "steady" : "intervals"}
                </span>
                <span style={{ fontFamily: mono, color: C.steel, fontSize: 13 }}>
                  {s.distance ?? "—"} {s.duration ? `· ${s.duration}` : ""} · {fmtDate(s.performed_on)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "log" && (
        <div style={{ marginTop: 20 }}>
          {!doneList.length && <div style={{ color: C.steel, fontSize: 14 }}>No sessions logged yet.</div>}
          {[...doneList].reverse().map((s) => {
            const mine = scored.filter((r) => r.session_id === s.id);
            const volume = Math.round(mine.reduce((a, r) => a + num(r.weight) * int(r.reps), 0));
            const top = mine.reduce((a, r) => (!a || num(r.weight) > num(a.weight) ? r : a), null);
            return (
              <div key={s.id} style={{ background: C.plate, borderLeft: `3px solid ${(getProgram(s.program_id, s.program_version) ? phaseOf(getProgram(s.program_id, s.program_version), s.slot_index).color : C.rack)}`, borderRadius: 2, padding: "12px", marginBottom: 6 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ color: C.chalk, fontSize: 15, fontWeight: 500 }}>
                    {sessionLabel(s)}
                  </span>
                  <span style={{ fontFamily: mono, color: C.steel, fontSize: 12 }}>{fmtDate(s.performed_on)}</span>
                </div>
                <div style={{ color: C.steel, fontSize: 13, marginTop: 3 }}>
                  {s.kind !== "lift"
                    ? `${modeLabel(s.mode, getProgram(s.program_id, s.program_version))} ${s.distance ?? ""} ${s.duration ?? ""}`
                    : top
                    ? `Top set ${top.weight} kg × ${top.reps} · ${volume} kg total`
                    : "No weights entered"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
