/* ============================================================
   PAGE: announcements — student Announcement portal (read-only).
   ============================================================ */
'use strict';

function wireAnnouncementsPage() {
  if (window.__announcementsWired) return;
  window.__announcementsWired = true;

  setupMobileSidebar();
}

function mountAnnouncementsPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();
  setNavActive('announcements');

  renderChatHistory();
  wireAnnouncementsPage();
  StudentAnnouncementView.mount($('#student-announcement-root'));
  fixLogoFallback();
}