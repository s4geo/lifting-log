-- =====================================================================
-- 0001_init — tables, security, views
-- Run migrations IN ORDER. Never edit a migration that has already been
-- applied; add a new numbered file instead.
-- =====================================================================

create extension if not exists "pgcrypto";

-- Bookkeeping so you can tell what's been applied.
create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ------------------- Exercise catalogue ------------------------------
-- `id` is permanent and is what sets are stored against. `name` is only a
-- label and can be changed at any time without touching history.
-- To retire a movement, set retired_at. To declare that two ids were really
-- the same lift all along, set merged_into on the loser — the views follow it.

create table if not exists exercises (
  id           text primary key,
  name         text not null,
  muscles      text[] default '{}',
  equipment    text,
  merged_into  text references exercises(id),
  retired_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ------------------- Programme versions ------------------------------
-- A published version is IMMUTABLE. Changing the block means inserting a new
-- (id, version) row. Sessions record which version they were performed under,
-- so a session from March still describes what you actually did in March.

create table if not exists programs (
  id           text not null,
  version      int  not null,
  name         text not null,
  definition   jsonb not null,
  published_at timestamptz not null default now(),
  primary key (id, version)
);

-- ------------------- Training data -----------------------------------

create table if not exists sessions (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_id      text not null,
  program_version int  not null,
  slot_index      int  not null,          -- position within that programme version
  block_no        int,
  phase           text,
  kind            text not null,          -- lift | steady | intervals
  session_key     text,                   -- A | B | C | D for lifts
  performed_on    date,
  done            boolean not null default false,
  mode            text,                   -- run | rower | ski | bike
  distance        numeric,
  duration        text,
  notes           text,
  updated_at      timestamptz not null default now(),
  unique (user_id, program_id, program_version, slot_index)
);

create table if not exists sets (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id   uuid not null references sessions(id) on delete cascade,
  exercise_id  text not null,             -- soft reference; see note below
  set_no       int  not null,
  weight       numeric,
  weight_unit  text not null default 'kg',
  reps         int,
  done         boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (session_id, exercise_id, set_no)
);

-- Deliberately NOT a foreign key to exercises. A phone that has been offline
-- for a fortnight may sync a set for a movement the server catalogue hasn't
-- seen yet; a hard FK would reject the write and lose the set. The catalogue
-- is for labels and grouping, not for gatekeeping your training history.

create index if not exists sessions_sync_idx  on sessions (user_id, updated_at);
create index if not exists sets_sync_idx      on sets (user_id, updated_at);
create index if not exists sets_exercise_idx  on sets (user_id, exercise_id);

-- ------------------- Row level security ------------------------------

alter table sessions enable row level security;
alter table sets     enable row level security;
alter table exercises enable row level security;
alter table programs  enable row level security;

drop policy if exists "own sessions" on sessions;
create policy "own sessions" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sets" on sets;
create policy "own sets" on sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Catalogue and programmes are shared reference data: readable by anyone
-- signed in, writable only from the SQL editor.
drop policy if exists "read exercises" on exercises;
create policy "read exercises" on exercises for select using (auth.role() = 'authenticated');

drop policy if exists "read programs" on programs;
create policy "read programs" on programs for select using (auth.role() = 'authenticated');

-- ------------------- Analysis views ----------------------------------
-- Views are derived, so they can be replaced freely without touching data.
-- If you rename an exercise, these follow automatically.

create or replace view v_sets as
select
  s.id                                        as set_id,
  s.user_id,
  se.performed_on,
  se.program_id,
  se.program_version,
  se.block_no,
  se.phase,
  se.session_key,
  se.slot_index,
  se.kind,
  coalesce(e.merged_into, s.exercise_id)      as exercise_id,
  coalesce(canon.name, e.name, s.exercise_id) as exercise,
  s.set_no,
  s.weight,
  s.weight_unit,
  s.reps,
  (s.weight * s.reps)                         as volume,
  round(s.weight * (1 + s.reps / 30.0), 1)    as e1rm   -- Epley
from sets s
join sessions se   on se.id = s.session_id
left join exercises e    on e.id = s.exercise_id
left join exercises canon on canon.id = e.merged_into
where s.weight is not null and s.reps is not null;

create or replace view v_exercise_progress as
select user_id, exercise_id, exercise, performed_on, block_no, phase,
       max(e1rm) as best_e1rm, sum(volume) as volume, count(*) as sets
from v_sets
group by user_id, exercise_id, exercise, performed_on, block_no, phase;

create or replace view v_session_volume as
select user_id, program_id, program_version, slot_index, session_key,
       performed_on, block_no, phase,
       sum(volume) as volume, count(*) as sets, max(weight) as heaviest
from v_sets
group by user_id, program_id, program_version, slot_index, session_key,
         performed_on, block_no, phase;

create or replace view v_prs as
select distinct on (user_id, exercise_id)
  user_id, exercise_id, exercise, performed_on, weight, reps, e1rm
from v_sets
order by user_id, exercise_id, e1rm desc, performed_on asc;

create or replace view v_weekly_cadence as
select user_id,
       date_trunc('week', performed_on)::date as week,
       count(*) filter (where kind = 'lift')                  as lifts,
       count(*) filter (where kind in ('steady','intervals')) as cardio,
       count(*)                                               as sessions
from sessions
where done and performed_on is not null
group by user_id, date_trunc('week', performed_on);

insert into schema_migrations (version) values ('0001_init') on conflict do nothing;
