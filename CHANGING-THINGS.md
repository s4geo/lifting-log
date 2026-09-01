# Changing things without breaking history

Two different kinds of change, two different sets of rules. The failure you're
guarding against isn't an error message — it's the silent kind, where the app
still works but your 2027 numbers no longer line up with your 2026 ones.

---

## Cycles: running things more than once

A **cycle** is one named run of a programme. `arnie_cardio_type1` this autumn,
`jim_stoppani_ss1` after it, `arnie_cardio_type2` next year. Sessions belong to
a cycle, not directly to a programme, which is what makes repeats possible.

**Finishing early is normal, not an error.** Cycles → Finish now. The cycle is
marked completed with today's date; unfinished sessions stay exactly as they
are, because the record should say what you actually did, not what you meant
to do. Then start the next one.

**Starting a new programme**: write a new file in `src/programs/`, register it
in `src/programs/index.js`, publish it
(`node scripts/publish-program.mjs myprogram > supabase/migrations/00XX_myprogram.sql`),
and it appears in the Cycles screen.

**The payoff is exercise ids.** If your new programme uses `back-squat`, the
squat numbers continue on one line across both programmes — Progress → All
time shows the whole history regardless of which block you were running. Use a
new id only when it's genuinely a different movement.

---

## The three invariants

Everything below follows from these. If a change would break one of them, it's
the wrong change.

1. **An exercise `id` is permanent.** It's what sets are stored against.
   `name` is only a label.
2. **A published programme version is immutable.** Change the block, publish a
   new version. Never edit a version you've already trained under.
3. **Migrations are additive.** New columns, new tables, new views. Never drop
   or rename a column that has data in it.

---

## Changing the programme

### Renaming an exercise — safe, no version bump

Change `name` in `src/program.js`, leave `id` alone. Run
`node scripts/publish-program.mjs`, paste the exercise-catalogue portion into
the SQL editor. Every historical set keeps pointing at the same id, and the
views pick up the new label automatically.

```js
// before
ex("cable-fly", "Cable fly", 3, "12-15", 60, 3, { tech: "drop" })
// after — history intact
ex("cable-fly", "Cable crossover", 3, "12-15", 60, 3, { tech: "drop" })
```

### Changing reps, rest, sets, or swapping a movement — bump the version

```
1. edit src/program.js
2. PROGRAM_VERSION = 2
3. node scripts/publish-program.mjs > supabase/migrations/0003_program_v2.sql
4. run that file in the SQL editor
5. deploy the app
```

Sessions you've already logged stay stamped `program_version = 1`. When you
look back at March, the app can still tell you it was 4×8-10, because the
definition for version 1 is still sitting in the `programs` table.

**The trap:** `slot_index` is only meaningful *within a version*. If v2 has a
seven-slot block, slot 12 means something different than it did in v1. That's
exactly why the unique key is `(user_id, program_id, program_version,
slot_index)` and why every query that spans versions should group by exercise,
not by slot.

### Worked example: swapping pec deck for dumbbell flyes

Your gym's pec deck is no good, so v2 of the Arnold block replaces it with an
incline dumbbell fly.

```
1. src/programs/arnold6.js copied to arnold6.v1.js and frozen
2. arnold6.js: version -> 2, pec-deck -> incline-db-fly (new id)
3. both registered in index.js, so v1 history still renders
4. node scripts/publish-program.mjs arnold6 > supabase/migrations/0005_arnold_v2.sql
5. run it, deploy, then Cycles -> Update to v2
```

**New id, not a rename.** Pec deck weight is a stack number; dumbbell flyes are
per-hand. Merging them would put 40 kg and 12 kg on one line and invent a
collapse that never happened. Two ids, two honest trends. Merge only when the
numbers are genuinely comparable.

