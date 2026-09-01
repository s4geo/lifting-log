import Dexie from "dexie";
import { noteWrite } from "./status";
import { getProgram, slotAt, blockOf, phaseOf, totalSlots, latestVersionOf } from "./programs";

/*
 * IndexedDB is the source of truth. Every write lands here first and always
 * succeeds, signal or no signal. Sync is a background job.
 */
export const db = new Dexie("lifting");

/* v1 shipped without cycles. v2 adds them and adopts existing sessions into a
   backfilled cycle — additively. An upgrade must never delete a row. */
db.version(1).stores({
  sessions: "id, slot_index, performed_on, updated_at, dirty",
  sets: "id, session_id, exercise_id, updated_at, dirty, [session_id+exercise_id+set_no]",
  meta: "key",
});

db.version(2)
  .stores({
    cycles: "id, status, started_on, updated_at, dirty",
    sessions: "id, cycle_id, slot_index, performed_on, updated_at, dirty, [cycle_id+slot_index]",
    sets: "id, session_id, exercise_id, updated_at, dirty, [session_id+exercise_id+set_no]",
    meta: "key",
  })
  .upgrade(async (tx) => {
    const sessions = await tx.table("sessions").toArray();
    const orphans = sessions.filter((s) => !s.cycle_id);
    if (!orphans.length) return;
    const groups = {};
    orphans.forEach((s) => {
      const k = `${s.program_id}@${s.program_version}`;
      (groups[k] = groups[k] || []).push(s);
    });
    for (const [k, rows] of Object.entries(groups)) {
      const [program_id, program_version] = k.split("@");
      const id = crypto.randomUUID();
      const dates = rows.map((r) => r.performed_on).filter(Boolean).sort();
      await tx.table("cycles").put({
        id, program_id, program_version: Number(program_version),
        name: `${program_id}_1`, status: "active",
        started_on: dates[0] || null, ended_on: null, notes: null,
        updated_at: new Date().toISOString(), dirty: 1,
      });
      for (const r of rows) await tx.table("sessions").update(r.id, { cycle_id: id, dirty: 1 });
    }
  });

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => db.meta.put({ key, value });

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {}
  return false;
}

/* ------------------------------- cycles -------------------------------- */

export const listCycles = () => db.cycles.toArray();

export async function activeCycle() {
  const all = await db.cycles.toArray();
  const live = all.filter((c) => c.status === "active");
  live.sort((a, b) => (b.started_on || "").localeCompare(a.started_on || ""));
  return live[0] || null;
}

export async function startCycle({ program_id, program_version, name }) {
  const row = {
    id: uid(), program_id, program_version,
    name: name || `${program_id}_1`,
    status: "active",
    started_on: new Date().toISOString().slice(0, 10),
    ended_on: null, notes: null,
    updated_at: now(), dirty: 1,
  };
  await db.cycles.put(row);
  noteWrite();
  return row;
}

/* Finishing early is a first-class action, not an edge case. Unfinished
   sessions stay as they are — the record shows what you actually did. */
export async function endCycle(id, status = "completed") {
  await db.cycles.update(id, {
    status,
    ended_on: new Date().toISOString().slice(0, 10),
    updated_at: now(), dirty: 1,
  });
}

/*
 * Move a running cycle onto a newer version of its programme.
 *
 * Sessions you've already done keep the version they were performed under —
 * they record what actually happened, and rewriting that would be a lie.
 * Only the sessions still ahead of you are re-pointed.
 *
 * Refused if the new version has a different shape, because slot_index would
 * then mean something different and your remaining sessions would be
 * silently reassigned to the wrong workouts. Finish the cycle and start a new
 * one instead.
 */
export async function upgradeCycleVersion(cycleId) {
  const cycle = await db.cycles.get(cycleId);
  if (!cycle) throw new Error("no such cycle");

  const target = latestVersionOf(cycle.program_id);
  if (target <= cycle.program_version) return { changed: 0, message: "Already on the latest version." };

  const from = getProgram(cycle.program_id, cycle.program_version);
  const to = getProgram(cycle.program_id, target);
  if (!from || !to) throw new Error("definition not loaded");
  if (from.slots.length !== to.slots.length || from.blocks !== to.blocks) {
    return { changed: 0, message: `v${target} has a different block shape. Finish this cycle and start a new one instead.` };
  }

  const sessions = await db.sessions.where("cycle_id").equals(cycleId).toArray();
  const ahead = sessions.filter((x) => !x.done);
  await db.transaction("rw", db.cycles, db.sessions, async () => {
    for (const x of ahead) {
      const slot = slotAt(to, x.slot_index);
      await db.sessions.update(x.id, {
        program_version: target,
        phase: phaseOf(to, x.slot_index).id,
        block_no: blockOf(to, x.slot_index),
        kind: slot.kind === "lift" ? "lift" : slot.kind,
        session_key: slot.kind === "lift" ? slot.key : null,
        updated_at: now(), dirty: 1,
      });
    }
    await db.cycles.update(cycleId, { program_version: target, updated_at: now(), dirty: 1 });
  });

  const kept = sessions.length - ahead.length;
  return {
    changed: ahead.length,
    message: `Moved to v${target}. ${ahead.length} upcoming session${ahead.length === 1 ? "" : "s"} updated` +
             (kept ? `, ${kept} already logged left on v${cycle.program_version}.` : "."),
  };
}

