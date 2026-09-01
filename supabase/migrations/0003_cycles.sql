-- =====================================================================
-- 0003_cycles — a cycle is one named RUN of a programme.
--
-- Before this, sessions were unique on (program, version, slot), so a
-- programme could only ever be run once. Now you can run the Arnold block
-- this autumn, something else in spring, and the Arnold block again next
-- year, with all three kept apart and all three comparable.
--
-- Additive. Existing sessions are moved into a backfilled cycle, not
-- rewritten or deleted.
-- =====================================================================

create table if not exists cycles (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_id      text not null,
  program_version int  not null,
  name            text not null,          -- 'arnie_cardio_type1', 'jim_stoppani_ss1', whatever you like
  status          text not null default 'active',   -- active | completed | abandoned
  started_on      date,
  ended_on        date,
  notes           text,
  updated_at      timestamptz not null default now()
);

create index if not exists cycles_user_idx on cycles (user_id, status);

alter table cycles enable row level security;
drop policy if exists "own cycles" on cycles;
create policy "own cycles" on cycles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sessions belong to a cycle. Nullable first so the backfill can run.
alter table sessions add column if not exists cycle_id uuid references cycles(id) on delete cascade;

-- Backfill: one cycle per (user, programme, version) already in the data.
insert into cycles (id, user_id, program_id, program_version, name, status, started_on)
select
  gen_random_uuid(),
  s.user_id,
  s.program_id,
  s.program_version,
  s.program_id || '_1',
  'active',
  min(s.performed_on)
from sessions s
where s.cycle_id is null
group by s.user_id, s.program_id, s.program_version
on conflict do nothing;

update sessions s
set cycle_id = c.id
from cycles c
where s.cycle_id is null
  and c.user_id = s.user_id
  and c.program_id = s.program_id
  and c.program_version = s.program_version;

-- Uniqueness now lives on the cycle, not the programme.
-- Dropping a CONSTRAINT is not the same as dropping data — no rows are touched.
alter table sessions drop constraint if exists sessions_user_id_program_id_program_version_slot_index_key;
create unique index if not exists sessions_cycle_slot_uidx on sessions (cycle_id, slot_index);

create index if not exists sessions_cycle_idx on sessions (cycle_id);

-- ------------------- Views pick up the cycle -------------------------

create or replace view v_sets as
select
  s.id                                        as set_id,
  s.user_id,
  se.cycle_id,
  cy.name                                     as cycle_name,
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
  round(s.weight * (1 + s.reps / 30.0), 1)    as e1rm
from sets s
join sessions se        on se.id = s.session_id
left join cycles cy     on cy.id = se.cycle_id
left join exercises e   on e.id = s.exercise_id
left join exercises canon on canon.id = e.merged_into
where s.weight is not null and s.reps is not null;

create or replace view v_exercise_progress as
select user_id, exercise_id, exercise, performed_on, cycle_id, cycle_name,
       program_id, block_no, phase,
       max(e1rm) as best_e1rm, sum(volume) as volume, count(*) as sets
from v_sets
group by user_id, exercise_id, exercise, performed_on, cycle_id, cycle_name,
         program_id, block_no, phase;

create or replace view v_session_volume as
select user_id, cycle_id, cycle_name, program_id, program_version, slot_index,
       session_key, performed_on, block_no, phase,
       sum(volume) as volume, count(*) as sets, max(weight) as heaviest
from v_sets
group by user_id, cycle_id, cycle_name, program_id, program_version, slot_index,
         session_key, performed_on, block_no, phase;

-- PRs are all-time and cross-programme: a back squat is a back squat.
create or replace view v_prs as
select distinct on (user_id, exercise_id)
  user_id, exercise_id, exercise, performed_on, cycle_name, weight, reps, e1rm
from v_sets
order by user_id, exercise_id, e1rm desc, performed_on asc;

-- One row per cycle: how it went.
create or replace view v_cycle_summary as
select
  c.id as cycle_id, c.user_id, c.name, c.program_id, c.program_version,
  c.status, c.started_on, c.ended_on,
  count(distinct s.id) filter (where s.done)                     as sessions_done,
  count(distinct s.id) filter (where s.done and s.kind = 'lift') as lifts_done,
  min(s.performed_on)                                            as first_session,
  max(s.performed_on)                                            as last_session,
  round(coalesce(sum(v.volume), 0))                              as total_volume
from cycles c
left join sessions s on s.cycle_id = c.id
left join v_sets v   on v.cycle_id = c.id
group by c.id, c.user_id, c.name, c.program_id, c.program_version,
         c.status, c.started_on, c.ended_on;

insert into schema_migrations (version) values ('0003_cycles') on conflict do nothing;
