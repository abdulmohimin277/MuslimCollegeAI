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
| `index.html` | Entry — routes to the AI Agent or login page |
| `login.html` | Student login (name, roll no, API key) |
| `agent.html` | AI Agent chat page |
| `tools.html` | Tools page (install app, clear data, status) |
| `admin.html` | Admin panel page |
| `debug.html` | Debug & API diagnostics page |
| `settings.html` | Settings hub (links to Tools / Admin / Debug / About) |
| `about.html` | About / Privacy / Terms page |
| `css/` | Design system split into files: `base.css` (reset + tokens + icons), `components.css` (forms, buttons, modal, toast), `login.css`, `layout.css` (sidebar), `chat.css` (agent UI), `pages.css` (tools/admin/about), `responsive.css` |
| `app.js` | Entry redirector |
| `js/config.js` | Constants (admin credentials, Gemini models, storage keys) |
| `js/state.js` | Shared runtime state + cross-page persistence |
| `js/utils.js` | DOM / storage / toast / debug helpers |
| `js/api.js` | Gemini API + smart model rotation |
| `js/chat.js` | Chat rendering, voice input, send flow, multi-chat history |
| `js/pdf.js` | Save answer as PDF |
| `js/pwa.js` | PWA install + service worker |
| `js/auth.js` | Login / logout / session handling |
| `js/ui.js` | Status labels + sidebar chat history + shared UI behaviours |
| `js/admin.js` | Admin panel logic |
| `js/debug.js` | Debug connection tests |
| `js/pages/*.js` | Per-page initialisation & event wiring |
| `assets/logo.png` | App logo |
| `manifest.webmanifest`, `sw.js` | PWA install support |
| `android/` | Native Android APK project (WebView wrapper) |

## Admin Credentials

- Username: `muslim college`
- Password: `muslim2004`

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