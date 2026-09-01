/*
 * Converts the clipboard export from the old artifact into a backup file
 * this app can restore.
 *
 *   node scripts/import-old-export.mjs old-export.tsv > backup.json
 *
 * Handles the dated and undated export formats, tabs or commas.
 * Old exports carry exercise NAMES; this maps them onto the permanent ids.
 */
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/programs/arnold6.js"), "utf8");
const mod = await import("data:text/javascript," + encodeURIComponent(src.replace(/^export default .*$/m, "").replace(/\bexport\s+/g, "")) + "\nexport { program };");
const p = mod.program;
const { id: PROGRAM_ID, version: PROGRAM_VERSION, slots: BLOCK, phases: PHASES, sessions: LIFTS } = p;
const CYCLE_ID = randomUUID();

const nameToId = {};
Object.values(LIFTS).forEach((d) => d.ex.forEach((x) => { nameToId[x.name.toLowerCase()] = x.id; }));

const kindFor = (i) => BLOCK[i % BLOCK.length].kind;
const keyFor = (i) => BLOCK[i % BLOCK.length].key || null;
const phaseFor = (i) => (PHASES.find((ph) => i >= ph.from && i <= ph.to) || PHASES[PHASES.length - 1]).id;
const now = new Date().toISOString();

const text = readFileSync(process.argv[2], "utf8");
const sessions = new Map();
const sets = [];
const unmatched = new Set();

for (const line of text.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
  const n = parseInt(cells[0], 10);
  if (!n || n < 1 || n > 54) continue;                       // skips the header row
  const slot = n - 1;
  let rest = cells.slice(1);
  let date = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(rest[0] || "")) { date = rest[0].slice(0, 10); rest = rest.slice(1); }
  const type = rest[0];

  if (!sessions.has(slot)) {
    sessions.set(slot, {
      id: randomUUID(),
      cycle_id: CYCLE_ID,
      program_id: PROGRAM_ID, program_version: PROGRAM_VERSION,
      slot_index: slot, block_no: Math.floor(slot / BLOCK.length) + 1,
      phase: phaseFor(slot), kind: kindFor(slot), session_key: keyFor(slot),
      performed_on: date, done: true,
      mode: null, distance: null, duration: null, notes: null, updated_at: now,
    });
  }
  const s = sessions.get(slot);
  if (date && !s.performed_on) s.performed_on = date;

  if (type === "steady" || type === "intervals") {
    s.mode = rest[1] || null;
    s.distance = rest[2] ? Number(rest[2]) : null;
    s.duration = rest[3] || null;
    continue;
  }
  if (!LIFTS[type]) continue;

  const exercise_id = nameToId[(rest[1] || "").toLowerCase()];
  if (!exercise_id) { unmatched.add(rest[1]); continue; }

  sets.push({
    id: randomUUID(), session_id: s.id, exercise_id,
    set_no: parseInt(rest[2], 10),
    weight: rest[3] ? Number(rest[3]) : null,
    weight_unit: "kg",
    reps: rest[4] ? parseInt(rest[4], 10) : null,
    done: true, updated_at: now,
  });
}

if (unmatched.size) console.error("Unmatched exercises (skipped):", [...unmatched].join(", "));
console.error(`Sessions: ${sessions.size}  Sets: ${sets.length}`);
const dates = [...sessions.values()].map((s) => s.performed_on).filter(Boolean).sort();
const cycle = {
  id: CYCLE_ID, program_id: PROGRAM_ID, program_version: PROGRAM_VERSION,
  name: "arnold_6day_1", status: "active",
  started_on: dates[0] || null, ended_on: null, notes: "Imported from the original tracker",
  updated_at: now,
};
process.stdout.write(JSON.stringify({ version: 2, exported_at: now, cycles: [cycle], sessions: [...sessions.values()], sets }, null, 2));
