/* ============================================================
   PAGE: tools — install app, clear data, app status
   ============================================================ */
'use strict';

function wireToolsPage() {
  if (window.__toolsWired) return;
  window.__toolsWired = true;

  setupMobileSidebar();

  $('#shortcut-btn').addEventListener('click', installApp);
  $('#clear-btn').addEventListener('click', clearData);
}

function mountToolsPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();

  const saved = loadChat();
  chatMessages = saved && saved.length ? saved : [];

  renderChatHistory();
  updateToolsStatus();

  wireToolsPage();
  fixLogoFallback();
}