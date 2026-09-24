# Setup Guide — Muslim College AI Study Agent (Secure Platform)

This project is a **hybrid architecture**:

| Layer | What it does | Where it lives |
| --- | --- | --- |
| **Frontend (shell)** | All screens: AI Agent, student portals, admin dashboard | GitHub Pages (this repo, static) |
| **Backend (data + auth)** | Postgres (results, announcements), RLS, Storage, Edge Functions | Supabase project |
| **Deploy pipeline** | "Update Website" → real GitHub Pages rebuild | GitHub Actions (`deploy.yml`) |

> Content (results / announcements) is served **live from the Supabase backend**, so daily
> data changes appear instantly and do **not** require a website rebuild. "Update Website"
> re-deploys/refreshes the static shell, records a deployment snapshot, and keeps history
> + rollback. See `ADMIN_GUIDE.md → Update Website` for the honest explanation.

---

## 1. Prerequisites

- A **GitHub account** with admin access to the repository (e.g. `abdulmohimin277/MuslimCollegeAI`).
- **Supabase CLI** (for deploys/secrets): <https://supabase.com/docs/guides/cli>
- Node.js 18+ (optional, only for local static server).

---

## 2. Create & configure the Supabase project

1. Go to <https://supabase.com> → **New project** → pick a region close to Multan (e.g. `ap-south-1`) → save the **Database password** and the **Project URL** + **anon (publishable) key** + **service_role key** from *Project Settings → API*.
2. Open **SQL Editor** and run the three scripts **in order**:
   - `supabase/schema.sql` — tables, indexes, bcrypt/PBKDF2 helpers, audit triggers
   - `supabase/policies.sql` — Row-Level Security (anon / student / admin)
   - `supabase/restore.sql` — protected atomic restore function + grants

   > All three are committed in this repo — you can paste their contents into the SQL editor and press **Run**. No secrets appear in them.

3. In **Project Settings → API**, copy the **JWT Secret**. It is the same secret the Edge Functions use to sign admin/student sessions (`MC_JWT_SECRET`).

---

## 3. Deploy the Edge Functions

From the repo root, with the Supabase CLI logged in to your project:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy admin-login student-login admin-security student-security \
    deploy deploy-webhook admin-data upload bootstrap-admins
```

Edge Functions contain the **only** code that touches credentials — nothing in the
frontend or firmware ever does.

---

## 4. Set server-side secrets (these NEVER go in the repo)

```bash
# Supabase Edge Function secrets — values are typed HERE, on your machine:
supabase secrets set \
  MASTER_ADMIN_USER="<MASTER_USERNAME>" \
  MASTER_ADMIN_PASS="<MASTER_PASSWORD>" \
  ADMIN_USER="<DEFAULT_ADMIN_USERNAME>" \
  ADMIN_PASS="<DEFAULT_ADMIN_PASSWORD>" \
  MC_BOOTSTRAP_KEY="<long-random-string>" \
  MC_JWT_SECRET="<your Supabase project JWT secret>" \
  GH_PAT="<GitHub Personal Access Token>" \
  GH_REPO="abdulmohimin277/MuslimCollegeAI" \
  DEPLOY_WEBHOOK_SECRET="<long-random-string>"

# Verify (values are masked by the CLI, but you can confirm the keys are set):
supabase secrets list
```

| Secret | Purpose | Notes |
| --- | --- | --- |
| `MASTER_ADMIN_USER` / `MASTER_ADMIN_PASS` | Master administrator (root) | **Never changeable from the panel.** Bcrypt-hashed in DB. |
| `ADMIN_USER` / `ADMIN_PASS` | Changeable daily admin | Changeable from the dashboard → *Admin/Security*. |
| `MC_BOOTSTRAP_KEY` | Key to run `bootstrap-admins` once | Generate: `openssl rand -hex 24` |
| `MC_JWT_SECRET` | Signs admin/student JWTs | Must equal Supabase project JWT secret (RLS compatibility). |
| `GH_PAT` | GitHub Personal Access Token for `repository_dispatch` | `repo` + `workflow` scopes, **fine-grained**, scoped only to this repo. |
| `GH_REPO` | `owner/repository` used by the deploy function | |
| `DEPLOY_WEBHOOK_SECRET` | Shared secret with GitHub Actions status callback | Generate: `openssl rand -hex 24`. Same value goes in a GitHub secret (below). |

**Make the master admin available:** after the functions are deployed and secrets are set,
bootstrap the admin accounts (this can also be repeated safely — it upserts):

```bash
curl -X POST "https://<projref>.supabase.co/functions/v1/bootstrap-admins" \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-key: <MC_BOOTSTRAP_KEY>" \
  -d '{}'
