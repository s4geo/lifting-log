/*
 * Starter template for a new programme.
 *
 * Copy this file, give it a new `id`, fill in your own sessions, then register
 * it in index.js. Whatever you're running next — a Stoppani block, an
 * upper/lower, your own thing — the shape is the same.
 *
 * Reuse an exercise `id` from another programme and its history carries over
 * automatically: a back squat is a back squat regardless of which block you
 * were running when you did it. That's the whole point of stable ids.
 */

const ex = (id, name, sets, reps, rest, pair = null, opts = {}) => ({ id, name, sets, reps, rest, pair, ...opts });

export const program = {
  id: "upper-lower-4day",
  version: 1,
  name: "Upper / lower, four day",
  blocks: 8,

  slots: [
    { kind: "lift", key: "U1" },
    { kind: "lift", key: "L1" },
    { kind: "steady" },
    { kind: "lift", key: "U2" },
    { kind: "lift", key: "L2" },
  ],

  phases: [
    { id: "accumulate", name: "Accumulate", color: "#2F6BB0", kg: "20", from: 0,  to: 19,
      note: "Build volume. Add a set before you add load." },
    { id: "intensify",  name: "Intensify",  color: "#C93A2B", kg: "25", from: 20, to: 39,
      note: "Volume comes down, load goes up. Leave a rep in reserve on everything but the last set." },
  ],

  tech: {
    drop: {
      label: "Drop set", when: "Final set only",
      steps: ["Hit the stall point.", "Strip 25-30% immediately.", "Go again to the stall point."],
    },
  },

  sessions: {
    U1: {
      letter: "U1", title: "Upper — push focus", sub: "Press first",
      ex: [
        ex("flat-barbell-bench", "Flat barbell bench", 4, "6-8", 120),
        ex("barbell-row", "Barbell row", 4, "8-10", 90),          // shared id: history continues
        ex("arnold-press", "Arnold press", 3, "10-12", 75),        // shared id
        ex("rope-pushdown", "Rope pushdown", 3, "12-15", 60, 1),   // shared id
        ex("barbell-curl", "Barbell curl", 3, "10", 60, 1),        // shared id
      ],
    },
    L1: {
      letter: "L1", title: "Lower — squat focus", sub: "Heavy, then accessories",
      ex: [
        ex("back-squat", "Back squat", 4, "5-6", 150),             // shared id
        ex("romanian-deadlift", "Romanian deadlift", 3, "8-10", 90),
        ex("leg-press", "Leg press", 3, "12-15", 75, null, { tech: "drop" }),
        ex("standing-calf-raise", "Standing calf raise", 4, "15-20", 45),
      ],
    },
    U2: {
      letter: "U2", title: "Upper — pull focus", sub: "Vertical pulling first",
      ex: [
        ex("wide-grip-pulldown", "Wide-grip pull-up / pulldown", 4, "6-10", 90),
        ex("incline-barbell-press", "Incline barbell press", 4, "8-10", 90),
        ex("chest-supported-row", "Chest-supported row", 3, "10-12", 75),
        ex("lateral-raise", "Lateral raise", 4, "12-15", 45, 1),
        ex("hammer-curl", "Hammer curl", 3, "12", 45, 1),
      ],
    },
    L2: {
      letter: "L2", title: "Lower — hinge focus", sub: "Posterior chain",
      ex: [
        ex("deadlift", "Deadlift", 3, "4-6", 180),
        ex("front-squat", "Front squat", 3, "8-10", 120),
        ex("lying-leg-curl", "Lying leg curl", 3, "12", 60),
        ex("hanging-knee-raise", "Hanging knee raise", 3, "12-15", 45),
      ],
    },
  },

  modes: {
    run:   { label: "Run",     protocol: "30-40 min easy",            unit: "km" },
    rower: { label: "Rower",   protocol: "8 x 30 s hard / 90 s easy", unit: "m" },
    ski:   { label: "Ski erg", protocol: "8 x 30 s hard / 90 s easy", unit: "m" },
    bike:  { label: "Bike",    protocol: "30-40 min easy",            unit: "km" },
  },
};

export default program;
