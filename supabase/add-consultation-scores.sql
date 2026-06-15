-- =====================================================================
-- add-consultation-scores.sql
--
-- New table to store the doctor's functional-assessment scores
-- captured during a consultation — e.g. VAS pain (0-10), Oswestry
-- Disability Index (ODI %, 0-100), and future ortho instruments.
--
-- One row per (consultation_id, scale_code, scale_version) so a doctor
-- can record the same instrument twice in two visits and the
-- comparison/trend stays intact.
--
-- Idempotent — `create table if not exists` + `create index if not
-- exists`. Re-running is a no-op.
-- =====================================================================

-- pgcrypto is always available on Supabase; gen_random_uuid() ships
-- with it. We use it instead of the project's bespoke uuidv7() so
-- the migration runs cleanly on any database state — including the
-- one the user is seeing right now where the helpers migration
-- hasn't been applied.
create extension if not exists pgcrypto;

-- Pin schema so unqualified `consultations` / `users` refs resolve
-- the same way the rest of the project's migrations expect. Without
-- this the SQL editor's per-session search_path can drop `public`
-- and the FK references in the create-table fail with
-- "relation 'consultations' does not exist".
set search_path = public, extensions;

create table if not exists public.consultation_scores (
  id              uuid          primary key default gen_random_uuid(),
  consultation_id uuid          not null references public.consultations(id) on delete cascade,
  scale_code      text          not null,
  scale_version   text          not null default 'v1',
  -- Raw answers — for ODI this is { q1: 2, q2: 4, ... q10: 1 }, for
  -- VAS just { value: 7 }. Keeps the FE's questionnaire structure
  -- without forcing one column per question.
  raw_answers     jsonb         not null,
  -- Final number on the instrument's native scale: VAS 0-10, ODI
  -- 0-100 (disability %), DASH 0-100, WOMAC 0-96, etc. FE picks the
  -- display unit from `scale_code`.
  computed_score  numeric(6,2)  not null,
  -- Optional band label the scale maps to (e.g. ODI: 'minimal' /
  -- 'moderate' / 'severe' / 'crippled' / 'bed_bound'). Free text so
  -- new scales don't need a check-constraint bump.
  severity_band   text,
  recorded_at     timestamptz   not null default now(),
  recorded_by     uuid          not null references public.users(id) on delete set null,
  -- uniform block
  created_by      uuid          not null references public.users(id) on delete set null,
  created_at      timestamptz   not null default now(),
  updated_by      uuid          references public.users(id) on delete set null,
  updated_at      timestamptz   not null default now(),
  version         int           not null default 0,
  deleted_at      timestamptz,
  deleted_by      uuid          references public.users(id) on delete set null,
  -- Allowed scales — bump this when we add DASH / WOMAC.
  constraint chk_consultation_scores_scale check (scale_code in ('VAS','ODI','DASH','WOMAC')),
  constraint chk_consultation_scores_score check (computed_score >= 0)
);

comment on table consultation_scores is
  'Functional-assessment scores (VAS, Oswestry ODI, DASH, WOMAC, …) captured by the doctor during a consultation. One row per (consultation, scale, version). raw_answers holds the questionnaire selections so the form can re-render the doctor''s exact choices on amend / past-visit view.';

create unique index if not exists uq_consultation_scores_unique
  on public.consultation_scores (consultation_id, scale_code, scale_version)
  where deleted_at is null;

create index if not exists ix_consultation_scores_consultation
  on public.consultation_scores (consultation_id)
  where deleted_at is null;

-- Touch trigger: bumps updated_at + version on every UPDATE.
-- Re-uses the project-wide fn_touch_updated() when it's already been
-- installed by 20260101000100_helpers.sql. When that migration
-- hasn't run yet (fresh DB), we install a local copy here so this
-- file stays self-contained.
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'fn_touch_updated' and n.nspname = 'public'
  ) then
    execute $f$
      create or replace function fn_touch_updated() returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at := now();
        new.version    := coalesce(old.version, 0) + 1;
        return new;
      end
      $body$;
    $f$;
  end if;
end $$;

drop trigger if exists tr_consultation_scores_bu_touch on public.consultation_scores;
create trigger tr_consultation_scores_bu_touch
  before update on public.consultation_scores
  for each row execute function public.fn_touch_updated();
