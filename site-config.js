/* ============================================================
   SITE CONFIG — PUBLIC, SAFE-TO-COMMIT runtime configuration.
   ------------------------------------------------------------
   Contains ONLY values that may be exposed to the browser:

     • backend mode: 'local' (offline demo) | 'supabase' (production)
     • a Supabase project URL + anon/publishable key.
       (The anon key is DESIGNED to be public — all security lives
       in Postgres Row-Level Security + server-side Edge Functions.)
     • public feature flags and version info.

   NEVER put any of the following in this file (or any other file
   served to the browser):
     • MASTER admin username/password
     • Default/changeable admin password
     • GitHub Personal Access Tokens
     • Supabase SERVICE_ROLE keys
     • Any private API key

   Those belong in protected server-side secrets:
     Supabase secrets (supabase secrets set ...) and
     GitHub repository secrets (Settings → Secrets and variables).
   ============================================================ */
'use strict';

window.SITE_CONFIG = {
  /* 'local'  → fully working OFFLINE DEMO on this device using
                an in-browser sandbox store. Clearly labelled DEMO.
     'supabase' → production backend (auth, Postgres, storage,
                GitHub deploy trigger). Requires a Supabase project
                to be configured — see SETUP.md. */
  backend: 'local',

  supabase: {
    url: '',        // e.g. https://xxxx.supabase.co
    anonKey: '',    // e.g. eyJhbGciOi... (public anon key only)
  },

  /* GitHub repository used by the UPDATE WEBSITE workflow.
     The Token itself is NEVER here — the Edge Function reads it
     from a Supabase secret. */
  github: {
    owner: 'abdulmohimin277',
    repo: 'MuslimCollegeAI',
    workflowRef: 'main',
    eventType: 'mc-deploy',
  },

  features: {
    resultPortal: true,
    announcements: true,
    adminDashboard: true,
    updateWebsite: true,
    exportBackup: true,
  },

  appVersion: '4.0',
  buildDate: '2026-09-24',
};