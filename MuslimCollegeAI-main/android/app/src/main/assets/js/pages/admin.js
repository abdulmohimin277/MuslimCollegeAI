/* ============================================================
   PAGE: admin — locked admin control panel
   ============================================================ */
'use strict';

function wireAdminPage() {
  if (window.__adminWired) return;
  window.__adminWired = true;

  setupMobileSidebar();

  $('#admin-unlock-btn').addEventListener('click', loginAdmin);
  $('#admin-lock-btn').addEventListener('click', lockAdmin);
  $('#toggle-admin-pass').addEventListener('click', () => {
    const input = $('#admin-pass');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('#admin-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      loginAdmin();
    }
  });
  $('#admin-user').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      loginAdmin();
    }
  });
  $('#refresh-logs-btn').addEventListener('click', refreshLogs);
  $('#admin-clear-logs-btn').addEventListener('click', () => {
    clearChat();
    refreshLogs();
  });
  $('#admin-test-rotation-btn').addEventListener('click', adminTestRotation);
  $('#logout-btn').addEventListener('click', logout);
}

function mountAdminPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();

  const saved = loadChat();
  chatMessages = saved && saved.length ? saved : [];

  adminUnlocked = readLS(KEYS.admin, '') === 'yes';

  renderChatHistory();
  renderAdmin();
  wireAdminPage();
  fixLogoFallback();
}