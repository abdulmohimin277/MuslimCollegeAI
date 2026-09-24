# Security Model & Checklist — Muslim College AI Study Agent

This document describes how the platform is secured, what is enforced
**server-side** (not in the browser), and a checklist you can verify before going live.

---

## Threat model (what we defend against)

| Threat | Protection |
| --- | --- |
| Credential theft from the public repo / deployed site | Credentials exist **only** in Supabase secrets (Edge Functions) — never in any committed file, JS, HTML, localStorage, or API response |
| Password brute force | bcrypt hashing + 5-fail / 15-minute lockout (`login_attempts`), per admin **and** per student |
| Student impersonation (guessing a roll number) | **Owner-approved design:** the public Result tab shows a result card from a roll number alone (batch + roll). Mitigations: results are served only by the `public-result` Edge Function (rate-limited ~20 req/min/IP) which returns **only card fields** — never PIN hashes, contact, admission, photos; raw tables stay RLS-locked and are not anon-readable. The optional per-student PIN flow (PBKDF2 + per-student JWT) is still implemented and can be re-enabled if desired |
| Reading other students' marks | RLS: a student JWT can only read **its own** student row / class / subjects / marks |
| Forging an admin session | JWTs signed with `MC_JWT_SECRET` (= Supabase project JWT secret), 8-hour expiry, verified server-side on every admin op |
| XSS stealing data | No session data in `localStorage`/`sessionStorage` — sessions live **in memory only**; all rendered text is escaped |
| Malicious uploads (executables / spoofed files) | Server-side MIME allowlist + **magic-byte signature check** + 8 MB limit + randomised storage path; scripts/executables rejected even with a fake `.jpg` name |
| Destructive mistakes (delete class / restore) | Frontend confirmation dialogs on every destructive action; backup export before restore; restore runs atomically in one SQL transaction |
| Deployment pipeline abuse / token leak | GitHub PAT lives only in `GH_PAT` secret; never sent to the browser; webhook callbacks authenticated by shared `DEPLOY_WEBHOOK_SECRET` |
| Data exfiltration via REST | Tables have RLS; `admins` and `login_attempts` have **no policies at all** (service-role functions only); helper hash functions are `REVOKE`d from `anon`/`authenticated` (see `restore.sql`) |

---

## Where each credential lives

```
<MASTER_USERNAME> / <MASTER_PASSWORD> ← Supabase secret (MASTER_ADMIN_USER/PASS)
                                              → bcrypt hash in public.admins (is_master)
<DEFAULT_ADMIN_USER> / <DEFAULT_ADMIN_PASS> ← Supabase secret (ADMIN_USER/PASS)
                                              → bcrypt hash in public.admins
<GH_PAT>                                    ← Supabase secret only (GH_PAT)
MC_JWT_SECRET                               ← Supabase secret (same as project JWT secret)
DEPLOY_WEBHOOK_SECRET                       ← Supabase secret + GitHub secret MC_WEBHOOK_SECRET
```

**None of these appear in the repository** — only the *names* of the environment
variables do (in docs/workflow files). The one-time `bootstrap-admins` Edge Function
hashes them with pgcrypto bcrypt before storing; raw values never touch the database.

---

## Server-side authorization (every admin operation)

1. Frontend sends `Authorization: Bearer <admin JWT>` to Edge Functions, or an admin
   JWT to PostgREST.
2. Edge Functions call `requireAdmin(req)` → HS256 signature + expiry + `role=admin` claim.
3. PostgREST applies `mc_is_admin()` inside every RLS policy — a student token or anon
   token physically **cannot** read/write admin data even if the frontend is bypassed.
4. `audit_logs` is written by Postgres triggers (`mc_audit_trigger`) *and* by Edge
   Functions — so tampering with the UI cannot hide activity.

### Session rules
- Admin sessions: **8 hours**; Student sessions: **12 hours**; memory-only (tab close = logged out).
- Logout simply discards the in-memory token; expiry is enforced server-side by the JWT `exp`.
- No refresh tokens are stored in the browser — a new login is required.

### Rate limiting / lockout
- 5 consecutive failed attempts → locked for **15 minutes** (`login_attempts` table, server-side).
- Lockout applies to admin (`adm:<username>`) and the optional student PIN login (`stu:<roll>`) independently.
- Public result lookups (`public-result`) are limited to **20 requests per minute per IP**
  (best-effort, in-memory) to slow bulk roll-number scraping.
- The lock message itself is rate-limited to one audit entry per attempt.

---

## Input validation & sanitization

- Every field is length-capped server-side (`.slice(0, N)`), trimmed, and type-checked
  before touching the database.
- Marks are coerced to integers and clamped by `CHECK (obtained >= 0)` and
  `obtained <= total` is enforced by the frontend calculator + RLS `WITH CHECK`.
- Announcement bodies are stored as plain text and rendered **escaped**
  (`escapeHtml`) — HTML/script in user content cannot execute.
