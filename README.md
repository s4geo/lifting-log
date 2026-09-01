# Lifting Log

Local-first PWA for rolling training blocks. Sets are written to IndexedDB on
the phone the instant you type them, then synced to Postgres in the background.
The gym can have no signal at all and nothing is lost.

- **Local store:** Dexie / IndexedDB — the source of truth
- **Cloud:** Supabase (Postgres, auth, RLS, daily backups)
- **Hosting:** Cloudflare Workers static assets
- **Install:** Add to Home Screen. No App Store, no Apple Developer account.

Live: https://lifting-log.gcarr30.workers.dev

---

## Contents

1. [How it fits together](#how-it-fits-together)
2. [Adding a new programme](#adding-a-new-programme)
3. [Changing an existing programme](#changing-an-existing-programme)
4. [Publishing changes](#publishing-changes)
5. [Database migrations](#database-migrations)
6. [Analysis](#analysis)
7. [First-time setup](#first-time-setup)
8. [Troubleshooting](#troubleshooting)
9. [Backups](#backups)

---

## How it fits together

```
src/
  programs/       one file per programme; index.js is the registry
    arnold6.js        current version (v2)
    arnold6.v1.js     frozen v1 — kept so old sessions still render
    template.js       starter for a new programme
    index.js          registry + slot/phase/exercise helpers
  db.js           Dexie schema, local reads and writes, export/import
  sync.js         push/pull against Supabase, last-write-wins
  status.js       live "is my data safe" store
  lib.js          date and maths helpers
  components.jsx  status bar, rest timer, set row, charts, technique cards
  screens/        Home, Lift, Cardio, Progress, Cycles, Status
supabase/
  migrations/     numbered SQL, run in order, never edited once applied
scripts/
  publish-program.mjs     generates catalogue + programme SQL
  import-old-export.mjs   converts the original tracker's TSV export
```

### The three concepts

| Concept | What it is | Why |
|---|---|---|
| **Programme** | A definition: slots, phases, exercises, rep ranges. Versioned and immutable once published. | So a session from March still knows it was 4×8-10 |
| **Cycle** | One named *run* of a programme: `arnold_6day_1`, `jim_stoppani_ss1` | So you can run the same programme more than once |
| **Exercise id** | A permanent slug like `back-squat`. The label can change; the id can't. | So renaming doesn't split a trend, and a squat is a squat across programmes |

### The three invariants

1. An exercise `id` is permanent. `name` is only a label.
2. A published programme version is immutable. Change it → publish a new version.
3. Migrations are additive. Never drop or rename a column holding data.

---

## Adding a new programme

Say you're moving to a four-day upper/lower after this block.

### 1. Write the definition

Copy `src/programs/template.js` to `src/programs/mynewblock.js` and edit. The
shape:

```js
const ex = (id, name, sets, reps, rest, pair = null, opts = {}) =>
  ({ id, name, sets, reps, rest, pair, ...opts });

export const program = {
  id: "my-new-block",          // permanent, kebab-case
  version: 1,
  name: "My new block",
  blocks: 8,                    // how many times the slot rotation repeats

  // The rotation. Rolling, not calendar-based: you just do the next one.
  slots: [
    { kind: "lift", key: "U1" },
    { kind: "lift", key: "L1" },
    { kind: "steady" },         // steady cardio
    { kind: "lift", key: "U2" },
    { kind: "intervals" },      // interval cardio
  ],

  // Phases with explicit slot ranges (inclusive). Any number, any length.
  phases: [
    { id: "accumulate", name: "Accumulate", color: "#2F6BB0", kg: "20",
      from: 0, to: 19, note: "Build volume. Add a set before you add load." },
    { id: "intensify", name: "Intensify", color: "#C93A2B", kg: "25",
      from: 20, to: 39, note: "Volume down, load up." },
  ],

  // Intensity techniques, referenced by exercises via { tech: "drop" }
  tech: {
    drop: { label: "Drop set", when: "Final set only",
            steps: ["Hit the stall point.", "Strip 25-30%.", "Go again."] },
  },

  sessions: {
    U1: {
      letter: "U1", title: "Upper — push", sub: "Press first",
      ex: [
        // Reuse ids from other programmes and the history carries over
        ex("incline-barbell-press", "Incline barbell press", 4, "6-8", 120),
        ex("barbell-row", "Barbell row", 4, "8-10", 90),
        // Supersets: same `pair` number = done back to back, rest after
        ex("rope-pushdown", "Rope pushdown", 3, "12-15", 60, 1),
        ex("barbell-curl", "Barbell curl", 3, "10", 60, 1),
      ],
    },
    // ... L1, U2
  },

  modes: {
    run:   { label: "Run",     protocol: "30-40 min easy",            unit: "km" },
    rower: { label: "Rower",   protocol: "8 x 30 s hard / 90 s easy", unit: "m" },
    ski:   { label: "Ski erg", protocol: "8 x 30 s hard / 90 s easy", unit: "m" },
  },
};

export default program;
```

**Total sessions** = `blocks × slots.length`. Phase `from`/`to` must cover that
range.

**Exercise ids are the important bit.** Reuse `back-squat` and your squat
numbers continue on one line across both programmes — Progress → All time shows
the lot. Use a new id only when the movement is genuinely different, or when
the numbers aren't comparable (a pec deck stack vs per-hand dumbbells).

### 2. Register it

`src/programs/index.js`:

```js
import { program as myNewBlock } from "./mynewblock";

export const PROGRAMS = {
  [`${arnold6.id}@${arnold6.version}`]: arnold6,
  [`${arnold6v1.id}@${arnold6v1.version}`]: arnold6v1,
  [`${myNewBlock.id}@${myNewBlock.version}`]: myNewBlock,
};
```

### 3. Publish the definition to Postgres

```bash
node scripts/publish-program.mjs mynewblock > supabase/migrations/0006_my_new_block.sql
```

Run that file in Supabase SQL Editor. It upserts the exercise catalogue and
inserts the programme definition (no-op if already there).

### 4. Deploy and start a cycle

```bash
git add -A && git commit -m "add my new block" && git push
```

Cloudflare rebuilds in ~2 min. Then in the app: **Cycles** → pick the
programme → name the cycle → **Start**.

Finish the old cycle first (**Finish now**) or leave it — unfinished sessions
stay exactly as they are, because the record should say what you did, not what
you intended.

---

## Changing an existing programme

| Change | Version bump? | Migration? | History |
|---|---|---|---|
| Rename an exercise label | No | Catalogue upsert | Intact |
| Change reps, sets, rest | Yes | Programme insert | Intact |
| Swap a movement | Yes | Programme insert | Intact, under both ids |
| Add a slot to the rotation | Yes | Programme insert | Intact — group by exercise, not slot |
| Merge two exercises | No | One `update` | Intact, reported as one |
| Add a field (RPE, tempo) | No | `add column` | Intact |
| Rename a column | **Don't** | — | Add new, backfill, leave old |

### Bumping a version

Worked example — swapping the pec deck for dumbbell flyes (this is v2):

```
1. cp src/programs/arnold6.js src/programs/arnold6.v1.js   # freeze the old one
2. arnold6.js: version -> 2, pec-deck -> incline-db-fly (NEW id, not a rename)
3. register both in index.js
4. node scripts/publish-program.mjs arnold6 > supabase/migrations/0005_arnold_v2.sql
5. run it in Supabase, git push, then in the app: Cycles -> Update to v2
```

**Update to v2** moves the sessions still *ahead* of you onto the new
definition and leaves anything already logged on v1. It refuses if the new
version has a different block shape, because `slot_index` would then point at
different workouts — finish the cycle and start a new one instead.

### Merging two exercises

If you later decide two ids were really the same lift:

```sql
update exercises set merged_into = 'cable-fly' where id = 'pec-deck';
```

The views follow `merged_into`, so both report as one continuous trend. Nothing
is destroyed; set it back to `null` to undo.

Only do this when the numbers are genuinely comparable. Merging a machine stack
with per-hand dumbbells invents a collapse that never happened.

### Retiring a movement

```sql
update exercises set retired_at = now() where id = 'cable-upright-row';
```

---

## Publishing changes

Everything deploys on push:

```bash
git add -A && git commit -m "what changed" && git push
```

Cloudflare Workers rebuilds from `main` automatically (~2 min).

**Deploy order matters: database first, then the app.** A new build writing a
column the database lacks loses that write. The reverse is harmless. This
matters more than usual here because iOS updates home-screen PWAs on its own
schedule, so an old build may keep running for a while.

**Environment variables are baked in at build time.** Changing them in
Cloudflare does nothing until a new build runs — Deployments → Retry deployment.

---

## Database migrations

Numbered files in `supabase/migrations/`, run in order in the SQL Editor.
Never edit one that's been applied; add a new file.

```sql
select * from schema_migrations;   -- what's been applied
```

### Rules

- **Additive only.** `add column` is safe; `drop column` and `rename column` are not.
- New columns must be nullable or defaulted, so an older build's writes still validate.
- **Views are free** — they're derived. But see the gotcha below.
- Deprecate rather than delete. Storage is cheaper than a bad afternoon.

### Gotcha: views can't be reordered in place

`create or replace view` can only *append* columns. Inserting one in the middle
fails with:

```
ERROR: 42P16: cannot change name of view column "performed_on" to "cycle_id"
```

Fix — drop the dependent views first, then recreate:

```sql
drop view if exists v_prs cascade;
drop view if exists v_session_volume cascade;
drop view if exists v_exercise_progress cascade;
drop view if exists v_sets cascade;
```

Safe: views hold no data.

### Client-side schema

Dexie needs a new `version()` block only when **indexes** change — adding a
plain field needs nothing, since IndexedDB stores whole objects. Upgrade
functions must never delete rows.

---

## Analysis

The reason this is Postgres and not DynamoDB. In the SQL Editor:

```sql
-- Estimated 1RM trend for one lift, across every programme
select performed_on, best_e1rm, cycle_name
from v_exercise_progress
where exercise_id = 'incline-barbell-press'
order by performed_on;

-- Tonnage per session
select performed_on, session_key, volume, sets
from v_session_volume order by performed_on desc limit 20;

-- Are you hitting the cadence the block wants? (~4.7/week for the Arnold block)
select * from v_weekly_cadence order by week desc;

-- Every personal best, all time
select exercise, weight, reps, e1rm, performed_on from v_prs order by e1rm desc;

-- How did each cycle go?
select * from v_cycle_summary order by started_on desc;

-- Did Load actually get heavier than Base?
select phase, round(avg(volume)) as avg_volume, count(*) as sessions
from v_session_volume group by phase;
```

Views are plain SQL in the migrations — add your own as questions occur to you.
Anything that speaks Postgres (Metabase, Grafana, a notebook, `psql`) can point
at the same database.

---

## First-time setup

### Supabase

1. New project. Run migrations in order: `0001_init`, `0002_program_v1`,
   `0003_cycles`, `0005_arnold_v2`. (`0004` is the optional example programme.)
2. Settings → **API Keys → Legacy API keys** → copy the `anon public` key. It
   starts with `eyJ`. The newer `sb_publishable_...` format is **not**
   compatible with the bundled `supabase-js` and returns *Invalid API key*.
3. Project URL from Settings → Data API.
4. Authentication → URL Configuration → Site URL and Redirect URLs both set to
   your deployed address.
5. Authentication → Emails → Magic Link template → include `{{ .Token }}` so
   the 6-digit code is in the email (see auth note below).

### Cloudflare Workers

Cloudflare has folded Pages into Workers, so a static build needs
`wrangler.jsonc` at the repo root:

```jsonc
{
  "name": "lifting-log",
  "compatibility_date": "2026-01-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

- Build command: `npm install && npm run build`
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Local development (optional)

```bash
brew install node          # if you don't have it
cp .env.example .env       # paste URL + anon key
npm install
npm run dev                # http://localhost:5173
```

Add `http://localhost:5173` to Supabase's Redirect URLs too.

### Auth: codes, not links

iOS can't route a magic link back into a home-screen web app — the mail app
always opens Safari, and Safari and the installed app have **separate storage
containers**, so signing in there doesn't sign you in here. The app therefore
uses `signInWithOtp` + `verifyOtp` with a 6-digit code you type in, which never
leaves the app.

Sessions persist and refresh themselves, so this is a once-in-a-few-months job.

### Install on the phone

Open the URL in **Safari** → Share → **Add to Home Screen**. Open it from the
icon, not the tab.

Then the test that matters: airplane mode, log a set, watch the status strip go
amber with a pending count, restore signal, watch it go green.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid API key` on sign-in | Using an `sb_publishable_...` key | Use the legacy `anon public` key (`eyJ...`), then **redeploy** |
| Env var change had no effect | Vite bakes them at build time | Deployments → Retry deployment |
| `ERROR: 42P16 ... cannot change name of view column` | `create or replace view` can't reorder columns | `drop view ... cascade` first, then re-run the migration |
| Magic link opens Safari, not the app | iOS limitation; separate storage containers | Use the 6-digit code flow |
| Sets logged in Safari missing from the installed app | Separate storage containers | Export from Safari, restore in the app |
| Two cycles with the same name after a restore | The app created an empty one on first launch | Cycles → Abandon the empty one |
| Status strip stuck amber | Signed out, offline, or a failed push | Tap it → Sync now & verify |
| Everything gone after a long break | Supabase pauses free projects after ~7 days idle | Resume in the dashboard; local data is untouched |
| `zsh: command not found: npm` | Node not installed | `brew install node`, or just let Cloudflare build it |

### Is my data exposed?

The page is public; the data isn't. Row-level security filters every query by
`auth.uid() = user_id`, so a stranger loading the URL gets an empty app. The
anon key is designed to be public. Verify with:

```sql
select tablename, rowsecurity from pg_tables
where tablename in ('sessions','sets','cycles');
```

All three must be `true`. Never put the `service_role` key in the app — it
bypasses RLS entirely. `.env` is gitignored; keep it that way.

---

## Backups

Three independent layers:

1. **IndexedDB on the phone** — written on every keystroke, survives offline
2. **Supabase Postgres** — synced in the background, daily backups
3. **Downloaded JSON** — a file you own, dependent on nobody

The status strip (top of every screen) distinguishes *saved* from *backed up* —
different states, and conflating them is how you get surprised. Tap it for Data
status: record counts, pending writes, whether the browser has marked your
storage permanent, and **Sync now & verify**, which asks the server what it
actually holds rather than trusting the word "synced".

Take the file backup before any programme change. It nags in amber past a
fortnight.

### Importing from the original tracker

```bash
node scripts/import-old-export.mjs old-export.tsv > backup.json
```

Handles dated and undated formats, tabs or commas. Then Restore in the app.
