/* ============================================================
   CONFIG — constants shared by every page
   ============================================================ */
'use strict';

// Admin panel credentials.
const ADMIN_USER = 'muslim college';
const ADMIN_PASS = 'muslim2004';

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