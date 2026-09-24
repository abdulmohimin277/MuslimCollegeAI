/* ============================================================
   PAGE: result — student Result portal (read-only).
   ============================================================ */
'use strict';

function wireResultPage() {
  if (window.__resultWired) return;
  window.__resultWired = true;

  setupMobileSidebar();
}

function mountResultPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();
  setNavActive('result');

  renderChatHistory();
  wireResultPage();
  StudentResultView.mount($('#student-result-root'));
  fixLogoFallback();
}