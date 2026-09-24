# Admin Guide — Muslim College AI Study Agent

Everything an administrator can do, step by step. There is **one fixed administrator
account** — username **Muslim College Multan**, password fixed in the code/configuration
(see `README.md` → Admin Credentials and `SETUP.md`). The dashboard is at **Admin →
Admin Dashboard**.

---

## 1. First login

1. Open the site → **Admin Panel** → you land on the dashboard **lock screen**.
2. Sign in with the **fixed administrator account** — username `Muslim College Multan`
   and the fixed password (set in `js/backend-local.js` in demo mode, or the
   `FIXED_ADMIN_PASS` secret in production; see `SETUP.md`). There is **no** "create
   admin" form — the single account is pre-configured.

> 5 wrong attempts lock the account for 15 minutes (server-enforced).

---

## 2. Dashboard tabs

| Tab | What's inside |
| --- | --- |
| **Overview** | Key stats (classes, students, announcements, deploy status) + quick actions |
| **Result** | Drill-down flow: **batch (1st Year / Second Year) → classes → students → marks → results** |
| **Announcement** | Create/edit/publish announcements with validated file attachments (image/video/document) |
| **Admin / Security** | **Fixed administrator account** info (never changeable from the panel); session info |
| **Activity Logs** | Auto-recorded audit trail (logins, data changes, deploys, exports) |
| **AI / Diagnostics** | Gemini model rotation tests, connection tests (kept from the original app) |
| **Settings** | Backend mode info, app version, data export/backup/restore |
| **Update Website** | Real deploy workflow + history + rollback |

---

## 3. Results — full workflow

The Result tab is organised as a **drill-down**:

```
Result tab
  ├── 1st Year                    (batch card)
  │     └── "+ Add New Class"  →  class cards
  │            └── click a class → class detail (incharge, CR, subjects, students)
  │                  └── "+ Add New Student" → click "Marks" on a student
  └── Second Year                 (batch card, same flow)
  (top search box: enter a student roll no → opens their marks sheet directly)
```

**3.1 Batches**
Opening **Result** shows two batch cards: **1st Year** and **Second Year** (with class
and student counts). Click a batch to open its classes.

**3.2 Class types** (Medical, ICS, Pre Engineering, DIT, I.Com, FA IT, …)
From the batch home, use **Manage class types** → add / rename / delete a type. You can
also create a new type **inside** the Add Class form (choose "+ New class type…"). Delete
is blocked while classes are attached.

**3.3 Add New Class**
Inside a batch, click **"+ Add New Class"** and fill:
- **Class name** (e.g. "FSc Pre-Engineering"), **Class type** (or create one on the fly)
- **Incharge name** (class teacher / incharge)
- **CR name** (class representative)
- **Session / Year** (e.g. "2025-2026")
- **Subjects** — add each subject name with **total marks** and **passing marks**
  (e.g. Physics, Total 75, Passing 26). These drive the marks sheet and pass/fail
  calculation. Duplicate class names (same session) are rejected.

**3.4 Class detail**
Click a class card to open it: you see its **type, batch, session, incharge, CR** and
counts, plus buttons for **Edit Class**, **Manage Subjects** (add/rename/remove subjects
any time), **Class Result** and **Delete Class**. Below is the **student list** with a
search box for that class.

**3.5 Add New Student**
In the class detail, click **"+ Add New Student"**: roll number (digits), student name,
father name, class (pre-set), gender, date of birth, contact, admission info, notes.
After saving, you may optionally use the **PIN** button on the student row — the public
Result view no longer needs a PIN (see §3.8).

**3.6 Marks entry + auto-calc**
Open a student via the **Marks** button in their row, or type their **roll number** in
the roll search box at the top of the Result tab. All subjects of the class appear with
obtained-mark inputs; the sheet auto-computes total, percentage, per-subject pass/fail
and a running total. **Save Marks** upserts per subject; blank/non-numeric input is
clamped.

**3.7 Class result view**
Class detail → **Class Result** → table with Sr / Roll / Name / Total / Obtained / % /
Result. **Search + sort** by roll / name / percentage, **Print**, **PDF** (jsPDF; falls
back to the print dialog offline) and **Download CSV**. Click **Result Card** on any row
for the printable single-student card.

**3.8 Student portal (Result tab)**

On the homepage **Result** tab a visitor first picks a batch — **1st Year** or
**Second Year** — then enters a **roll number**. The portal searches **every class of
that batch** (any class type) and instantly shows the matching student's **result card**
with **Print / Download PDF / Copy** options. **No login and no PIN** — the roll number
alone is enough. If two students in different classes share a roll number, every match
is shown, each labelled with its class. A blue result card appears only when a student
with that roll exists in the chosen batch; otherwise a "No result found" message is shown
with options to retry or switch batch.

The card shows roll number, name, father name, class, class type, batch, session, all
subjects with total/obtained/percentage/grade/status, overall percentage + grade, and the
final **Pass / Fail** verdict.

> **Note:** the optional student **PIN** (set per student) is no longer required to view
> results — by design the public Result view is roll-number based (rate-limited on the
> live backend).

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

- There is **one fixed administrator account** — username **Muslim College Multan** with a
  fixed password. The panel shows this account's info but provides **no way to change
  credentials** (the change form was removed by design).
- To change the credentials you must edit the code/configuration:
  - **Demo mode:** edit the `FIXED_ADMIN_USER` / `FIXED_ADMIN_PASS` constants in
    `js/backend-local.js`.
  - **Production:** edit the `FIXED_ADMIN_USER` / `FIXED_ADMIN_PASS` Supabase secrets
    (`supabase secrets set …`) and re-run `bootstrap-admins` (see `SETUP.md → section 4`).
    This is intentionally the *only* path — attempts from the panel are denied and logged.
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
| Manage class types | Result home → Manage class types |
| Add class | Batch view → + Add New Class |
| Configure subjects | Class detail → Manage Subjects |
| Add student | Class detail → + Add New Student |
| Set student PIN *(optional)* | Class detail → student row → PIN |
| Enter marks | Class detail → student row → Marks, **or** top roll-number search |
| Class result + print/PDF | Class detail → Class Result |
| Single student result card | Class detail → student row → Result |
| Announcement | Announcement tab |
| Change admin credentials | **Not possible from the panel** — edit `js/backend-local.js` (demo) or `FIXED_ADMIN_USER`/`FIXED_ADMIN_PASS` secrets + `bootstrap-admins` (production) |
| Read audit trail | Activity Logs |
| Backup / restore | Settings |
| Deploy / history / rollback | Update Website |
| Demo mode info | Settings → backend mode (clearly labelled DEMO) |