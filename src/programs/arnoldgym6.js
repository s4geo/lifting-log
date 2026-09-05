/*
 * Arnold double split, six lifting sessions, no cardio slots.
 *
 * Each muscle group is hit twice per rotation: a heavy session and a volume
 * session with different angles and rep ranges. Rest isn't a slot — the block
 * is rolling, so rest is whatever days you don't train.
 *
 * Exercise ids are shared with arnold-6day, so every trend continues.
 */

const ex = (id, name, sets, reps, rest, pair = null, opts = {}) => ({ id, name, sets, reps, rest, pair, ...opts });

export const program = {
  id: "arnold-gym-6",
  version: 1,
  name: "Arnold double split, six day",
  blocks: 9,

  slots: [
    { kind: "lift", key: "A" },   // chest + back, heavy
    { kind: "lift", key: "B" },   // shoulders + arms, heavy
    { kind: "lift", key: "C" },   // legs, heavy
    { kind: "lift", key: "D" },   // chest + back, volume
    { kind: "lift", key: "E" },   // shoulders + arms, volume
    { kind: "lift", key: "F" },   // legs, volume
  ],

  phases: [
    { id: "base", name: "Base", color: "#2F6BB0", kg: "20", from: 0, to: 17,
      note: "Straight sets, no intensity tricks. Hit the top of every rep range on every set before you add load." },
    { id: "load", name: "Load", color: "#E5A912", kg: "15", from: 18, to: 35,
      note: "Opening lifts go heavier and drop to 6-8. Drop sets come in on one nominated move per session." },
    { id: "peak", name: "Peak", color: "#C93A2B", kg: "25", from: 36, to: 53,
      note: "Reps back up, drop sets stay, and the opening compound gets rest-pause. You should finish this ready for a week off." },
  ],

  tech: {
    drop: {
      label: "Drop set", when: "Final set only",
      steps: [
        "Take the last set to the point where the next rep would stall.",
        "Strip 25-30% in under 10 seconds. On dumbbells, grab the next pair down.",
        "Go again to that same stall point. Expect roughly half the reps.",
        "Blocks 4-5: one drop. Block 6 onward: two drops.",
      ],
    },
    rp: {
      label: "Rest-pause", when: "Final set only",
      steps: [
        "Take the last set to one rep short of failure, then rack it.",
        "Stand and breathe for 15 seconds. About five slow breaths.",
        "Same weight, go again. Rack, 15 seconds, one more mini-set.",
        "Expect roughly 8 / 4 / 2. If set two beats half of set one, add load next time.",
        "Machine, spotter, or safety pins.",
      ],
    },
  },

  sessions: {
    A: {
      letter: "A", title: "Chest + Back", sub: "Heavy, every move paired",
      ex: [
        ex("incline-barbell-press", "Incline dumbbell press", 4, "8-10", 90, 1, { loadReps: "6-8", tech: "rp" }),
        ex("wide-grip-pulldown", "Wide-grip pull-up / pulldown", 4, "8-10", 90, 1),
        ex("weighted-dips", "Weighted dips", 4, "8-12", 75, 2),
        ex("barbell-row", "Barbell row", 4, "8-10", 75, 2),
        ex("smith-wide-press", "Wide-grip Smith press", 3, "10-12", 75, 3),
        ex("seated-cable-row", "Seated cable row", 3, "10-12", 75, 3),
        ex("cable-fly", "Cable fly", 3, "12-15", 60, 4, { tech: "drop" }),
        ex("straight-arm-pulldown", "Straight-arm pulldown", 3, "12-15", 60, 4),
      ],
    },
    B: {
      letter: "B", title: "Shoulders + Arms", sub: "Heavy, delts first",
      ex: [
        ex("arnold-press", "Arnold press", 4, "8-10", 90, 1, { loadReps: "6-8", tech: "rp" }),
        ex("face-pull", "Face pull", 4, "15", 90, 1),
        ex("lateral-raise", "Lateral raise", 4, "12-15", 60, 2, { tech: "drop" }),
        ex("rear-delt-fly", "Rear delt fly", 4, "12-15", 60, 2),
        ex("barbell-curl", "Barbell curl", 4, "8-10", 75, 3),
        ex("close-grip-bench", "Close-grip Smith press", 4, "8-10", 75, 3),
        ex("incline-db-curl", "Incline dumbbell curl", 3, "10-12", 60, 4),
        ex("rope-pushdown", "Rope pushdown", 3, "10-12", 60, 4),
        ex("hammer-curl", "Hammer curl", 3, "12", 60, 5),
        ex("overhead-cable-ext", "Overhead cable extension", 3, "12", 60, 5),
      ],
    },
    C: {
      letter: "C", title: "Legs", sub: "Heavy, squat first",
      ex: [
        ex("back-squat", "Back squat", 5, "6-8", 150, null, { loadReps: "5-6" }),
        ex("romanian-deadlift", "Romanian deadlift", 4, "8-10", 105, 1),
        ex("hanging-knee-raise", "Hanging knee raise", 4, "12-15", 105, 1),
        ex("leg-press", "Leg press", 3, "12-15", 90, null, { tech: "rp" }),
        ex("lying-leg-curl", "Lying leg curl", 3, "12", 60, 2),
        ex("leg-extension", "Leg extension", 3, "15", 60, 2, { tech: "drop" }),
        ex("standing-calf-raise", "Standing calf raise", 4, "15-20", 45, 3),
        ex("cable-crunch", "Cable crunch", 4, "15", 45, 3),
      ],
    },
    D: {
      letter: "D", title: "Chest + Back", sub: "Volume, new angles",
      ex: [
        ex("flat-db-press", "Flat dumbbell press", 4, "10-12", 90, 1, { loadReps: "8-10", tech: "rp" }),
        ex("chest-supported-row", "Chest-supported row", 4, "10-12", 90, 1),
        ex("incline-db-fly", "Incline dumbbell fly", 3, "12-15", 60, 2),
        ex("single-arm-pulldown", "Single-arm lat pulldown", 3, "12 / side", 60, 2),
        ex("db-pullover", "Dumbbell pullover", 3, "12-15", 60, 3),
        ex("face-pull", "Face pull", 3, "15-20", 60, 3),
        ex("flat-db-fly", "Flat dumbbell fly", 3, "12-15", 60, 4, { tech: "drop" }),
        ex("seated-cable-row", "Seated cable row", 3, "12-15", 60, 4),
        ex("cable-crunch", "Cable crunch", 3, "15", 45),
      ],
    },
    E: {
      letter: "E", title: "Shoulders + Arms", sub: "Volume, higher reps",
      ex: [
        ex("seated-db-press", "Seated dumbbell press", 4, "10-12", 75, 1, { loadReps: "8-10" }),
        ex("cable-upright-row", "Cable upright row", 4, "12-15", 75, 1),
        ex("lateral-raise", "Lateral raise", 4, "15-20", 45, 2, { tech: "drop" }),
        ex("rear-delt-fly", "Rear delt fly", 4, "15-20", 45, 2),
        ex("ez-curl", "EZ-bar curl", 3, "10-12", 60, 3),
        ex("triceps-pushdown", "Triceps pushdown", 3, "12-15", 60, 3),
        ex("hammer-curl", "Hammer curl", 3, "12-15", 60, 4),
        ex("overhead-cable-ext", "Overhead cable extension", 3, "12-15", 60, 4),
      ],
    },
    F: {
      letter: "F", title: "Legs", sub: "Volume, posterior emphasis",
      ex: [
        ex("leg-press", "Leg press", 4, "12-15", 105, null, { loadReps: "10-12", tech: "rp" }),
        ex("hip-thrust", "Barbell hip thrust", 4, "10-12", 90, 1),
        ex("bulgarian-split-squat", "Bulgarian split squat", 3, "10-12 / side", 90, 1),
        ex("lying-leg-curl", "Lying leg curl", 4, "12-15", 60, 2, { tech: "drop" }),
        ex("leg-extension", "Leg extension", 4, "15-20", 60, 2),
        ex("seated-calf-raise", "Seated calf raise", 4, "15-20", 45, 3),
        ex("hanging-knee-raise", "Hanging knee raise", 4, "15", 45, 3),
      ],
    },
  },

  modes: {},   // no cardio slots in this block
};

export default program;
