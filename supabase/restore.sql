-- ============================================================
-- MUSLIM COLLEGE AI — RESTORE + FUNCTION GRANTS  (supabase/restore.sql)
-- ------------------------------------------------------------
-- Run AFTER schema.sql and policies.sql (e.g. in the SQL editor).
--
-- 1) mc_restore_data(jsonb) — atomic restore used ONLY by the
--    `admin-data` / `deploy` Edge Functions (service role).
-- 2) REVOKEs — helper SQL functions are stripped of public
--    REST access. Only service-role Edge Functions may call them.
-- ============================================================

-- ------------------------------------------------------------
-- ATOMIC CONTENT RESTORE
-- (used for export/restore and deployment rollback; truncates and
--  re-inserts content tables in FK-safe order inside ONE transaction)
-- ------------------------------------------------------------
create or replace function public.mc_restore_data(data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  empty jsonb := '[]'::jsonb;
begin
  if data is null or jsonb_typeof(data) <> 'object' then
    raise exception 'mc_restore_data: data must be a JSON object keyed by table name';
  end if;

  -- 1) clear children first (dependency order)
  truncate table public.marks              cascade;
  truncate table public.announcement_files cascade;
  truncate table public.class_subjects     cascade;
  truncate table public.students           cascade;
  truncate table public.classes            cascade;
  truncate table public.class_types        cascade;
  truncate table public.announcements      cascade;

  -- 2) restore parents first
  insert into public.class_types (id, name, created_at)
    select (x.id)::uuid, x.name, coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(data->'class_types', empty))
      as x(id text, name text, created_at timestamptz);

  insert into public.classes (id, name, class_type_id, session, created_at, updated_at)
    select (x.id)::uuid, x.name, (x.class_type_id)::uuid, x.session,
           coalesce(x.created_at, now()), coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(data->'classes', empty))
      as x(id text, name text, class_type_id text, session text,
           created_at timestamptz, updated_at timestamptz);

  insert into public.class_subjects (id, class_id, name, total_marks, passing_marks, sort_order, created_at, updated_at)
    select (x.id)::uuid, (x.class_id)::uuid, x.name,
           coalesce(x.total_marks, 100), coalesce(x.passing_marks, 33), coalesce(x.sort_order, 0),
           coalesce(x.created_at, now()), coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(data->'class_subjects', empty))
      as x(id text, class_id text, name text, total_marks int, passing_marks int,
           sort_order int, created_at timestamptz, updated_at timestamptz);

  insert into public.students (id, serial_number, roll_number, name, father_name, class_id,
                               session, gender, dob, contact, admission_info, notes,
                               photo_url, pin_hash, pin_salt, pin_iterations, created_at, updated_at)
    select (x.id)::uuid, x.serial_number, x.roll_number, x.name, x.father_name, (x.class_id)::uuid,
           x.session, x.gender, x.dob, x.contact, x.admission_info, x.notes,
           x.photo_url, x.pin_hash, x.pin_salt, coalesce(x.pin_iterations, 10000),
           coalesce(x.created_at, now()), coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(data->'students', empty))
      as x(id text, serial_number int, roll_number text, name text, father_name text,
           class_id text, session text, gender text, dob text, contact text,
           admission_info text, notes text, photo_url text, pin_hash text,
           pin_salt text, pin_iterations int, created_at timestamptz, updated_at timestamptz);

  insert into public.marks (id, student_id, class_subject_id, total_marks, obtained_marks, updated_at)
    select (x.id)::uuid, (x.student_id)::uuid, (x.class_subject_id)::uuid,
           coalesce(x.total_marks, 100), coalesce(x.obtained_marks, 0),
           coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(data->'marks', empty))
      as x(id text, student_id text, class_subject_id text,
           total_marks int, obtained_marks int, updated_at timestamptz);

  insert into public.announcements (id, title, body, date, expiry_date, priority, category,
                                    status, publish_at, created_at, updated_at)
    select (x.id)::uuid, x.title, x.body, coalesce(x.date, now()), x.expiry_date,
           coalesce(x.priority, 'normal'), x.category, coalesce(x.status, 'draft'), x.publish_at,
           coalesce(x.created_at, now()), coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(data->'announcements', empty))
      as x(id text, title text, body text, date timestamptz, expiry_date timestamptz,
           priority text, category text, status text, publish_at timestamptz,
           created_at timestamptz, updated_at timestamptz);

  insert into public.announcement_files (id, announcement_id, kind, name, mime, size, storage_path, created_at)
    select (x.id)::uuid, (x.announcement_id)::uuid, x.kind, x.name, x.mime, coalesce(x.size, 0),
           x.storage_path, coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(data->'announcement_files', empty))
      as x(id text, announcement_id text, kind text, name text, mime text,
           size int, storage_path text, created_at timestamptz);
end;
$$;

-- ------------------------------------------------------------
-- REVOKE public REST access from every helper function.
-- Policies still work (they evaluate inside queries); only the
-- REST surface is closed. Edge Functions use service_role.
-- ------------------------------------------------------------
revoke execute on function public.mc_restore_data(jsonb)         from anon, authenticated;
grant  execute on function public.mc_restore_data(jsonb)         to   service_role;

revoke execute on function public.mc_hash_password(text)         from anon, authenticated;
grant  execute on function public.mc_hash_password(text)         to   service_role;

revoke execute on function public.mc_verify_password(text, text) from anon, authenticated;
grant  execute on function public.mc_verify_password(text, text) to   service_role;

-- NOTE: mc_is_admin / mc_student_id MUST remain executable by anon
-- and authenticated — they are called inside RLS policy expressions
-- during normal SELECT/INSERT/UPDATE/DELETE evaluation. They are
-- harmless to expose (anon always gets false/null from them).