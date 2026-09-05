import { createClient } from "@supabase/supabase-js";
import { db, getMeta, setMeta } from "./db";
import { noteSync, noteAuth } from "./status";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true } }) : null;
export const syncConfigured = () => Boolean(supabase);

const strip = (row) => {
  const { dirty, ...rest } = row;
  return rest;
};

/*
 * A session whose cycle no longer exists can never be displayed, but it will
 * fail the foreign key on push and take the whole batch down with it — so one
 * stale row blocks every future sync. Clear them out first.
 */
async function dropOrphans() {
  const cycleIds = new Set((await db.cycles.toArray()).map((c) => c.id));
  const sessions = await db.sessions.toArray();
  const orphanSessions = sessions.filter((s) => !s.cycle_id || !cycleIds.has(s.cycle_id));
  if (!orphanSessions.length) return;

  const ids = new Set(orphanSessions.map((s) => s.id));
  const sets = await db.sets.toArray();
  await db.transaction("rw", db.sessions, db.sets, async () => {
    await db.sets.bulkDelete(sets.filter((x) => ids.has(x.session_id)).map((x) => x.id));
    await db.sessions.bulkDelete([...ids]);
  });
  console.warn(`Dropped ${orphanSessions.length} orphaned session(s) with no cycle.`);
}

/*
 * Two devices that both create a session for the same slot while offline will
 * generate different row ids for it. The database rejects the second one
 * (unique on cycle + slot), and without this step that rejection
 * would stall every future sync. So before pushing, adopt the server's id for
 * any slot it already knows about.
 */
async function reconcileSlots() {
  const { data, error } = await supabase.from("sessions").select("id,cycle_id,slot_index");
  if (error) throw error;

  const remote = new Map((data || []).map((r) => [`${r.cycle_id}|${r.slot_index}`, r.id]));
  const locals = await db.sessions.toArray();

  for (const l of locals) {
    const remoteId = remote.get(`${l.cycle_id}|${l.slot_index}`);
    if (!remoteId || remoteId === l.id) continue;

    await db.transaction("rw", db.sessions, db.sets, async () => {
      const mine = await db.sets.where("session_id").equals(l.id).toArray();
      for (const st of mine) {
        const clash = await db.sets
          .where("[session_id+exercise_id+set_no]")
          .equals([remoteId, st.exercise_id, st.set_no])
          .first();
        if (clash) await db.sets.delete(st.id);            // the adopted row already has this set
        else await db.sets.update(st.id, { session_id: remoteId, dirty: 1 });
      }
      await db.sessions.delete(l.id);
      await db.sessions.put({ ...l, id: remoteId, dirty: 1 });
    });
  }
}

/*
 * Push then pull. Last-write-wins on updated_at.
 * One person with one phone means real conflicts are vanishingly rare,
 * and the local outbox means the loser of one is still on the device.
 */
export async function syncNow({ onStatus = () => {} } = {}) {
  if (!supabase) return { skipped: "not configured" };
  const { data: auth } = await supabase.auth.getSession();
  noteAuth(Boolean(auth?.session));
  if (!auth?.session) { noteSync("local"); return { skipped: "signed out" }; }
  if (!navigator.onLine) { noteSync("offline"); return { skipped: "offline" }; }

  onStatus("syncing");
  noteSync("syncing");
  try {
    await dropOrphans();
    await reconcileSlots();

    // ---- push ----
    const dirtyCycles = await db.cycles.where("dirty").equals(1).toArray();
    const dirtySessions = await db.sessions.where("dirty").equals(1).toArray();
    const dirtySets = await db.sets.where("dirty").equals(1).toArray();

    if (dirtyCycles.length) {
      const { error } = await supabase.from("cycles").upsert(dirtyCycles.map(strip), { onConflict: "id" });
      if (error) throw error;
      await db.cycles.bulkPut(dirtyCycles.map((r) => ({ ...r, dirty: 0 })));
    }
    if (dirtySessions.length) {
      const { error } = await supabase.from("sessions").upsert(dirtySessions.map(strip), { onConflict: "id" });
      if (error) throw error;
      await db.sessions.bulkPut(dirtySessions.map((r) => ({ ...r, dirty: 0 })));
    }
    if (dirtySets.length) {
      const { error } = await supabase.from("sets").upsert(dirtySets.map(strip), { onConflict: "id" });
      if (error) throw error;
      await db.sets.bulkPut(dirtySets.map((r) => ({ ...r, dirty: 0 })));
    }

    // ---- pull ----
    const cursor = (await getMeta("sync_cursor")) || "1970-01-01T00:00:00Z";
    const [rc, rs, rx] = await Promise.all([
      supabase.from("cycles").select("*").gt("updated_at", cursor),
      supabase.from("sessions").select("*").gt("updated_at", cursor),
      supabase.from("sets").select("*").gt("updated_at", cursor),
    ]);
    if (rc.error) throw rc.error;
    if (rs.error) throw rs.error;
    if (rx.error) throw rx.error;

    let newest = cursor;
    const merge = async (table, rows) => {
      for (const remote of rows) {
        if (remote.updated_at > newest) newest = remote.updated_at;
        const local = await table.get(remote.id);
        if (!local || remote.updated_at > local.updated_at) {
          await table.put({ ...remote, dirty: 0 });
        }
      }
    };
    await merge(db.cycles, rc.data || []);
    await merge(db.sessions, rs.data || []);
    await merge(db.sets, rx.data || []);
    await setMeta("sync_cursor", newest);

    const pending =
      (await db.cycles.where("dirty").equals(1).count()) +
      (await db.sessions.where("dirty").equals(1).count()) +
      (await db.sets.where("dirty").equals(1).count());
    onStatus(pending ? "pending" : "synced");
    noteSync(pending ? "pending" : "synced", pending);
    return {
      pushed: dirtyCycles.length + dirtySessions.length + dirtySets.length,
      pulled: (rc.data?.length || 0) + (rs.data?.length || 0) + (rx.data?.length || 0),
    };
  } catch (e) {
    console.error("sync failed", e);
    onStatus("error");
    noteSync("error", undefined, e.message || String(e));
    return { error: e.message };
  }
}

export async function pendingCount() {
  return (
    (await db.cycles.where("dirty").equals(1).count()) +
    (await db.sessions.where("dirty").equals(1).count()) +
    (await db.sets.where("dirty").equals(1).count())
  );
}

/* Ask the server what it actually holds, so "synced" can be checked rather
   than trusted. */
export async function verifyAgainstServer() {
  if (!supabase) return { ok: false, reason: "Cloud sync isn't configured." };
  const { data: auth } = await supabase.auth.getSession();
  if (!auth?.session) return { ok: false, reason: "Not signed in — your data is on this phone only." };
  if (!navigator.onLine) return { ok: false, reason: "Offline — can't reach the server right now." };

  const count = async (table) => {
    const { count: n, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    if (error) throw error;
    return n || 0;
  };
  try {
    const [cycles, sessions, sets] = await Promise.all([count("cycles"), count("sessions"), count("sets")]);
    return { ok: true, remote: { cycles, sessions, sets } };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export function startAutoSync(onStatus) {
  if (!supabase) return () => {};
  const run = () => syncNow({ onStatus });
  const onVis = () => document.visibilityState === "visible" && run();
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", onVis);
  const iv = setInterval(run, 60000);
  run();
  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVis);
    clearInterval(iv);
  };
}
