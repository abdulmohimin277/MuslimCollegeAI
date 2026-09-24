/* ============================================================
   ENTRY (index.html) — boots the SPA.
   The router picks the starting route (agent when a session
   exists, otherwise login) and swaps every view in place, so
   navigation never reloads the page.
   ============================================================ */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  SPA.start();
});