**Update to v2** moves the sessions still ahead of you onto the new definition
and leaves everything you've already logged on v1, because those sessions
record what you actually did. It refuses outright if the new version has a
different block shape — different slot count means `slot_index` points at
different workouts, so the right move there is to finish the cycle and start a
new one.

### Deciding two exercises were really the same lift

You logged `cable-fly` for six months, then switched to `pec-deck` and now want
one continuous chest-isolation trend. Don't rewrite the sets — declare the
relationship:

```sql
update exercises set merged_into = 'cable-fly' where id = 'pec-deck';
```

`v_sets` follows `merged_into`, so both now report under one id and one name.
Nothing was destroyed, and you can undo it by setting the column back to null.

### Retiring a movement

```sql
update exercises set retired_at = now() where id = 'cable-upright-row';
```

It stops being offered for new sessions; every historical set stays exactly
where it is.

---

## Changing the database

### The rules

- **Additive only.** `alter table ... add column` is safe. `drop column` and
  `rename column` are not.
- **New columns must be nullable or have a default**, so rows written by a
  phone running last month's build still validate.
- **Never edit an applied migration.** Add `0004_whatever.sql` instead. The
  `schema_migrations` table records what's been run.
- **Views are free.** They're derived, so `create or replace view` costs
  nothing and breaks nothing. Put as much logic there as you can — it's the
  cheapest place to change your mind.
- **Deprecate rather than delete.** If a column is wrong, add the right one,
  backfill, and leave the old one alone until you're certain. Storage is
  cheaper than a bad afternoon.

### Deploy order matters

**Database first, then the app.** Always.

A new app build might write a column the database doesn't have yet — that
write fails and the set is lost. The reverse is harmless: a database with a
column the old app ignores is a non-event. So:

```
1. run the migration in Supabase
2. confirm it applied
3. deploy the app
```

This also means a phone that hasn't updated keeps working through a schema
change, which matters because iOS updates home-screen PWAs whenever it feels
like it, not when you tell it to.

### Example: adding RPE to sets

```sql
-- supabase/migrations/0004_add_rpe.sql
alter table sets add column if not exists rpe numeric;

create or replace view v_sets as
  ... existing columns ..., s.rpe;

insert into schema_migrations (version) values ('0004_add_rpe') on conflict do nothing;
```

Then on the client, bump the Dexie version in `src/db.js`:

```js
db.version(2).stores({
  sessions: "id, slot_index, performed_on, updated_at, dirty",
  sets: "id, session_id, exercise_id, updated_at, dirty, [session_id+exercise_id+set_no]",
  meta: "key",
});
```

Dexie only needs a new `version()` block when **indexes** change. Adding a
plain field needs nothing at all — IndexedDB stores whole objects. And never
write an upgrade function that deletes rows.

---

## Before any change of consequence

```
node scripts/import-old-export.mjs --help   # or just: Download backup in the app
```

Take the JSON backup, and take a Supabase backup (Database → Backups). Then
make the change. Restoring from a file you already have takes two minutes;
reconstructing six months of training from memory doesn't work.

---

## Quick reference

| Change | Version bump? | Migration? | History |
|---|---|---|---|
| Rename an exercise label | No | Catalogue upsert | Intact |
| Change reps, sets, rest | Yes | Programme insert | Intact |
| Swap a movement | Yes | Programme insert | Intact, under both ids |
| Add a slot to the block | Yes | Programme insert | Intact — group by exercise, not slot |
| Merge two exercises | No | One `update` | Intact, reported as one |
| Retire a movement | Yes | Programme insert | Intact |
| Add a field (RPE, tempo) | No | `add column` | Intact |
| Rename a column | **Don't** | — | Add new, backfill, leave old |
| New analysis view | No | `create or replace` | N/A |
| Finish a cycle early | No | — | Intact; cycle marked completed |
| Re-run a programme you've run before | No | — | Separate cycle, both comparable |
| Add a whole new programme | No | Programme insert | Shared exercise ids keep trends continuous |
