/* ============================================================
   PAGE: login — wires the login form and pre-fills saved values
   ============================================================ */
'use strict';

function prefillLogin() {
  const savedName = readLS(KEYS.name, '');
  const savedRoll = readLS(KEYS.roll, '');
  const savedKey = readLS(KEYS.key, '');
  const nameInput = $('#name-input');
  const rollInput = $('#roll-input');
  const apiInput = $('#api-input');
  if (savedName && nameInput) nameInput.value = savedName;
  if (savedRoll && rollInput) rollInput.value = savedRoll;
  if (savedKey && apiInput) apiInput.value = savedKey;
}

function wireLoginPage() {
  if (window.__loginWired) return;
  window.__loginWired = true;

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    login();
  });

  $('#toggle-key').addEventListener('click', () => {
    const input = $('#api-input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}

function mountLoginPage() {
  prefillLogin();
  wireLoginPage();

  const keyEl = $('#api-input');
  if (keyEl && !keyEl.value.trim()) keyEl.focus();

  fixLogoFallback();
}