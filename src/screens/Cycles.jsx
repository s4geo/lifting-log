import React, { useEffect, useState } from "react";
import { C, display, mono } from "../theme";
import { startablePrograms, getProgram, totalSlots, latestVersionOf } from "../programs";
import { db, listCycles, startCycle, endCycle, renameCycle, upgradeCycleVersion } from "../db";
import { Eyebrow } from "../components";
import { fmtDate } from "../lib";

export default function Cycles({ back, onChanged, activeId }) {
  const [cycles, setCycles] = useState([]);
  const [counts, setCounts] = useState({});
  const [starting, setStarting] = useState(null);
  const [name, setName] = useState("");

  const load = async () => {
    const cs = await listCycles();
    cs.sort((a, b) => (b.started_on || "").localeCompare(a.started_on || ""));
    setCycles(cs);
    const sessions = await db.sessions.toArray();
    const c = {};
    sessions.forEach((s) => {
      if (!s.cycle_id) return;
      c[s.cycle_id] = c[s.cycle_id] || { done: 0 };
      if (s.done) c[s.cycle_id].done++;
    });
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  const begin = async () => {
    if (!starting) return;
    await startCycle({ program_id: starting.id, program_version: starting.version, name: name.trim() || `${starting.id}_1` });
    setStarting(null); setName("");
    await load(); onChanged();
  };

  const finish = async (c, status) => {
    const word = status === "completed" ? "Finish" : "Abandon";
    if (!confirm(`${word} "${c.name}"? Unfinished sessions stay as they are — nothing is deleted.`)) return;
    await endCycle(c.id, status);
    await load(); onChanged();
  };

  const link = { color: C.chalk, fontSize: 13, textDecoration: "underline", background: "none", border: "none", padding: 0 };
  const field = { width: "100%", padding: "12px 14px", borderRadius: 2, background: C.plate, color: C.chalk, fontFamily: mono, fontSize: 15, border: "none", marginTop: 8 };

  return (
    <div style={{ padding: "0 20px 80px" }}>
      <div style={{ paddingTop: 24 }}>
        <button onClick={back} style={{ color: C.steel, fontSize: 14, background: "none", border: "none", padding: 0 }}>← Block</button>
      </div>
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 38, color: C.chalk, textTransform: "uppercase", lineHeight: 1, marginTop: 14 }}>
        Cycles
      </h1>
      <p style={{ color: C.steel, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
        A cycle is one run of a programme. Finish one early whenever you like and start the next — the record keeps what you actually did.
      </p>

      <div style={{ marginTop: 28 }}>
        <Eyebrow>Start a new cycle</Eyebrow>
        <div style={{ marginTop: 12 }}>
          {startablePrograms().map((p) => (
            <button
              key={`${p.id}@${p.version}`}
              onClick={() => { setStarting(p); setName(`${p.id.replace(/-/g, "_")}_1`); }}
              style={{
                width: "100%", textAlign: "left", marginBottom: 8, padding: "14px 16px", borderRadius: 2, border: "none",
                background: starting?.id === p.id ? C.rack : C.plate, color: C.chalk,
                boxShadow: starting?.id === p.id ? `inset 0 0 0 1px ${C.chalk}` : "none",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 500 }}>{p.name}</div>
              <div style={{ color: C.steel, fontSize: 12, fontFamily: mono, marginTop: 3 }}>
                {p.id} v{p.version} · {totalSlots(p)} sessions · {p.phases.length} phases
              </div>
            </button>
          ))}
        </div>
        {starting && (
          <div style={{ marginTop: 4 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this cycle" style={field} />
            <div style={{ color: C.steel, fontSize: 12, marginTop: 6 }}>
              Anything you like — arnie_cardio_type1, winter_2026, whatever you'll recognise later.
            </div>
            <button onClick={begin} style={{ marginTop: 12, padding: "12px 20px", borderRadius: 2, border: "none", background: C.chalk, color: C.iron, fontFamily: display, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Start {name || "cycle"}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 32 }}>
        <Eyebrow>Your cycles</Eyebrow>
        <div style={{ marginTop: 12 }}>
          {!cycles.length && <div style={{ color: C.steel, fontSize: 14 }}>None yet.</div>}
          {cycles.map((c) => {
            const p = getProgram(c.program_id, c.program_version);
            const done = counts[c.id]?.done || 0;
            const total = p ? totalSlots(p) : "?";
            const live = c.status === "active";
            const newer = latestVersionOf(c.program_id) > c.program_version;
            return (
              <div key={c.id} style={{ background: C.plate, borderRadius: 2, padding: "14px 16px", marginBottom: 8, borderLeft: `3px solid ${c.id === activeId ? C.chalk : C.rack}` }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ color: C.chalk, fontSize: 16, fontWeight: 500 }}>{c.name}</span>
                  <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: live ? C.green : C.steel }}>
                    {c.status}
                  </span>
                </div>
                <div style={{ color: C.steel, fontSize: 12, fontFamily: mono, marginTop: 4 }}>
                  {p ? p.name : `${c.program_id} v${c.program_version} (retired)`} · {done}/{total} done
                </div>
                <div style={{ color: C.steel, fontSize: 12, marginTop: 2 }}>
                  {c.started_on ? `Started ${fmtDate(c.started_on)}` : "Not started"}
                  {c.ended_on ? ` · ended ${fmtDate(c.ended_on)}` : ""}
                </div>
                <div className="row" style={{ gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                  {live && newer && (
                    <button
                      onClick={async () => {
                        const r = await upgradeCycleVersion(c.id);
                        alert(r.message);
                        await load(); onChanged();
                      }}
                      style={{ ...link, color: C.yellow }}>
                      Update to v{latestVersionOf(c.program_id)}
                    </button>
                  )}
                  {live && <button onClick={() => finish(c, "completed")} style={link}>Finish now</button>}
                  {live && <button onClick={() => finish(c, "abandoned")} style={{ ...link, color: C.steel }}>Abandon</button>}
                  <button
                    onClick={async () => { const n = prompt("Rename cycle", c.name); if (n) { await renameCycle(c.id, n); await load(); onChanged(); } }}
                    style={{ ...link, color: C.steel }}>
                    Rename
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
