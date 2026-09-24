/* ============================================================
   MODALS — alert / confirm / prompt + generic modal used by the
   admin dashboard and student views (reuses the app modal styles).
   ============================================================ */
'use strict';

function openModal(html, opts) {
  opts = opts || {};
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay mc-modal';
  overlay.id = opts.id || ('modal-' + Date.now());
  overlay.innerHTML =
    '<div class="modal-card" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
        '<h2>' + escapeHtml(opts.title || '') + '</h2>' +
        '<button type="button" class="icon-btn ghost modal-close" title="Close">' +
          '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="modal-body">' + html + '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('modal-close')) closeModal(overlay);
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      closeModal(overlay);
      document.removeEventListener('keydown', esc);
    }
  });
  return overlay;
}

function closeModal(overlay) {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

/** Promise-based confirm dialog. Returns true/false. */
function confirmDialog(message, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const overlay = openModal(
      '<p class="confirm-text">' + escapeHtml(message) + '</p>' +
      '<div class="btn-row confirm-actions">' +
        '<button type="button" class="btn outline sm confirm-cancel">' + escapeHtml(opts.cancelText || 'Cancel') + '</button>' +
        '<button type="button" class="btn ' + (opts.danger ? 'danger' : 'primary') + ' sm confirm-ok">' + escapeHtml(opts.okText || 'Confirm') + '</button>' +
      '</div>',
      { title: opts.title || 'Please confirm', id: 'confirm-modal' }
    );
    overlay.querySelector('.confirm-ok').addEventListener('click', () => {
      closeModal(overlay);
      resolve(true);
    });
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
      closeModal(overlay);
      resolve(false);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
        resolve(false);
      }
    });
  });
}

/** Promise-based alert. */
function alertDialog(message, title) {
  return new Promise((resolve) => {
    const overlay = openModal(
      '<p class="confirm-text">' + escapeHtml(String(message)) + '</p>' +
      '<div class="btn-row confirm-actions">' +
        '<button type="button" class="btn primary sm confirm-ok">OK</button>' +
      '</div>',
      { title: title || 'Notice' }
    );
    overlay.querySelector('.confirm-ok').addEventListener('click', () => {
      closeModal(overlay);
      resolve(true);
    });
  });
}

/** Promise-based prompt. Returns value or null when cancelled. */
function promptDialog(message, defValue, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const overlay = openModal(
      '<p class="confirm-text">' + escapeHtml(message) + '</p>' +
      '<input type="' + escapeHtml(opts.type || 'text') + '" class="panel-input" id="prompt-value" value="' + escapeHtml(defValue == null ? '' : String(defValue)) + '" />' +
      '<div class="btn-row confirm-actions">' +
        '<button type="button" class="btn outline sm confirm-cancel">Cancel</button>' +
        '<button type="button" class="btn primary sm confirm-ok">' + escapeHtml(opts.okText || 'OK') + '</button>' +
      '</div>',
      { title: opts.title || 'Enter value' }
    );
    const input = overlay.querySelector('#prompt-value');
    input.focus();
    const done = (val) => {
      closeModal(overlay);
      resolve(val);
    };
    overlay.querySelector('.confirm-ok').addEventListener('click', () => done(input.value));
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => done(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value);
    });
  });
}