export async function renameCycle(id, name) {
  await db.cycles.update(id, { name, updated_at: now(), dirty: 1 });
}

export async function cycleProgress(cycle) {
  const program = getProgram(cycle.program_id, cycle.program_version);
  const sessions = await db.sessions.where("cycle_id").equals(cycle.id).toArray();
  const done = sessions.filter((s) => s.done).length;
  return { done, total: program ? totalSlots(program) : sessions.length, sessions };
}

/* ------------------------------ sessions ------------------------------- */

export async function sessionForSlot(cycle, slotIndex) {
  const found = await db.sessions.where("[cycle_id+slot_index]").equals([cycle.id, slotIndex]).first();
  if (found) return found;

  const program = getProgram(cycle.program_id, cycle.program_version);
  const s = slotAt(program, slotIndex);
  const row = {
    id: uid(),
    cycle_id: cycle.id,
    program_id: cycle.program_id,
    program_version: cycle.program_version,
    slot_index: slotIndex,
    block_no: blockOf(program, slotIndex),
    phase: phaseOf(program, slotIndex).id,
    kind: s.kind === "lift" ? "lift" : s.kind,
    session_key: s.kind === "lift" ? s.key : null,
    performed_on: null,
    done: false,
    mode: null, distance: null, duration: null, notes: null,
    updated_at: now(), dirty: 1,
  };
  await db.sessions.put(row);
  noteWrite();
  return row;
}

export async function patchSession(id, patch) {
  await db.sessions.update(id, { ...patch, updated_at: now(), dirty: 1 });
  noteWrite();
}

export async function putSet(sessionId, exerciseId, setNo, patch) {
  const existing = await db.sets
    .where("[session_id+exercise_id+set_no]")
    .equals([sessionId, exerciseId, setNo])
    .first();
  if (existing) {
    await db.sets.update(existing.id, { ...patch, updated_at: now(), dirty: 1 });
    noteWrite();
    return existing.id;
  }
  const row = {
    id: uid(), session_id: sessionId, exercise_id: exerciseId, set_no: setNo,
    weight: null, weight_unit: "kg", reps: null, done: false,
    ...patch, updated_at: now(), dirty: 1,
  };
  await db.sets.put(row);
  noteWrite();
  return row.id;
}

export const setsForSession = (sessionId) => db.sets.where("session_id").equals(sessionId).toArray();

/* --------------------------- backup / restore -------------------------- */

export const noteBackupTaken = () => setMeta("last_backup_at", new Date().toISOString());
export const lastBackupAt = () => getMeta("last_backup_at", null);

/* Counts straight from IndexedDB — the honest local picture. */
export async function localCounts() {
  const [cycles, sessions, sets] = await Promise.all([db.cycles.count(), db.sessions.count(), db.sets.count()]);
  const pending =
    (await db.cycles.where("dirty").equals(1).count()) +
    (await db.sessions.where("dirty").equals(1).count()) +
    (await db.sets.where("dirty").equals(1).count());
  return { cycles, sessions, sets, pending };
}

export async function exportAll() {
  const [cycles, sessions, sets] = await Promise.all([db.cycles.toArray(), db.sessions.toArray(), db.sets.toArray()]);
  return { version: 2, exported_at: now(), cycles, sessions, sets };
}

export async function importAll(payload) {
  if (!payload || !Array.isArray(payload.sessions)) throw new Error("bad payload");
  await db.transaction("rw", db.cycles, db.sessions, db.sets, async () => {
    if (Array.isArray(payload.cycles)) await db.cycles.bulkPut(payload.cycles.map((c) => ({ ...c, dirty: 1 })));
    await db.sessions.bulkPut(payload.sessions.map((s) => ({ ...s, dirty: 1 })));
    await db.sets.bulkPut((payload.sets || []).map((s) => ({ ...s, dirty: 1 })));
  });
}

export async function wipe() {
  await db.transaction("rw", db.cycles, db.sessions, db.sets, db.meta, async () => {
    await db.cycles.clear();
    await db.sessions.clear();
    await db.sets.clear();
    await db.meta.delete("sync_cursor");
  });
}
