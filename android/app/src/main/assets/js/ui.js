/* ============================================================
   UI — model/status labels + shared input behaviour
   ============================================================ */
'use strict';

function updateAgentModelLabel() {
  const el = $('#agent-model-label');
  if (el) el.textContent = activeGeminiModel;
  const statusModel = $('#status-model');
  if (statusModel) statusModel.textContent = activeGeminiModel;
  const adminModel = $('#admin-active-model');
  if (adminModel) adminModel.textContent = activeGeminiModel;
  const pill = $('#model-pill-btn');
  if (pill) pill.setAttribute('aria-label', 'Active model: ' + activeGeminiModel);
  $$('.model-option').forEach((o) => {
    o.classList.toggle('active', o.dataset.model === activeGeminiModel);
  });
}

// Fills + wires the model picker dropdown next to the header model pill.
// Idempotent: builds the menu once, but re-runs on every agent mount.
function setupModelDropdown() {
  const pill = $('#model-pill-btn');
  const menu = $('#model-menu');
  if (!pill || !menu) return;

  if (menu.dataset.built) return;
  menu.dataset.built = '1';

  const label = document.createElement('div');
  label.className = 'model-menu-label';
  label.textContent = 'Choose a model';
  menu.appendChild(label);

  const gsvg =
    '<svg class="google-g" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>' +
    '<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>' +
    '<path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>' +
    '<path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>' +
    '</svg>';

  geminiModels.forEach((m) => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'model-option';
    opt.dataset.model = m;
    opt.innerHTML = '<span class="model-opt-icon">' + gsvg + '</span><span class="model-opt-name"></span>';
    opt.querySelector('.model-opt-name').textContent = m;
    opt.addEventListener('click', () => {
      activeGeminiModel = m;
      persistModel();
      updateAgentModelLabel();
      closeModelMenu();
      toast('Model set to ' + m, 'success');
    });
    menu.appendChild(opt);
  });

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = menu.hidden;
    closeModelMenu();
    if (wasHidden) {
      menu.hidden = false;
      pill.setAttribute('aria-expanded', 'true');
    }
  });

  document.addEventListener('click', () => closeModelMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModelMenu();
  });
}

function closeModelMenu() {
  const menu = $('#model-menu');
  const pill = $('#model-pill-btn');
  if (menu) menu.hidden = true;
  if (pill) pill.setAttribute('aria-expanded', 'false');
}

function updateToolsStatus() {
  const questions = chatMessages.filter((m) => m.sender === 'user').length;
  const sm = $('#status-model');
  const sq = $('#status-questions');
  const ss = $('#status-student');
  if (sm) sm.textContent = activeGeminiModel;
  if (sq) sq.textContent = String(questions);
  if (ss) ss.textContent = studentName ? studentName + ' (' + studentRoll + ')' : '—';
}

function autoResizeInput() {
  const ta = $('#chat-input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
}

// Renders the ChatGPT-style "Previous chats" list into the sidebar.
function renderChatHistory() {
  const list = $('#chat-history');
  if (!list) return;
  const chats = getChats();
  const active = currentChatId;
  if (!chats.length) {
    list.innerHTML = '<div class="history-empty">No previous chats yet.</div>';
    return;
  }
  list.innerHTML = '';
  chats.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'history-item' + (c.id === active ? ' active' : '');
    item.innerHTML =
      '<a class="history-link" href="#/agent?chat=' + encodeURIComponent(c.id) + '" title="' + escHTML(c.title) + '">' +
        '<span class="history-icon">' +
          '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18h13M7 12h13M7 6h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>' +
        '</span>' +
        '<span class="history-txt">' + escHTML(c.title) + '</span>' +
      '</a>' +
      '<button class="history-del" type="button" title="Delete chat" data-id="' + escHTML(c.id) + '">' +
        '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button>';
    list.appendChild(item);
  });
  if (!list._historyBound) {
    list._historyBound = true;
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.history-del');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        deleteChat(btn.dataset.id);
      }
    });
  }
}

// Marks the matching sidebar nav-item active for the current page.
function setNavActive(page) {
  $$('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === page);
  });
}

// Sidebar toggle (used on every dashboard page).
// Mobile: opens the slide-in drawer. Desktop: collapses/expands the
// sidebar (ChatGPT-style). Idempotent — binds once.
function setupMobileSidebar() {
  if (window.__mobileSidebarBound) return;
  window.__mobileSidebarBound = true;

  const toggles = $$('.sidebar-toggle');
  const shell = $('#app-shell');
  const isDesktop = () => window.innerWidth >= 769;

  const syncState = (expanded) => {
    toggles.forEach((b) => b.setAttribute('aria-expanded', String(expanded)));
  };

  // Restore a saved desktop "collapsed" preference on load.
  if (isDesktop() && readLS(KEYS.sidebar, 'open') === 'collapsed' && shell) {
    shell.classList.add('sidebar-collapsed');
  }

  toggles.forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      if (!shell) return;
      if (isDesktop()) {
        const collapsed = shell.classList.toggle('sidebar-collapsed');
        writeLS(KEYS.sidebar, collapsed ? 'collapsed' : 'open');
        syncState(!collapsed);
      } else {
        const open = shell.classList.toggle('sidebar-open');
        syncState(open);
      }
    });
  });

  const backdrop = $('#sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      shell.classList.remove('sidebar-open');
      syncState(false);
    });
  }

  $$('.nav-item[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (shell) shell.classList.remove('sidebar-open');
      syncState(false);
    });
  });

  // Shared sidebar controls live on every dashboard page.
  const installBtn = $('#install-btn');
  if (installBtn) installBtn.addEventListener('click', installApp);
  const logoutBtn = $('#logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
}