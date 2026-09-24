/* ============================================================
   ADMIN — diagnostics helpers (rotation tests + activity logs).
   ------------------------------------------------------------
   NOTE: The old plaintext-credential admin login has been removed.
   Admin sessions are now created by the secure backend
   (js/backend.js) and managed by js/admin-dashboard.js.
   These helpers are reused by the new Admin Dashboard's
   "AI / Diagnostics" and "Overview" tabs.
   ============================================================ */
'use strict';

function refreshLogs() {
  const logs = $('#logs-text');
  if (!logs) return;

  const fallbackNote =
    activeGeminiModel !== PRIMARY_MODEL
      ? ' (auto-rotated from ' + PRIMARY_MODEL + ')'
      : '';
  const questions = chatMessages.filter((m) => m.sender === 'user').length;

  let historyText = '';
  if (rotationHistory.length) {
    historyText = '\n\n--- Recent model rotation log ---\n';
    rotationHistory.slice(0, 8).forEach((h) => {
      const mark = h.ok ? '[OK]' : '[FAIL]';
      historyText += mark + ' ' + h.model + ' → ' + (h.reason || ('HTTP ' + h.status)) + '\n';
    });
  } else {
    historyText = '\n\n(No rotations happened yet.)';
  }

  logs.textContent =
    'Logged User: ' + (studentName || 'N/A') + ' | Roll: ' + (studentRoll || 'N/A') + '\n' +
    'Status: Connected to ' + activeGeminiModel + fallbackNote + '\n' +
    'Total Questions: ' + questions + '\n' +
    'Models tried (newest → oldest): ' + geminiModels.join(', ') +
    historyText;
}

async function adminTestRotation() {
  const box = $('#admin-rotation-result');
  if (!box) return;
  const btn = $('#admin-test-rotation-btn');
  if (!globalApiKey.trim()) {
    box.innerHTML = '<div class="rot-item err">No API key found. Login with an API key first.</div>';
    return;
  }

  btn.disabled = true;
  box.innerHTML = '<div class="rot-item"> Testing ' + geminiModels.length + ' models…</div>';

  const results = [];
  for (const model of geminiModels) {
    box.innerHTML =
      '<div class="rot-item"> Testing <b>' + safeHtml(model) + '</b> …</div>';

    const r = await pingOneModel(model);
    results.push(r);

    const item = document.createElement('div');
    item.className = 'rot-item ' + (r.ok ? 'ok' : 'err');
    item.innerHTML =
      '<b>' + safeHtml(model) + '</b>' +
      '<span class="rot-ms">' + (r.ok && r.ms ? r.ms + 'ms' : '') + '</span>' +
      '<span class="rot-status">' + safeHtml(r.reason || 'OK') + '</span>';
    box.appendChild(item);
  }

  const okCount = results.filter((r) => r.ok).length;
  if (okCount === results.length) {
    toast('All ' + results.length + ' models responded OK!', 'success');
  } else if (okCount > 0) {
    toast(okCount + ' of ' + results.length + ' models OK — rotation works.', '');
  } else {
    toast('No model responded. Check your API key / network.', 'error');
  }

  btn.disabled = false;
}