/* ============================================================
   PAGE: settings — hub linking Tools / Admin / Debug / About
   ============================================================ */
'use strict';

function wireSettingsPage() {
  if (window.__settingsWired) return;
  window.__settingsWired = true;

  setupMobileSidebar();
}

function mountSettingsPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();
  setNavActive('settings');

  renderChatHistory();

  wireSettingsPage();
  fixLogoFallback();
}