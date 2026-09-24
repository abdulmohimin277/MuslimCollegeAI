-- ============================================================
-- MUSLIM COLLEGE AI — SUPABASE SCHEMA  (supabase/schema.sql)
-- ------------------------------------------------------------
-- Run this file in the SQL editor of your Supabase project
-- (Dashboard → SQL Editor → New query → paste → Run).
-- Then run supabase/policies.sql.
--
-- SECURITY MODEL
--   • Passwords / PINs are stored ONLY as bcrypt hashes (pgcrypto).
--   • The raw credentials never appear in any committed file —
--     they live only in protected Supabase secrets (see SETUP.md).
--   • Everything admin frontend does is authorized server-side.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ADMIN ACCOUNTS (master + changeable admin)
-- is_master accounts can never be changed through the panel.
-- ------------------------------------------------------------
create table if not exists public.admins (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,          -- pgcrypto bcrypt (crypt/bf)
  is_master     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CLASS TYPES — Medical, ICS, Pre Engineering, DIT, I.Com, FA IT
-- (extensible from the Admin panel)
-- ------------------------------------------------------------
create table if not exists public.class_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CLASSES
-- ------------------------------------------------------------
create table if not exists public.classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  class_type_id uuid not null references public.class_types(id) on delete restrict,
  batch         text not null default '1st Year',          -- '1st Year' | 'Second Year'
  incharge_name text,
  cr_name       text,
  session       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, session)
);

