/* ============================================================
   UTILS — DOM + storage + debug helpers
   ============================================================ */
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(text, kind) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = text;
  t.className = 'toast show ' + (kind || '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.className = 'toast';
  }, 3200);
}

function safeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : String(text);
  return d.innerHTML;
}

// HTML-escapes a value for use inside attribute quotes (uses &quot; not &#34;).
function escHTML(text) {
  return safeHtml(text)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fixLogoFallback() {
  document.querySelectorAll('.logo-circle img, .agent-avatar img, .brand-logo img, .nav-logo img, .model-dot img, .home-logo img').forEach((img) => {
    img.onerror = () => {
      img.style.display = 'none';
    };
  });
}

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* storage unavailable — ignore */
  }
}

function removeLS(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

/* ---------- Chat history (multi-chat, ChatGPT-style) ---------- */

function chatsKey(id) {
  return 'mc_chat_' + id;
}

function getChats() {
  try {
    const raw = localStorage.getItem(KEYS.chats);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveChats(list) {
  try {
    localStorage.setItem(KEYS.chats, JSON.stringify(list.slice(0, 100)));
  } catch (e) {
    /* ignore */
  }
}

function readChatMessages(id) {
  try {
    const raw = localStorage.getItem(chatsKey(id));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
}

// Permanently deletes a stored conversation (sidebar history).
function deleteChat(id) {
  try {
    removeLS(chatsKey(id));
    saveChats(getChats().filter((c) => c.id !== id));
    if (currentChatId === id) {
      currentChatId = null;
      removeLS(KEYS.current);
    }
    renderChatHistory();
    toast('Chat deleted', 'success');
  } catch (e) {
    /* ignore */
  }
}

function recordDebug(url, statusCode, body, localError, model) {
  debug.url = url || '';
  debug.statusCode = statusCode || 0;
  debug.body = (body || '').trim();
  debug.localError = localError || '';
  debug.model = model || activeGeminiModel;
  persistDebug();
}

function debugSummary() {
  const lines = [];
  lines.push('Model: ' + (debug.model || '(none)'));
  lines.push('URL: ' + (debug.url || '(none)'));
  lines.push(
    'HTTP STATUS: ' +
      (debug.statusCode === 0 ? 'N/A (no response)' : debug.statusCode)
  );
  lines.push('RAW RESPONSE BODY:');
  lines.push(debug.body ? debug.body : '(empty response body)');
  if (debug.localError) {
    lines.push('');
    lines.push('LOCAL ERROR: ' + debug.localError);
  }
  return lines.join('\n');
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = 'Copy'), 1600);
    }
    toast('Copied to clipboard!', 'success');
  } catch (e) {
    toast('Could not copy automatically. Select the text manually.', 'error');
  }
}