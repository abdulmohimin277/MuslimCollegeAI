/* ============================================================
   CONFIG — constants shared by every page
   ============================================================ */
'use strict';

// ============================================================
// SECURITY: Admin credentials are NEVER defined in frontend code.
// Admin authentication now happens against the secure backend
// (js/backend.js → Supabase Auth in production). Nothing here is
// a credential. The master credential & default admin credential
// live only in protected server-side secrets (see SETUP.md).
// ============================================================

// App / site version constants (public only).
const APP_VERSION = (window.SITE_CONFIG && SITE_CONFIG.appVersion) || '4.0';
const BUILD_DATE = (window.SITE_CONFIG && SITE_CONFIG.buildDate) || '';

// Gemini chat models to try, newest → oldest.
// The app automatically rotates to the next model whenever the
// current model does NOT give a proper response (404 / no access /
// empty answer / timeout / quota / server error / network failure).
const geminiModels = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-omni-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
];

const PRIMARY_MODEL = geminiModels[0];

// Session / data persistence keys (localStorage).
const KEYS = {
  name: 'mc_name',
  roll: 'mc_roll',
  key: 'mc_key',
  chat: 'mc_chat',
  chats: 'mc_chats',
  current: 'mc_current',
  admin: 'mc_admin',
  model: 'mc_model',
  debug: 'mc_debug',
  rotation: 'mc_rotation',
  last: 'mc_last_answer',
  sidebar: 'mc_sidebar',
};