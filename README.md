# Muslim College AI Study Agent

A pure **JavaScript** study assistant for Muslim College students — powered by the **Google Gemini API**. 100% HTML + CSS + JS (no Flutter, no Dart, no frameworks), styled in a clean **white & blue** theme matching the Muslim College logo. Works as a website, as an installable **PWA**, and as a native Android **APK**.

## How to Run

| Way | Instructions |
| --- | --- |
| **Website** | Open `index.html` in any modern browser (Chrome, Edge, Firefox). |
| **Local server** | `python -m http.server 8080` then open `http://localhost:8080` (needed for voice input / service worker). |
| **Installable web app (PWA)** | Serve over HTTP(S), click **Install App** in the sidebar (or the browser's install icon). |
| **Android app (.apk)** | Install `Muslim-College-Study-Agent.apk` on any Android phone (allow "install unknown apps"). |

## Features

- **Student login** — Name, Roll Number & Gemini API Key
- **AI Study Agent** — answers study questions with clearly formatted revision notes (Gemini API). The agent wears the **Muslim College logo** as its avatar.
- **Voice Input** — tap the mic and speak your question (Web Speech API in Chrome / Edge).
- **Smart Model Rotation** — every question tries the newest model first; if a model fails (no access, empty answer, timeout, quota, server or network error) the app rotates to the next working model automatically.
- **Professional white & blue UI** — consistent design system, flat surfaces, clean typography, no clutter.
- **System Tools** — install as app, clear local data, app status.
- **Admin Panel** (password protected) — activity logs, overview, model rotation tests.
- **Debug & API Diagnostics** — single-model test, list models, test all models, raw API response viewer.
- **Save answer as PDF** and **copy any answer**.
- **Session persistence** — login & chat history stay in the browser's local storage (private, no servers).
- **PWA** — installable, works offline after first load.
- **Native Android APK** — hosted in a WebView, installable and runnable like a regular app.

## Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key (starts with `AIza...`)
3. Paste it into the app on the Login screen

## Project Files

| File / Folder | Purpose |
| ---- | ------- |
| `index.html` | Single-page app: home / AI Agent / Result portal / Announcements / Admin Dashboard |
| `site-config.js` | Public runtime config — backend mode (`local` demo vs `supabase`), Supabase URL + anon key, GitHub repo info, feature flags (contains NO secrets) |
| `css/` | Design system: `base.css`, `components.css`, `login.css`, `layout.css`, `chat.css`, `pages.css`, `responsive.css` plus `admin.css`, `result.css`, `announcements.css`, `print.css` |
| `js/config.js` | Public constants (app version, Gemini models, storage keys) — **no credentials** |
| `js/security.js` | Client-side hygiene helpers; PBKDF2 hashing used only by the local demo sandbox |
| `js/backend.js` | Backend facade — selects the active adapter (local demo or Supabase) |
| `js/backend-local.js` | Demo adapter: in-browser sandbox store, clearly labelled DEMO |
| `js/backend-supabase.js` | Production adapter: Edge Function auth, PostgREST + RLS, Storage, deploy trigger |
| `js/state.js`, `js/utils.js`, `js/api.js`, `js/chat.js`, `js/pdf.js`, `js/pwa.js`, `js/auth.js`, `js/ui.js`, `js/debug.js`, `js/modals.js`, `js/router.js` | Shared app logic (chat, model rotation, PDF, PWA, diagnostics, routing) |
| `js/admin-dashboard.js` | Admin Dashboard: lock screen, tabs, security, audit, export/restore, Update Website + rollback |
| `js/result-mgmt.js`, `js/view-result.js`, `js/announcement-mgmt.js`, `js/view-announcements.js` | Result & announcement management + student portal views |
| `js/pages/*.js` | Per-page initialisation & event wiring |
| `supabase/` | Backend: `schema.sql`, `policies.sql`, `restore.sql` + Edge Functions (`admin-login`, `student-login`, `admin-security`, `student-security`, `deploy`, `deploy-webhook`, `admin-data`, `upload`, `bootstrap-admins`) |
| `.github/workflows/deploy.yml` | "Update Website" → rebuild GitHub Pages + status webhook |
| `assets/logo.png`, `manifest.webmanifest`, `sw.js` | PWA install support |
| `android/` | Native Android APK project (WebView wrapper) |

## Documentation

| Doc | What it covers |
| --- | --- |
| [`SETUP.md`](SETUP.md) | Full production setup: Supabase project, SQL scripts, Edge Functions, server secrets, GitHub Actions + Pages |
| [`SECURITY.md`](SECURITY.md) | Security model, threat table, credential handling, server-side authorization, upload policy, audit coverage, pre-launch checklist, honest limitations |
| [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) | Admin dashboard how-tos: results, announcements, security, audit, backup/restore, Update Website + rollback |

## Admin Credentials

There are **no admin credentials in this repository or in the deployed frontend** — by
design. The master administrator and the changeable admin are created server-side from
protected environment secrets and stored as bcrypt hashes in the backend database.

- To get your accounts: follow [`SETUP.md`](SETUP.md) → sections 4 (server secrets) and 5
  (bootstrap).
- To change the daily admin login later: Admin Panel → **Admin / Security** (the master
  account is never changeable from the panel).
- In **local demo mode** (`site-config.js` → `backend: 'local'`) the dashboard shows a
  clearly-labelled, browser-only "first run" administrator form so you can try the whole
  UI offline before connecting Supabase.
- If you find legacy hard-coded credentials in old copies inside this repo
  (`MuslimCollegeAI-main/`, `backup/`), those are deprecated leftovers and are excluded
  from deployment — see the deploy workflow cleanup step.

## Building the APK (optional)

The `android/` folder is a self-contained Android project. To rebuild the APK you need Java 17+ and the Android SDK:

1. Set `ANDROID_HOME` to your SDK path (e.g. `C:\Users\...\AppData\Local\Android\Sdk`).
2. Run: `gradle -p android assembleDebug`
3. The APK is output at `android/app/build/outputs/apk/debug/app-debug.apk`.

The app shell files are copied into the APK automatically on every build.

## Tech

- HTML5, CSS3, Vanilla JavaScript
- Google Gemini REST API (`generativelanguage.googleapis.com`)
- Optional: jsPDF CDN (falls back to print-to-PDF if offline)
- Android WebView (Java, no extra dependencies)

## Credits

Made by **Abdul-Mohimin** & **Haider Ijaz**, directed by **Mr Anis Rao** — for Muslim College students.