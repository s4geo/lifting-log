import React, { useEffect, useState } from "react";
import { C, display, mono } from "../theme";
import { db, localCounts, lastBackupAt, exportAll, noteBackupTaken } from "../db";
import { verifyAgainstServer, syncNow, syncConfigured } from "../sync";
import { Eyebrow } from "../components";
import { todayISO, daysBetween } from "../lib";

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

export default function Status({ back, status, email }) {
  const [counts, setCounts] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [quota, setQuota] = useState(null);
  const [backup, setBackup] = useState(null);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setCounts(await localCounts());
    setBackup(await lastBackupAt());
    try {
      setPersisted(await navigator.storage?.persisted?.());
      const est = await navigator.storage?.estimate?.();
      if (est) setQuota(est);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const verify = async () => {
    setBusy(true);
    await syncNow({ onStatus: () => {} });
    const r = await verifyAgainstServer();
    setCheck(r);
    await load();
    setBusy(false);
  };

  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lifting-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    await noteBackupTaken();
    await load();
  };

  const backupAge = backup ? daysBetween(backup.slice(0, 10), todayISO()) : null;
  const row = (k, v, tone = C.chalk) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.rack}` }}>
      <span style={{ color: C.steel, fontSize: 13 }}>{k}</span>
      <span style={{ color: tone, fontSize: 13, fontFamily: mono, textAlign: "right" }}>{v}</span>
    </div>
  );

  const localOk = counts && counts.pending === 0;
  const serverMatches = check?.ok && counts &&
    check.remote.sessions >= counts.sessions - counts.pending && check.remote.sets >= counts.sets - counts.pending;

  return (
    <div style={{ padding: "0 20px 80px" }}>
      <div style={{ paddingTop: 20 }}>
        <button onClick={back} style={{ color: C.steel, fontSize: 14, background: "none", border: "none", padding: 0 }}>← Back</button>
      </div>
      <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 38, color: C.chalk, textTransform: "uppercase", lineHeight: 1, marginTop: 14 }}>
        Data status
      </h1>

      <div style={{ marginTop: 20, padding: "16px", borderRadius: 2, background: C.plate, borderLeft: `3px solid ${localOk ? C.green : C.yellow}` }}>
        <div style={{ color: C.chalk, fontSize: 15, lineHeight: 1.5 }}>
          {counts === null
            ? "Checking…"
            : counts.pending === 0
            ? email
              ? "Everything on this phone has been backed up to your account."
              : "Everything is saved on this phone. Sign in to back it up off-device."
            : `${counts.pending} change${counts.pending === 1 ? "" : "s"} saved here but not yet backed up. They'll go up on their own when there's signal.`}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Eyebrow>On this phone</Eyebrow>
        <div style={{ marginTop: 8 }}>
          {counts && row("Cycles", counts.cycles)}
          {counts && row("Sessions", counts.sessions)}
          {counts && row("Sets logged", counts.sets)}
          {counts && row("Waiting to back up", counts.pending, counts.pending ? C.yellow : C.green)}
          {row("Last write", fmtTime(status.lastWriteAt))}
          {row("Storage marked permanent", persisted === null ? "—" : persisted ? "Yes" : "No — tap Verify", persisted ? C.green : C.yellow)}
          {quota && row("Space used", `${(quota.usage / 1048576).toFixed(1)} MB of ${(quota.quota / 1048576).toFixed(0)} MB`)}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Eyebrow>Cloud</Eyebrow>
        <div style={{ marginTop: 8 }}>
          {row("Sync configured", syncConfigured() ? "Yes" : "No", syncConfigured() ? C.chalk : C.yellow)}
          {row("Signed in", email || "No", email ? C.chalk : C.yellow)}
          {row("Last sync", fmtTime(status.lastSyncAt))}
          {check && !check.ok && row("Server check", check.reason, C.yellow)}
          {status.lastError && row("Last error", status.lastError, C.red)}
          {check?.ok && row("Server holds", `${check.remote.sessions} sessions · ${check.remote.sets} sets`, serverMatches ? C.green : C.yellow)}
        </div>
        <button
          onClick={verify}
          disabled={busy}
          style={{ width: "100%", marginTop: 12, padding: "14px", borderRadius: 2, border: "none", background: C.chalk, color: C.iron, fontFamily: display, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: "0.08em", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Checking…" : "Sync now & verify"}
        </button>
        <div style={{ color: C.steel, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          Pushes anything outstanding, then asks the server what it actually holds — so "backed up" is checked rather than assumed.
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <Eyebrow color={backupAge === null || backupAge > 14 ? C.yellow : C.steel}>File backup</Eyebrow>
        <div style={{ color: backupAge === null || backupAge > 14 ? C.yellow : C.steel, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          {backup === null
            ? "You haven't downloaded a backup yet. It's the one copy that doesn't depend on anyone's servers."
            : backupAge === 0
            ? "Downloaded today."
            : `Last downloaded ${backupAge} day${backupAge === 1 ? "" : "s"} ago.`}
        </div>
        <button onClick={download} style={{ width: "100%", marginTop: 12, padding: "14px", borderRadius: 2, background: "none", border: `1px solid ${C.rack}`, color: C.chalk, fontSize: 14 }}>
          Download backup file
        </button>
      </div>
    </div>
  );
}
