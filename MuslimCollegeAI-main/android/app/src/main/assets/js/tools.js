/* ============================================================
   PAGE: tools — install app, clear data, app status
   ============================================================ */
'use strict';

function wireToolsPage() {
  setupMobileSidebar();

  $('#shortcut-btn').addEventListener('click', installApp);
  $('#clear-btn').addEventListener('click', clearData);
  $('#install-btn').addEventListener('click', installApp);
  $('#logout-btn').addEventListener('click', logout);
}

function initToolsPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();

  const saved = loadChat();
  chatMessages = saved && saved.length ? saved : [];

  renderChatHistory();
  updateToolsStatus();

  wireToolsPage();
  fixLogoFallback();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', initToolsPage);