- Roll numbers are digit-normalised; optional PINs are length-checked (4–32) then hashed.
- `public-result` validates `batch` against an allowlist and `roll` to digits only before querying.

---

## File upload policy (server-enforced)

| Rule | Value |
| --- | --- |
| Max size | 8 MB (actual decoded bytes, not the client's claim) |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, MS Office (doc/docx/xls/xlsx/ppt/pptx), `text/plain`, `video/mp4`, `video/webm` |
| Signature check | Magic bytes must match the declared MIME (JPEG/PNG/GIF/WebP/PDF/ZIP/MP4/WebM headers) |
| Blocked | `.exe .bat .cmd .com .msi .ps1 .vbs .js .sh .scr .dll .apk .jar .html .php .py` … even if renamed |
| Storage path | Random UUID — client can never choose/overwrite paths (no traversal) |

---

## Audit coverage

| Event | Where recorded |
| --- | --- |
| Admin login success / fail / lock | Edge function → `audit_logs` |
| Student PIN login (optional flow, if enabled) success / fail / lock | Edge function → `audit_logs` |
| Public result lookups (batch + roll) | **Not audited by design** — no roll-number/PII retention in logs for lookups; only rate-limit violations are counted (in-memory) |
| Any data change (classes, students, marks, announcements, files) | Postgres trigger → `audit_logs` |
| Credential change attempts (success *and* denied) | Edge function → `audit_logs` |
| Deployment trigger / finish / rollback | Edge function → `audit_logs` |
| Export / restore | Edge function → `audit_logs` |

---

## Pre-launch security checklist

Run through this before going live:

- [ ] `schema.sql`, `policies.sql`, `restore.sql` all executed; `select relrowsecurity from pg_class` shows RLS **on** for every app table.
- [ ] `supabase secrets list` shows all required keys; none are blank.
- [ ] `supabase secrets set MC_JWT_SECRET=...` value matches the **project JWT secret** (Settings → API).
- [ ] `bootstrap-admins` ran successfully (masked usernames returned).
- [ ] `site-config.js` has `backend: 'supabase'` + real URL + **anon** key only (never service_role).
- [ ] GitHub secrets `MC_WEBHOOK_URL` / `MC_WEBHOOK_SECRET` set; Pages source = **GitHub Actions**.
- [ ] Repo-wide search returns **zero** matches for your master username and password:
      GitHub → Code → search the repo for the literal master password; also run locally
      (substitute your **real** values — never commit them):
      `grep -rEi "<MASTER_USERNAME>|<MASTER_PASSWORD>|<DEFAULT_ADMIN_PASS>" .` → must be empty
      (the About page's historical years 1994/2000/2004/2010 are **not** credentials — they are college-history dates).
- [ ] GitHub repository secret `SECRET_SCAN_PATTERNS` is set to an alternation of your real
      values (see `SETUP.md`); the deploy workflow's "Validate no secrets are shipped" step passes.
- [ ] `admin-login` returns 401 for wrong credentials, and the 6th attempt returns **429** (locked).
- [ ] `deploy-webhook` returns **401** without the `x-deploy-secret` header.
- [ ] `bootstrap-admins` returns **401** without a valid bootstrap key / master JWT.
- [ ] Result tab: entering a roll number for **1st Year** returns cards only for 1st Year students (any class); the same roll in **Second Year** only returns Second Year matches; unknown rolls show "No result found".
- [ ] Uploading a renamed `.exe` (e.g. `photo.jpg` that is actually a PE file) is rejected with *"contents do not match its declared type"*.
- [ ] Browser DevTools → Application → no credentials in `localStorage`/`sessionStorage` after login.
- [ ] Function logs contain **no** raw passwords/PINs (`supabase functions logs`).
- [ ] GitHub deploy workflow's "Validate no secrets are shipped" step passes.

---

## Known limitations (honest notes)

- **GitHub Pages is static.** The HTML/CSS/JS shell cannot be dynamically "secured" per
  user; security comes entirely from the backend. Content edits (results, announcements)
  are live from Supabase immediately — they do **not** need a Pages rebuild.
- **"Update Website" re-deploys the committed shell.** It cannot deploy changes you have
  not committed/pushed yet; the dashboard warns you to push first.
- **Rollback restores data, not arbitrary past HTML.** The deployment snapshot captures
  the content tables (results/announcements) so a mistaken content change can be reverted
  from the dashboard. Reverting the *static shell* means `git revert` + push (documented
  in `ADMIN_GUIDE.md → Rollback`).
- **Demo mode (`backend: 'local'`) is a sandbox.** It runs entirely in your browser with
  PBKDF2 in-browser hashing and a clearly-labelled simulated deploy so the whole UI can be
  tested without Supabase — it is *not* production security.
- **Client-side guards are UX, not security.** Every check in the frontend is duplicated
  server-side (RLS + Edge Functions).