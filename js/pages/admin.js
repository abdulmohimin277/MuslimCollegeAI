/* ============================================================
   PAGE: admin — locked admin dashboard (secure session only).
   The heavy lifting lives in js/admin-dashboard.js (lock screen,
   sections, security, audit, AI diagnostics, export/restore,
   UPDATE WEBSITE).
   ============================================================ */
'use strict';

function wireAdminPage() {
  if (window.__adminWired) return;
  window.__adminWired = true;

  setupMobileSidebar();
}

function mountAdminPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();
  setNavActive('admin');

  renderChatHistory();
  wireAdminPage();
  AdminDashboard.mount();
  fixLogoFallback();
}