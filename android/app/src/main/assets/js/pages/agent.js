/* ============================================================
   PAGE: agent — the AI chat dashboard
   ============================================================ */
'use strict';

function wireAgentPage() {
  if (window.__agentWired) return;
  window.__agentWired = true;

  setupMobileSidebar();

  $('#send-btn').addEventListener('click', sendMessage);
  $('#mic-btn').addEventListener('click', toggleVoice);
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $('#chat-input').addEventListener('input', autoResizeInput);
  $('#save-pdf-btn').addEventListener('click', savePdf);
  $('#clear-chat-btn').addEventListener('click', clearChat);
  $('#new-chat-btn').addEventListener('click', (e) => {
    e.preventDefault();
    SPA.go('agent', { new: '1' });
  });
}

function mountAgentPage(params) {
  if (!ensureLogin()) return;

  restoreSharedState();

  params = params || {};
  const wantNew = params.new === '1';
  const chatId = params.chat || null;

  populateStudent();

  // ?new=1 → fresh conversation; ?chat=<id> → that saved conversation.
  if (wantNew) {
    chatMessages = [];
    currentChatId = null;
    removeLS(KEYS.current);
  } else {
    const saved = loadChat(chatId);
    chatMessages = saved && saved.length ? saved : [];
  }

  updateHome(chatMessages.length === 0);
  renderChat();
  renderChatHistory();
  setupModelDropdown();
  updateAgentModelLabel();
  updatePdfBar();

  wireAgentPage();

  // Already installed? Hide the install button when running as an app.
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (standalone) {
    appInstalled = true;
    showInstallButton(false);
  }

  fixLogoFallback();
  autoResizeInput();
}