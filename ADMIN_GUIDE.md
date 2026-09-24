# Admin Guide — Muslim College AI Study Agent

Everything an administrator can do, step by step. The master + default admin accounts
are bootstrapped **server-side** (see `SETUP.md`). The dashboard is at **Admin → Admin
Dashboard**.

---

## 1. First login

1. Open the site → **Admin Panel** → you land on the dashboard **lock screen**.
2. In **Supabase (production)** mode there is no "create admin" form — the accounts come
   from `bootstrap-admins`. Sign in with `ADMIN_USER` / `ADMIN_PASS` (set during setup).
3. In **local demo** mode (before setup, `backend: 'local'`), the first run shows
   *"Create Administrator"* — a clearly-labelled demo-only form so you can try the whole
   UI offline.

> 5 wrong attempts lock the account for 15 minutes (server-enforced).

---

## 2. Dashboard tabs

| Tab | What's inside |
| --- | --- |
| **Overview** | Key stats (classes, students, announcements, deploy status) + quick actions |
| **Result** | Full management: class types → classes → subjects → students → marks → class result view |
| **Announcement** | Create/edit/publish announcements with validated file attachments (image/video/document) |
| **Admin / Security** | Change the **changeable** admin credentials (master is locked); session info |
| **Activity Logs** | Auto-recorded audit trail (logins, data changes, deploys, exports) |
| **AI / Diagnostics** | Gemini model rotation tests, connection tests (kept from the original app) |
| **Settings** | Backend mode info, app version, data export/backup/restore |
| **Update Website** | Real deploy workflow + history + rollback |

---

## 3. Results — full workflow

**3.1 Class types** (Medical, ICS, Pre Engineering, DIT, I.Com, FA IT, …)
Result → Class Types → **Add** a type (e.g. "B.Sc"). Rename or delete (delete is blocked
while classes are attached).

**3.2 Classes**
Result → Classes → **Add class** (name + session + type, e.g. "1st Year", "Session 2025–26").
Duplicates (same name + session) are rejected.

**3.3 Subjects (per class)**
Select a class → **Subjects** → add/rename/remove, set **total marks**, **passing marks**,
and **order**. Example: Physics (Total 75, Passing 26). These drive the marks sheet and
the pass/fail calculation.

**3.4 Students (full profile)**
Result → Students → **Add / Edit**:
- Roll number (digits), name, father name, class, session, gender, date of birth,
  contact, admission info, notes, **photo** (URL).
- Search by name / father / roll; filter by class & session; sort columns.

**3.5 Marks entry + auto-calc**
Open a student → **Marks** → enter obtained marks per subject. The sheet auto-computes:
- total marks, obtained total, **percentage**, and **Result** (Pass / Fail per subject
  and overall).
- Marks are saved per subject (upsert); blank or non-numeric input is clamped.

**3.6 Class result view**
Result → **View Class** → table with Sr / Roll / Name / Total / Obtained / % / Result.
- **Search + sort + filter** by pass/fail, roll, name, obtained range.
- **Print**, **PDF** (jsPDF; falls back to print dialog offline), **Download CSV**.

**3.7 Student portal**
Set a student's **PIN** (Result → Students → PIN button) — PINs are PBKDF2-hashed
server-side. The student then logs in on **Result** from the homepage with **roll number
+PIN** and sees only **their own** result card. Logging in with a roll number alone is
impossible.

> All destructive actions (delete class/subject/student/announcement/file) show a
> **confirmation dialog** first.

---

## 4. Announcements

Announcement tab:
- **New announcement**: title, body, date, expiry date, priority (High/Normal/Low),
  category, and **status** (`draft` / `published` / `scheduled` with publish-at).
- **Files**: attach image / video / document (validated: 8 MB max, allowlist + signature
  check — see `SECURITY.md`). Preview before saving.
- **Publish/unpublish/schedule** from the list; scheduled items appear automatically
  when the publish-at time passes (read via RLS `publish_at <= now()`).
- Students see only published, non-expired announcements (read-only portal on the
  homepage **Announcements**).

---

## 5. Admin / Security

- Change **username + password** for the changeable admin.
  Requires the **current password**; new password ≥ 4 chars; username ≥ 3 chars;
  the new username must not clash.
- The **master account** is displayed but **cannot be changed from the panel** — it is
  only modified via protected server configuration (`SETUP.md → section 4`, then re-run
  `bootstrap-admins`).
- All attempts (including denied ones) appear in Activity Logs.

---

## 6. Activity Logs

Read-only audit trail with: action, entity, admin, details, success/failure, IP, and
timestamp. Written automatically by database triggers for data changes and by edge
functions for logins/deploys/export. No log entry contains raw passwords or PINs.

---

## 7. Export / backup / restore

Settings tab:
- **Export**: downloads a full JSON backup (classes, subjects, students, marks,
  announcements, files metadata) — keep it off-device.
- **Restore**: upload a previously exported JSON. Runs **atomically** server-side
  (`mc_restore_data`, one SQL transaction) — a failed restore never leaves a half-written
  database. Confirmation dialog explains that current data will be replaced.

> Tip: export before every big session and before any restore.

---

## 8. Update Website (real workflow)

1. **Update Website** tab → **Deployment summary** shows counts of what changed since the
   last deployment (classes, students, marks, announcements, files).
2. **Deployment summary → Confirm** → the `deploy` Edge Function:
   - records a deployment with a **full content snapshot**,
   - calls GitHub `repository_dispatch` (`mc-deploy`) using the server-side `GH_PAT`,
   - GitHub Actions rebuilds/re-uploads GitHub Pages, then calls back the
     `deploy-webhook` Edge Function with the shared `DEPLOY_WEBHOOK_SECRET`.
3. **Status is live**: the dashboard polls and shows `sending → running → success/failed`
   plus build/deploy status and commit ref.
4. **Deployment history**: every run is listed (who triggered it, when, status, commit).
5. **Rollback**: pick a past deployment → **Rollback** → restores that deployment's
   **content snapshot** (results/announcements) atomically. This is data-level rollback;
   reverting the *static shell* is done with `git revert` + push (see below).

### Honest limits
- The shell deploys **only committed & pushed** files — the dashboard says "Push your
  changes first" when the repo is ahead.
- Rollback restores **data**, not arbitrary past HTML (the workflow cannot resurrect an
  unpublished page).
- To fully revert a bad shell change: `git log`, `git revert <commit>`, push, then
  re-run **Update Website**.

---

## 9. AI / Diagnostics & Settings

- **AI / Diagnostics** keeps the original admin features: model rotation test, single
  model test, list models, connection tests.
- **Settings** shows backend mode (`local` demo vs `supabase`), app version/build date,
  and the export/restore tools.

---

## 10. Quick reference

| Task | Where |
| --- | --- |
| Add class type | Result → Class Types → Add |
| Add class | Result → Classes → Add |
| Configure subjects | Result → Class → Subjects |
| Add student / set PIN | Result → Students → Add / PIN |
| Enter marks | Result → Students → Marks |
| Class result + print/PDF | Result → View Class |
| Announcement | Announcement tab |
| Change own credentials | Admin/Security |
| Read audit trail | Activity Logs |
| Backup / restore | Settings |
| Deploy / history / rollback | Update Website |
| Demo mode info | Settings → backend mode (clearly labelled DEMO) |