-- ============================================================
-- MUSLIM COLLEGE AI — ROW-LEVEL SECURITY  (supabase/policies.sql)
-- ------------------------------------------------------------
-- Run AFTER schema.sql. Enforces, at the database level:
--   • ANON      → published announcements + files + site meta only
--   • STUDENT   → their own student row, their class, their marks
--   • ADMIN     → full CRUD on everything
--   • admins / login_attempts → NO REST access at all
--                (service-role edge functions only)
-- ============================================================

-- Turn on RLS everywhere -------------------------------------------------
alter table public.admins             enable row level security;
alter table public.class_types        enable row level security;
alter table public.classes            enable row level security;
alter table public.class_subjects     enable row level security;
alter table public.students           enable row level security;
alter table public.marks              enable row level security;
alter table public.announcements      enable row level security;
alter table public.announcement_files enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.login_attempts     enable row level security;
alter table public.deployments        enable row level security;
alter table public.site_meta          enable row level security;

-- ============================================================
-- CLASS TYPES (names are not sensitive — visible to admin, and
-- to logged-in students when their result embeds the type name)
-- ============================================================
drop policy if exists ct_admin_all on public.class_types;
create policy ct_admin_all on public.class_types
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists ct_student_read on public.class_types;
create policy ct_student_read on public.class_types
  for select using (public.mc_student_id() is not null);

-- ============================================================
-- CLASSES
-- ============================================================
drop policy if exists classes_admin_all on public.classes;
create policy classes_admin_all on public.classes
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists classes_student_own on public.classes;
create policy classes_student_own on public.classes
  for select using (
    id in (select class_id from public.students where id = public.mc_student_id())
  );

-- ============================================================
-- CLASS SUBJECTS
-- ============================================================
drop policy if exists subjects_admin_all on public.class_subjects;
create policy subjects_admin_all on public.class_subjects
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists subjects_student_own on public.class_subjects;
create policy subjects_student_own on public.class_subjects
  for select using (
    class_id in (select class_id from public.students where id = public.mc_student_id())
  );

-- ============================================================
-- STUDENTS
-- ============================================================
drop policy if exists students_admin_all on public.students;
create policy students_admin_all on public.students
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists students_owner_read on public.students;
create policy students_owner_read on public.students
  for select using (id = public.mc_student_id());

-- ============================================================
-- MARKS — students can ONLY read their own marks (never anyone else's)
-- ============================================================
drop policy if exists marks_admin_all on public.marks;
create policy marks_admin_all on public.marks
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists marks_owner_read on public.marks;
create policy marks_owner_read on public.marks
  for select using (student_id = public.mc_student_id());

-- ============================================================
-- ANNOUNCEMENTS — published & scheduled-not-yet-published are hidden
-- ============================================================
drop policy if exists ann_admin_all on public.announcements;
create policy ann_admin_all on public.announcements
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists ann_public_read on public.announcements;
create policy ann_public_read on public.announcements
  for select using (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (expiry_date is null or expiry_date >= now())
  );

-- ============================================================
-- ANNOUNCEMENT FILES — public can only see files of published announcements
-- ============================================================
drop policy if exists ann_files_admin_all on public.announcement_files;
create policy ann_files_admin_all on public.announcement_files
  for all using (public.mc_is_admin()) with check (public.mc_is_admin());

drop policy if exists ann_files_public_read on public.announcement_files;
create policy ann_files_public_read on public.announcement_files
  for select using (
    announcement_id in (
      select id from public.announcements
      where status = 'published'
        and (publish_at is null or publish_at <= now())
        and (expiry_date is null or expiry_date >= now())
    )
  );

-- ============================================================
-- AUDIT LOGS — admin read + insert only (webhook/edge write too)
-- ============================================================
drop policy if exists audit_admin_select on public.audit_logs;
create policy audit_admin_select on public.audit_logs
  for select using (public.mc_is_admin());

drop policy if exists audit_admin_insert on public.audit_logs;
create policy audit_admin_insert on public.audit_logs
  for insert with check (public.mc_is_admin());

-- ============================================================
-- SITE META — public read, admin read
-- ============================================================
drop policy if exists meta_public_read on public.site_meta;
create policy meta_public_read on public.site_meta
  for select using (true);

drop policy if exists meta_admin_read on public.site_meta;
create policy meta_admin_read on public.site_meta
  for select using (public.mc_is_admin());

-- ============================================================
-- DEPLOYMENTS — admin read (writing happens via edge functions
-- with the service role, never via REST)
-- ============================================================
drop policy if exists deployments_admin_read on public.deployments;
create policy deployments_admin_read on public.deployments
  for select using (public.mc_is_admin());

-- ============================================================
-- STORAGE — announcements bucket
--   public read, admin insert/update/delete
-- ============================================================
drop policy if exists storage_ann_read on storage.objects;
create policy storage_ann_read on storage.objects
  for select using (bucket_id = 'announcements');

drop policy if exists storage_ann_admin_all on storage.objects;
create policy storage_ann_admin_all on storage.objects
  for all using (bucket_id = 'announcements' and public.mc_is_admin())
  with check (bucket_id = 'announcements' and public.mc_is_admin());

-- ============================================================
-- NOTE: public.admins and public.login_attempts intentionally have
-- NO policies — they are unreachable through REST. Only edge
-- functions (service role) touch them.
-- ============================================================