```

The response shows only **masked usernames + status** — raw credentials are never returned.

> If you later change the master credentials, re-run `supabase secrets set MASTER_ADMIN_USER/PASS` **and** re-run the curl above, then **restart** the Edge Functions (or re-deploy them) so fresh secrets are loaded.

---

## 5. Configure GitHub (deploy pipeline + Pages)

1. **Enable GitHub Pages** — repo *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. **Add repository secrets** (*Settings → Secrets and variables → Actions → New repository secret*):
   - `MC_WEBHOOK_URL` → `https://<projref>.supabase.co/functions/v1/deploy-webhook`
   - `MC_WEBHOOK_SECRET` → the **same** value you used for `DEPLOY_WEBHOOK_SECRET`
   - `SECRET_SCAN_PATTERNS` → an **alternation of your real secret values**, e.g. the actual value
     you set for master/admin (`<master_pass>|<master_user>|<admin_pass>` — substitute the real strings).
     The deploy workflow greps the artifact with this pattern and **aborts** the build on a match, so
     accidental credential commits can never be published. Keep **only** the real values in the secret;
     never paste them into any file in the repository (docs or code).
3. Create a **fine-grained Personal Access Token** (Profile → Developer settings → Fine-grained tokens) with:
   - Access: **only this repository**
   - Permissions: **Contents: Read & write**, **Workflows: Read & write**, **Metadata: Read (mandatory)**
   - Copy it into `GH_PAT` (Supabase secret) — it is *not* stored in GitHub.

---

## 6. Switch the frontend to production

Edit `site-config.js` (committed values are **public-safe** only):

```js
backend: 'supabase',
supabase: {
  url: 'https://<projref>.supabase.co',
  anonKey: 'eyJhbGciOi...', // anon / publishable key only
},
```

Commit + push — the live shell now talks to the secure backend. The anon key is
public **by design**; every admin and student operation is authorized server-side
(RLS + Edge Functions).

---

## 7. First login & verification

1. Open the site → **Admin Panel** → log in with `ADMIN_USER` / `ADMIN_PASS`.
2. *Admin/Security* tab → verify the master account is **greyed out** (not changeable).
3. *Activity Logs* → you should see `LOGIN_SUCCESS`, `BOOTSTRAP_ADMINS`, etc.
4. Add a class type → class → subjects → students → marks (see `ADMIN_GUIDE.md`).
5. Test a **student login** on the Result portal (set a student PIN first).

---

## 8. Routine operations

```bash
# Re-deploy Edge Functions after editing them:
supabase functions deploy admin-login student-login admin-security student-security \
    deploy deploy-webhook admin-data upload bootstrap-admins

# Check function logs:
supabase functions logs admin-login

# SQL editor is your friend for schema changes (always test RLS after changes).
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Admin login says *"Invalid username or password"* | Wrong `ADMIN_USER`/`ADMIN_PASS`, or `bootstrap-admins` not run after secrets changed |
| `MC_JWT_SECRET is not set` in logs | Secret missing — `supabase secrets set MC_JWT_SECRET=...` then re-deploy functions |
| Student portal reads fail | Student token missing (PIN not set), or student JWT secret ≠ project JWT secret |
| Update Website fails with *"GitHub dispatch failed (401)"* | `GH_PAT` scopes wrong or expired |
| Deploy status stuck at "running" | GitHub Actions run failed before webhook; check Actions tab, then rollback from dashboard |