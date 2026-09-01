# Lifting Log

A local-first PWA for the rolling six-day Arnold block. Sets are written to
IndexedDB on your phone the instant you type them, and synced to Postgres in the
background when there's signal. The gym basement can have no bars at all and
nothing is lost.

- **Local store:** Dexie / IndexedDB — the source of truth
- **Cloud:** Supabase (managed Postgres, auth, daily backups)
- **Hosting:** any static host; Cloudflare Pages or Vercel take about two minutes
- **Install:** Add to Home Screen. No App Store, no Apple Developer account.

---

## 1. Supabase (10 minutes)

1. Sign up at supabase.com, create a project (region: London / eu-west-2).
   Save the database password even though you won't need it here.
2. Open **SQL Editor** and run the migrations **in numerical order**:
   - `supabase/migrations/0001_init.sql` — tables, security, views
   - `supabase/migrations/0002_program_v1.sql` — exercise catalogue + block
3. Go to **Project Settings → API** and copy the **Project URL** and the
   **anon public** key.
4. Copy `.env.example` to `.env` and paste those two values in.

Run `select * from schema_migrations;` to confirm what's applied.

The anon key is safe in a client bundle — row-level security means it can only
ever read or write rows belonging to the signed-in user. Never put the
`service_role` key in the app.

## 2. Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

The app works fully offline before you ever sign in — it just stays on the
phone. Tap **Sign in** to get a magic link by email and start syncing.

## 3. Deploy

```bash
npm run build        # outputs to dist/
```

Point Cloudflare Pages or Vercel at the repo (build command `npm run build`,
output directory `dist`), and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as environment variables in their dashboard.

Then in Supabase → **Authentication → URL Configuration**, add your deployed URL
to the redirect allow-list, or the magic link will bounce you to localhost.

## 4. Install to your phone

**iPhone:** open the URL in Safari → Share → **Add to Home Screen**.
**Android:** Chrome will offer an install prompt; or menu → Install app.

Two iOS quirks the app already handles, worth knowing about:

- A home-screen web app gets its **own storage container**, separate from
  Safari's. Anything logged in the Safari tab before installing won't appear in
  the installed app. Install first, then log.
- iOS **suspends JavaScript** when the screen locks, so an interval-based rest
  timer would freeze in your pocket. The timer here stores a wall-clock end time
  and recomputes on wake, so it stays correct.

The app calls `navigator.storage.persist()` on first run to ask the browser not
to evict your data.

## 5. Bring your old data across

If you have the tab-separated export from the old tracker:

```bash
node scripts/import-old-export.mjs old-export.tsv > backup.json
```

Then in the app: **Restore** → choose that file. It handles the dated and
undated export formats, and tab- or comma-separated.

---

## Analysis

The whole point of Postgres. In Supabase's SQL Editor:

```sql
-- Estimated 1RM trend for one lift
select performed_on, best_e1rm
from v_exercise_progress
where exercise = 'Incline barbell press'
order by performed_on;

-- Tonnage per session, most recent first
select performed_on, session_key, volume, sets
from v_session_volume order by performed_on desc limit 20;

-- Are you actually hitting the cadence the block wants?
select * from v_weekly_cadence order by week desc;

-- Every personal best
select exercise, weight, reps, e1rm, performed_on from v_prs order by e1rm desc;

-- Volume by phase — did Load actually get heavier than Base?
select phase, round(avg(volume)) as avg_session_volume, count(*) as sessions
from v_session_volume group by phase;
```

Views are plain SQL in `supabase/schema.sql` — add your own as you think of
questions. Anything that speaks Postgres (Metabase, Grafana, a notebook,
`psql`) can point at the same database.

---

## Structure

```
src/
  programs/       one file per programme; index.js is the registry
  db.js           Dexie schema, local reads and writes, export and import
  sync.js         push/pull against Supabase, last-write-wins
  lib.js          date and maths helpers
  components.jsx  rest timer, set row, charts, technique cards
  screens/        Home, Lift, Cardio, Progress
supabase/
  migrations/     numbered SQL, run in order, never edited once applied
scripts/
  publish-program.mjs     regenerates catalogue + programme SQL
  import-old-export.mjs   converts the old tracker's export
```

**To change the programme**, edit its file in `src/programs/`. Rep ranges, rest
periods, phase names and boundaries, which movement gets the drop set, the slot
rotation — all data. **To run something else entirely**, copy
`src/programs/template.js`, register it in `index.js`, and start a new cycle.

Read `CHANGING-THINGS.md` first. The rules are short and they're what keeps two
years of history comparable.

## Knowing it's safe

The status strip sits at the top of every screen, including mid-session. It
flashes "Set logged ✓" on every write, and otherwise reports one of: saved and
backed up, N changes waiting, offline, or sync failed. Tap it for **Data
status** — local record counts, pending writes, whether the browser has marked
your storage permanent, how much space is used, when you last synced, and a
**Sync now & verify** button that asks the server what it actually holds rather
than trusting the word "synced".

## Three layers of durability

1. IndexedDB on the phone, written on every keystroke, survives being offline
2. Supabase Postgres, synced in the background, with daily backups
3. **Download backup** — a JSON file you own, that depends on nobody

Take the download occasionally anyway. It costs one tap.
