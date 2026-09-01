import React, { useCallback, useEffect, useState } from "react";
import { C, display, mono } from "./theme";
import { getProgram, slotAt, totalSlots } from "./programs";
import { db, sessionForSlot, requestPersistence, activeCycle, startCycle } from "./db";
import { supabase, syncConfigured, startAutoSync, pendingCount, syncNow } from "./sync";
import { subscribe as subscribeStatus, noteAuth, notePending } from "./status";
import { StatusBar } from "./components";
import Home from "./screens/Home";
import Lift from "./screens/Lift";
import Cardio from "./screens/Cardio";
import Progress from "./screens/Progress";
import Cycles from "./screens/Cycles";
import Status from "./screens/Status";

export default function App() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [view, setView] = useState({ name: "home" });
  const [syncStatus, setSyncStatus] = useState(syncConfigured() ? "local" : "local");
  const [pending, setPending] = useState(0);
  const [email, setEmail] = useState(null);
  const [status, setStatus] = useState({ sync: "local", pending: 0, lastWriteAt: null, lastSyncAt: null, signedIn: false });

  useEffect(() => subscribeStatus(setStatus), []);

  const reload = useCallback(async () => {
    let c = await activeCycle();
    // First run: nobody has started anything, so open the default programme.
    if (!c) c = await startCycle({ program_id: "arnold-6day", program_version: 1, name: "arnold_6day_1" });
    setCycle(c);
    setSessions(await db.sessions.where("cycle_id").equals(c.id).toArray());
    const p = await pendingCount();
    setPending(p);
    notePending(p);
  }, []);

  useEffect(() => {
    (async () => {
      await requestPersistence();
      await reload();
      setReady(true);
    })();
  }, [reload]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data?.session?.user?.email || null);
      noteAuth(Boolean(data?.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email || null);
      noteAuth(Boolean(s));
      if (s) syncNow({ onStatus: setSyncStatus }).then(reload);
    });
    return () => sub?.subscription?.unsubscribe();
  }, [reload]);

  useEffect(() => {
    if (!supabase) return;
    const stop = startAutoSync(async (s) => {
      setSyncStatus(s);
      if (s === "synced" || s === "pending") await reload();
    });
    return stop;
  }, [reload]);

  const openSlot = async (i) => {
    const s = await sessionForSlot(cycle, i);
    setView({ name: "session", session: s });
  };

  const back = async () => {
    await reload();
    if (supabase) syncNow({ onStatus: setSyncStatus });
    setView({ name: "home" });
  };

    const signIn = async () => {
    if (!supabase) return alert("Supabase keys aren't set in this build.");
    const addr = prompt("Email address:");
    if (!addr) return;
    const email = addr.trim();

    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      const wait = /rate limit|too many/i.test(error.message)
        ? "\n\nSupabase allows 2 auth emails an hour on the free tier. Try again on the hour."
        : "";
      return alert(`Couldn't send it: ${error.message}${wait}`);
    }

    const pasted = prompt(
      "Check your email.\n\n" +
      "Either type the 6-digit code, or long-press the button in the email, " +
      "Copy Link, and paste the whole thing here:"
    );
    if (!pasted) return;

    // Accept a bare 6-digit code, or dig the token out of a pasted magic link.
    const raw = pasted.trim();
    const match =
      raw.match(/^\d{6}$/) ||
      raw.match(/[?&#](?:token|otp)=([^&#\s]+)/) ||
      raw.match(/\b(\d{6})\b/);
    if (!match) return alert("Couldn't find a code or token in that.");
    const token = match[1] || match[0];

    // A pasted link carries a token_hash; a typed code is an OTP. Try both.
    let signedIn = false;
    let lastError = null;
    for (const attempt of [
      () => supabase.auth.verifyOtp({ email, token, type: "email" }),
      () => supabase.auth.verifyOtp({ token_hash: token, type: "email" }),
      () => supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" }),
    ]) {
      const { error: e } = await attempt();
      if (!e) { signedIn = true; break; }
      lastError = e;
    }

    alert(signedIn ? "Signed in." : `Rejected: ${lastError?.message || "unknown error"}`);
  };

  const program = cycle ? getProgram(cycle.program_id, cycle.program_version) : null;
  const total = program ? totalSlots(program) : 0;

  const cursor = (() => {
    const byIndex = Object.fromEntries(sessions.map((s) => [s.slot_index, s]));
    for (let i = 0; i < total; i++) if (!byIndex[i]?.done) return i;
    return Math.max(0, total - 1);
  })();

  if (!ready) return <div style={{ padding: 24, color: C.steel }}>Loading…</div>;
  if (!program)
    return (
      <div style={{ background: C.iron, minHeight: "100vh", padding: 24, color: C.chalk, fontFamily: "'Barlow', system-ui, sans-serif" }}>
        <p style={{ color: C.steel, lineHeight: 1.5 }}>
          This cycle runs <strong style={{ color: C.chalk }}>{cycle?.program_id} v{cycle?.program_version}</strong>, which isn't in
          this build. Your data is safe — the definition just isn't loaded.
        </p>
        <button onClick={() => setView({ name: "cycles" })} style={{ marginTop: 16, padding: "12px 20px", borderRadius: 2, border: "none", background: C.chalk, color: C.iron, fontWeight: 600 }}>
          Open cycles
        </button>
      </div>
    );

  return (
    <div style={{ background: C.iron, minHeight: "100vh", fontFamily: "'Barlow', system-ui, sans-serif", paddingTop: "env(safe-area-inset-top)" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {view.name !== "status" && (
          <StatusBar status={status} onOpen={() => setView({ name: "status" })} />
        )}
        {view.name === "home" && (
          <Home
            program={program}
            cycle={cycle}
            sessions={sessions}
            cursor={cursor}
            go={openSlot}
            openProgress={() => setView({ name: "progress" })}
            openCycles={() => setView({ name: "cycles" })}
            openStatus={() => setView({ name: "status" })}
            syncStatus={navigator.onLine ? syncStatus : "offline"}
            pending={pending}
            onSignIn={signIn}
            email={email}
            onReload={reload}
          />
        )}
        {view.name === "progress" && <Progress back={back} cycle={cycle} />}
        {view.name === "cycles" && <Cycles back={back} activeId={cycle?.id} onChanged={reload} />}
        {view.name === "status" && <Status back={back} status={status} email={email} />}
        {view.name === "session" &&
          (slotAt(program, view.session.slot_index).kind === "lift"
            ? <Lift program={program} session={view.session} back={back} />
            : <Cardio program={program} session={view.session} back={back} />)}
      </div>
    </div>
  );
}
