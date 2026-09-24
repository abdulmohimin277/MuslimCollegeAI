/* ============================================================
   PAGE: debug — diagnostics & raw API viewer
   ============================================================ */
'use strict';

function fillDebugModelSelect() {
  const select = $('#debug-model');
  if (!select) return;
  if (select.childElementCount) return;
  geminiModels.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
  select.value = geminiModels[0];
}

function wireDebugPage() {
  if (window.__debugWired) return;
  window.__debugWired = true;

  setupMobileSidebar();

  fillDebugModelSelect();
  $('#debug-key').value = globalApiKey;

  $('#test-conn-btn').addEventListener('click', testConnection);
  $('#list-models-btn').addEventListener('click', listModels);
  $('#test-all-models-btn').addEventListener('click', testAllModels);
  $('#copy-result-btn').addEventListener('click', copyResult);
  $('#last-chat-btn').addEventListener('click', showLastChatRaw);
  $('#logout-btn').addEventListener('click', logout);
}

function mountDebugPage() {
  if (!ensureLogin()) return;
  restoreSharedState();

  populateStudent();

  renderChatHistory();
  wireDebugPage();
  fixLogoFallback();
}