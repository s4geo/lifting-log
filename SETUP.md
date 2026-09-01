# Setup runbook

Ordered. Each step has a check so you know it worked before moving on.
Total: about an hour, most of it waiting for things to deploy.

---

## Stage 1 — Supabase (15 min)

**1.1** Sign up at supabase.com. New project, region **London (eu-west-2)**.
Save the database password in your password manager. Wait ~2 min for it to
provision.

**1.2** SQL Editor → New query → paste all of
`supabase/migrations/0001_init.sql` → Run.

**1.3** Run the remaining migrations, in order:
- `0002_program_v1.sql` — the Arnold block and its exercise catalogue
- `0003_cycles.sql` — cycles, so a programme can be run more than once
- `0004_program_upper_lower.sql` — the example second programme (optional)
- `0005_arnold_v2.sql` — v2 of the block: incline dumbbell fly replaces pec deck

> **Check:** `select * from schema_migrations;` lists `0001_init` and `0003_cycles`.
> `select count(*) from exercises;` returns 34.
> `select id, version from programs;` returns `arnold-6day | 1`.

**1.4** Authentication → Providers → confirm **Email** is on. Turn
*Confirm email* on. You don't need any other provider.

**1.5** Project Settings → API. Copy the **Project URL** and the **anon
public** key. Ignore `service_role` — it must never go in the app.

---

## Stage 2 — Run it locally (10 min)

```bash
cp .env.example .env      # paste the URL and anon key in
npm install
npm run dev               # http://localhost:5173
```

> **Check:** the block screen loads and says "Block 1 of 9". Open a session and
> type a weight — the strip at the top of the screen flashes "Set logged ✓".
> Reload the page; the number is still there. That's IndexedDB working with no
> cloud involved at all.

**2.1** Restore your existing data: **Restore** → pick
`your-session-1-backup.json` from the repo root.

> **Check:** session 1 shows as done, dated 31 Aug, and Progress → Log shows a
> top set of 60 kg with 8,101 kg of volume.

**2.2** Tap **Sign in**, enter your email, click the link in the message.

> **Check:** the status strip goes green and reads "Saved & backed up". Tap it
> → **Sync now & verify**, which pushes anything outstanding and then asks the
> server what it actually holds. Local and server counts should agree.

---

## Stage 3 — Deploy (20 min)

**3.1** Push the repo to GitHub (private is fine).

**3.2** Cloudflare Pages → Create project → connect the repo.
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

**3.3** Back in Supabase → Authentication → URL Configuration:
- **Site URL:** your `*.pages.dev` address
- **Redirect URLs:** add both that address and `http://localhost:5173`

Skip this and the magic link will send you to localhost from your phone.

> **Check:** open the deployed URL on your laptop, sign in, and confirm your
> session 1 appears without restoring anything. That's the sync round-tripping
> through Postgres.

---

## Stage 4 — Onto the phone (5 min)

**4.1** Open the deployed URL in **Safari** (not Chrome — only Safari can
install to the home screen on iOS).

**4.2** Share → **Add to Home Screen** → Add.

**4.3** Open it from the home screen icon, not the Safari tab. Sign in again —
the installed app has its own storage container, separate from Safari's.

> **Check:** your session 1 is there. Turn on airplane mode, log a set, and
> confirm the strip reads "Offline · saved on this phone" and then shows the
> pending count. Turn the signal back on and watch it go green. Open Data
> status and confirm "Storage marked permanent: Yes".

That last check is the one that matters. It's the failure that lost your data
twice.

---

## Stage 5 — Habits (ongoing)

- **Glance at the status strip.** It's on every screen. Green means saved and
  backed up; amber means saved here and waiting; red means the cloud push
  failed but your phone still has everything.
- **Download backup** every block or so. Data status nags in amber once it's
  been more than a fortnight. It's the layer that doesn't depend on anyone
  else's servers.
- Supabase pauses free projects after ~7 days of inactivity. Data isn't lost;
  you click resume. If you take a month off, expect that.
- Read `CHANGING-THINGS.md` before changing the programme. Short, and it's the
  difference between history that stays comparable and history that doesn't.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Magic link opens localhost on the phone | Redirect URLs not set | Stage 3.3 |
| Chip stuck on "Sync failed" | Migration not run, or expired session | Check `schema_migrations`; sign out and back in |
| Data on the phone but not the laptop | Not signed in on one of them | Sign in; sync is per-account |
| Sets logged in Safari missing from the installed app | Separate iOS storage containers | Export from Safari, restore in the app |
| Everything gone after a long break | Supabase project paused | Resume it in the dashboard; local data is untouched |

Your data is never in only one place: the phone, Postgres, and whatever backup
files you've downloaded. Losing all three at once takes real effort.
