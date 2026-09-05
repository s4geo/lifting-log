import { program as arnold6 } from "./arnold6";
import { program as arnold6v1 } from "./arnold6.v1";
import { program as arnoldGym6 } from "./arnoldgym6";
import { program as upperLower } from "./template";

/*
 * Registry of every programme you can start a cycle from.
 * Add a new file, import it here, done.
 *
 * Old programme versions stay listed as long as sessions reference them, so
 * history can always be rendered with the definition it was performed under.
 */
export const PROGRAMS = {
  [`${arnold6.id}@${arnold6.version}`]: arnold6,
  [`${arnold6v1.id}@${arnold6v1.version}`]: arnold6v1,   // kept so v1 history still renders
  [`${arnoldGym6.id}@${arnoldGym6.version}`]: arnoldGym6,
  [`${upperLower.id}@${upperLower.version}`]: upperLower,
};

export const programKey = (id, version) => `${id}@${version}`;
export const getProgram = (id, version) => PROGRAMS[programKey(id, version)] || null;

/* Latest version of each distinct programme — what you can start today. */
/* Is there a newer version of the programme this cycle is running? */
export const latestVersionOf = (id) =>
  Math.max(...Object.values(PROGRAMS).filter((p) => p.id === id).map((p) => p.version));

export const startablePrograms = () => {
  const best = {};
  Object.values(PROGRAMS).forEach((p) => {
    if (!best[p.id] || p.version > best[p.id].version) best[p.id] = p;
  });
  return Object.values(best);
};

export const totalSlots = (p) => p.blocks * p.slots.length;
export const slotAt = (p, i) => p.slots[i % p.slots.length];
export const blockOf = (p, i) => Math.floor(i / p.slots.length) + 1;
export const phaseOf = (p, i) => p.phases.find((ph) => i >= ph.from && i <= ph.to) || p.phases[p.phases.length - 1];
export const phaseIdx = (p, i) => Math.max(0, p.phases.indexOf(phaseOf(p, i)));

export function groupsFor(day) {
  const out = [];
  day.ex.forEach((x, xi) => {
    const last = out[out.length - 1];
    if (x.pair && last && last.pair === x.pair) last.items.push({ x, xi });
    else out.push({ pair: x.pair, items: [{ x, xi }] });
  });
  return out;
}

/*
 * Global exercise catalogue, assembled from every registered programme.
 * This is what lets a back squat logged under one programme sit on the same
 * trend line as one logged under another.
 */
export const EXERCISES = (() => {
  const out = {};
  Object.values(PROGRAMS).forEach((p) =>
    Object.values(p.sessions).forEach((d) => d.ex.forEach((x) => { out[x.id] = { id: x.id, name: x.name }; }))
  );
  return out;
})();

export const exerciseName = (id) => EXERCISES[id]?.name || id;

/* Labels for HISTORICAL rows, which may reference a programme you've moved on from. */
export function sessionLabel(session, program) {
  if (!session) return "Session";
  if (session.kind === "steady") return "Steady run";
  if (session.kind === "intervals") return "Intervals";
  const p = program || getProgram(session.program_id, session.program_version);
  const day = p?.sessions?.[session.session_key];
  if (!day) return session.session_key ? `${session.session_key} · retired session` : "Lift";
  return `${session.session_key} · ${day.title}`;
}

export function modeLabel(mode, program) {
  const p = program;
  return p?.modes?.[mode]?.label || (mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : "Cardio");
}