-- ------------------------------------------------------------
-- PER-CLASS SUBJECTS (configurable name / total / passing / order)
-- ------------------------------------------------------------
create table if not exists public.class_subjects (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  name          text not null,
  total_marks   integer not null default 100 check (total_marks > 0),
  passing_marks integer not null default 33 check (passing_marks >= 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- STUDENTS (full profile + portal PIN hashes)
-- pin_hash / pin_salt / pin_iterations are the ONLY portal secret.
-- ------------------------------------------------------------
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  serial_number   integer,
  roll_number     text not null,
  name            text not null,
  father_name     text,
  class_id        uuid not null references public.classes(id) on delete cascade,
  session         text,
  gender          text,
  dob             text,
  contact         text,
  admission_info  text,
  notes           text,
  photo_url       text,
  pin_hash        text,
  pin_salt        text,
  pin_iterations  integer not null default 10000,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (class_id, roll_number)
);

-- ------------------------------------------------------------
-- MARKS
-- ------------------------------------------------------------
create table if not exists public.marks (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  total_marks      integer not null default 100 check (total_marks > 0),
  obtained_marks   integer not null default 0 check (obtained_marks >= 0),
  updated_at       timestamptz not null default now(),
  unique (student_id, class_subject_id)
);

-- ------------------------------------------------------------
-- ANNOUNCEMENTS
-- status: draft | published | scheduled
-- ------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  date        timestamptz not null default now(),
  expiry_date timestamptz,
  priority    text not null default 'normal' check (priority in ('high','normal','low')),
  category    text,
  status      text not null default 'draft' check (status in ('draft','published','scheduled')),
  publish_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ANNOUNCEMENT FILE ATTACHMENTS (validated, stored in Storage)
-- kind: image | video | document
-- ------------------------------------------------------------
create table if not exists public.announcement_files (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid references public.announcements(id) on delete cascade,
  kind            text not null check (kind in ('image','video','document')),
  name            text not null,
  mime            text not null,
  size            integer not null default 0,
  storage_path    text,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- AUDIT LOG (written by Postgres triggers + edge functions)
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  action         text not null,
  entity         text,
  entity_id      uuid,
  admin_username text,
  details        text,
  success        boolean not null default true,
  ip             text,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- BRUTE-FORCE / LOCKOUT TRACKING
-- ------------------------------------------------------------
create table if not exists public.login_attempts (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,       -- 'adm:<username>' | 'stu:<roll>'
  fails        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- DEPLOYMENTS (UPDATE WEBSITE history + rollback snapshots)
-- ------------------------------------------------------------
create table if not exists public.deployments (
  id            uuid primary key default gen_random_uuid(),
  status        text not null default 'pending' check (status in ('pending','saving','sending','running','success','failed')),
  simulated     boolean not null default false,
  summary       jsonb not null default '{}'::jsonb,
  triggered_by  text,
  commit_ref    text,
  build_status  text,
  deploy_status text,
  error         text,
  snapshot      jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SITE META (public read) — one or more {key, value} rows.
-- value JSON: { version, lastUpdate, lastStatus, lastDeployAt, lastDeployStatus }
-- ------------------------------------------------------------
create table if not exists public.site_meta (
  key   text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- HELPER SQL FUNCTIONS (used by edge functions; never exposed)
-- ------------------------------------------------------------

-- bcrypt hash (server-side only — password material never leaves the DB layer)
create or replace function public.mc_hash_password(password text)
returns text language sql security definer set search_path = public stable as $$
  select crypt(password, gen_salt('bf', 10));
$$;

-- constant-time bcrypt verify (pgcrypto's crypt())
create or replace function public.mc_verify_password(password text, hash text)
returns boolean language sql security definer set search_path = public stable as $$
  select hash = crypt(password, hash);
$$;

-- RLS helpers
create or replace function public.mc_is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'admin';
$$;

create or replace function public.mc_student_id()
returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

-- updated_at trigger helper
create or replace function public.mc_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger classes_updated_at  before update on public.classes  for each row execute function public.mc_set_updated_at();
create trigger subjects_updated_at before update on public.class_subjects for each row execute function public.mc_set_updated_at();
create trigger students_updated_at before update on public.students for each row execute function public.mc_set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute function public.mc_set_updated_at();

-- ------------------------------------------------------------
-- AUDIT TRIGGER — automatically records admin data changes.
-- Action format: <table>_<INSERT|UPDATE|DELETE>
-- ------------------------------------------------------------
create or replace function public.mc_audit_trigger()
returns trigger language plpgsql as $$
declare
  who text := coalesce(auth.jwt() ->> 'username', auth.uid()::text, 'system');
  act text := upper(tg_table_name || '_' || tg_op);
  ent uuid := null;
begin
  if tg_op = 'DELETE' then ent := old.id; else ent := new.id; end if;
  insert into public.audit_logs (action, entity, entity_id, admin_username, details, success, ip)
  values (act, tg_table_name, ent, who, 'RLS audit: ' || tg_table_name || ' ' || lower(tg_op), true, current_setting('request.headers', true));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Audit-only tables (do NOT audit the audit log or lockout rows to avoid recursion/noise)
create trigger trg_audit_class_types    after insert or update or delete on public.class_types      for each row execute function public.mc_audit_trigger();
create trigger trg_audit_classes        after insert or update or delete on public.classes          for each row execute function public.mc_audit_trigger();
create trigger trg_audit_class_subjects after insert or update or delete on public.class_subjects   for each row execute function public.mc_audit_trigger();
create trigger trg_audit_students       after insert or update or delete on public.students         for each row execute function public.mc_audit_trigger();
create trigger trg_audit_marks          after insert or update or delete on public.marks            for each row execute function public.mc_audit_trigger();
create trigger trg_audit_announcements  after insert or update or delete on public.announcements    for each row execute function public.mc_audit_trigger();
create trigger trg_audit_ann_files      after insert or update or delete on public.announcement_files for each row execute function public.mc_audit_trigger();

-- admins are created only by bootstrap-admins / admin-security edge functions
create trigger trg_audit_admins         after insert or update or delete on public.admins           for each row execute function public.mc_audit_trigger();

-- ------------------------------------------------------------
-- Upgrade (idempotent) — new Result Manager fields on classes.
-- Safe to run repeatedly; existing databases pick up the new
-- columns without recreating the table.
-- ------------------------------------------------------------
alter table public.classes add column if not exists batch         text not null default '1st Year';
alter table public.classes add column if not exists incharge_name text;
alter table public.classes add column if not exists cr_name       text;

-- ------------------------------------------------------------
-- STORAGE — announcements bucket (public read, admin write).
-- Run policies.sql afterwards.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('announcements', 'announcements', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- SITE META seed
-- ------------------------------------------------------------
insert into public.site_meta (key, value)
values ('site', jsonb_build_object(
  'version', '4.0',
  'lastUpdate', null,
  'lastStatus', 'idle',
  'lastDeployAt', null,
  'lastDeployStatus', null
))
on conflict (key) do nothing;