/*
 * Weight suggestions from your own history.
 *
 * The rule matches how the block is written: hit the TOP of the prescribed
 * rep range on EVERY set, and you've earned the next weight. Anything less
 * and you repeat the weight, chasing reps.
 *
 * Increments live here rather than in the programme definition, because how
 * much you can add to a barbell is a fact about the movement and your gym —
 * not part of the prescription. Keeping it separate means tuning these never
 * bumps a programme version.
 */

const KG = {
  // Barbell, lower body — the big jumps
  "back-squat": 5, "romanian-deadlift": 5, "deadlift": 5, "front-squat": 5,
  "leg-press": 10,

  // Barbell, upper body
  "incline-barbell-press": 2.5, "flat-barbell-bench": 2.5, "barbell-row": 2.5,
  "close-grip-bench": 2.5, "barbell-curl": 2.5, "ez-curl": 2.5,

  // Dumbbells — next pair up, usually 2 kg
  "flat-db-press": 2, "arnold-press": 2, "incline-db-curl": 2, "hammer-curl": 2,
  "db-pullover": 2, "incline-db-fly": 2, "lateral-raise": 2, "rear-delt-fly": 2,

  // Cables and stacks — one pin
  "cable-fly": 2.5, "seated-cable-row": 5, "wide-grip-pulldown": 5,
  "straight-arm-pulldown": 2.5, "rope-pushdown": 2.5, "overhead-cable-ext": 2.5,
  "cable-upright-row": 2.5, "face-pull": 2.5, "single-arm-pulldown": 2.5,
  "chest-supported-row": 5, "pec-deck": 5, "triceps-pushdown": 2.5,
  "leg-extension": 5, "lying-leg-curl": 5, "standing-calf-raise": 5,
  "cable-crunch": 5, "weighted-dips": 2.5,
};

export const incrementFor = (id) => KG[id] ?? 2.5;

/* Top of the prescribed range: "8-10" -> 10, "15" -> 15, "12 / side" -> 12. */
export function targetReps(reps) {
  if (!reps) return null;
  if (/amrap/i.test(reps)) return "amrap";
  const nums = String(reps).match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

/*
 * history: [{ performed_on, sets: [{ weight, reps }] }], newest first.
 * Returns { weight, kind, reason } or null when there's nothing to go on.
 */
export function suggest({ exerciseId, prescribedReps, history }) {
  const past = (history || []).filter((h) => h.sets.some((s) => s.reps != null));
  if (!past.length) return null;

  const last = past[0];
  const target = targetReps(prescribedReps);
  const inc = incrementFor(exerciseId);
  const weights = last.sets.map((s) => Number(s.weight)).filter((w) => !isNaN(w));
  const topWeight = weights.length ? Math.max(...weights) : 0;
  const reps = last.sets.map((s) => Number(s.reps)).filter((r) => !isNaN(r));
  if (!reps.length) return null;

  const worst = Math.min(...reps);

  // Bodyweight work: add reps until it's silly, then start loading.
  if (topWeight === 0) {
    if (target === "amrap" || target == null) {
      return worst >= 15
        ? { weight: 5, kind: "up", reason: `${worst}+ reps bodyweight — time to add a belt` }
        : { weight: 0, kind: "hold", reason: `${reps.join("/")} last time — keep adding reps` };
    }
  }

  if (target === "amrap") {
    return worst >= 15
      ? { weight: topWeight + inc, kind: "up", reason: `${worst}+ reps — add ${inc} kg` }
      : { weight: topWeight, kind: "hold", reason: `${reps.join("/")} last time` };
  }

  const cleared = target != null && reps.every((r) => r >= target);
  if (cleared) {
    return {
      weight: Math.round((topWeight + inc) * 2) / 2,
      kind: "up",
      reason: `${reps.length}×${target} last time — up ${inc} kg`,
    };
  }

  // Stalled twice at the same weight? Back off rather than grinding a third time.
  const prior = past[1];
  if (prior) {
    const priorTop = Math.max(...prior.sets.map((s) => Number(s.weight)).filter((w) => !isNaN(w)), 0);
    const priorReps = prior.sets.map((s) => Number(s.reps)).filter((r) => !isNaN(r));
    const priorMissed = target != null && priorReps.length && priorReps.some((r) => r < target);
    if (priorTop === topWeight && priorMissed) {
      const deload = Math.round(topWeight * 0.9 * 2) / 2;
      return {
        weight: deload,
        kind: "deload",
        reason: `stalled twice at ${topWeight} — drop to ${deload} and rebuild`,
      };
    }
  }

  const shortfall = target - worst;
  return {
    weight: topWeight,
    kind: "hold",
    reason: shortfall === 1
      ? `one rep short last time — hold ${topWeight} kg`
      : `${reps.join("/")} last time — hold for ${target}s`,
  };
}
