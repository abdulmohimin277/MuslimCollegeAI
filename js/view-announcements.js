/* ============================================================
   VIEW — student Announcement portal (read-only).
   ============================================================ */
'use strict';

const StudentAnnouncementView = (() => {
  async function mount(rootEl) {
    if (!rootEl) return;
    try {
      const list = await Backend.listAnnouncementsPublic();
      renderList(rootEl, list);
    } catch (e) {
      rootEl.innerHTML =
        '<div class="ann-empty">Could not load announcements: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function renderList(rootEl, list) {
    if (!list || !list.length) {
      rootEl.innerHTML = '<div class="ann-empty">No announcements right now. Check back soon.</div>';
      return;
    }
    const cards = list
      .map((a) => {
        const media = a.files && a.files.length
          ? filePreview(a.files[0])
          : '<div class="ann-media"><span class="no-media">Announcement</span></div>';
        const priority = a.priority || 'normal';
        const priorityLabel = priority === 'high' ? 'High' : priority === 'low' ? 'Low' : 'Normal';
        return (
          '<button class="ann-card" type="button" data-annid="' + escHTML(a.id) + '">' +
            '<div class="ann-media">' + media + '</div>' +
            '<div class="ann-body">' +
              '<div class="ann-title">' + escHTML(a.title) + '</div>' +
              '<div class="ann-cat">' + escHTML(a.category || 'General') + ' · ' + fmtDate(a.date) + '</div>' +
              '<div class="ann-foot">' +
                '<span class="pill priority ' + escHTML(priority) + '">' + priorityLabel + '</span>' +
                '<span>' + (a.files ? a.files.length : 0) + ' attachment(s)</span>' +
              '</div>' +
            '</div>' +
          '</button>'
        );
      })
      .join('');
    rootEl.innerHTML =
      '<div class="ann-grid">' + cards + '</div>' +
      '<div class="ann-empty" style="margin-top:14px">Announcements are read-only. Contact the college office to request changes.</div>';

    rootEl.querySelectorAll('.ann-card').forEach((card) => {
      card.addEventListener('click', () => openDetail(rootEl, card.dataset.annid));
    });
  }

  function filePreview(f) {
    if (!f) return '';
    if (f.kind === 'image') {
      const src = f.data || f.url || f.storage_path || '';
      return src ? '<img src="' + escHTML(src) + '" alt="" loading="lazy" onerror="this.parentNode.innerHTML=\'<span class=no-media>Image</span>\'" />' : '<span class="no-media">📷</span>';
    }
    if (f.kind === 'video') return '<span class="no-media">🎬 Video</span>';
    return '<span class="no-media">📄 ' + escHTML(f.name || 'Document') + '</span>';
  }

  async function openDetail(rootEl, id) {
    try {
      const a = await Backend.getAnnouncementPublic(id);
      renderDetail(rootEl, a);
    } catch (e) {
      toast(e.message || 'Could not open announcement.', 'error');
      mount(rootEl);
    }
  }

  function renderDetail(rootEl, a) {
    const files = a.files || [];
    const mediaHtml = files
      .map((f) => {
        const src = f.data || f.url || '';
        if (f.kind === 'image' && src) {
          return '<div style="margin:10px 0"><img class="ann-media-big" src="' + escHTML(src) + '" alt="' + escHTML(f.name) + '" loading="lazy" /></div>';
        }
        if (f.kind === 'video' && src) {
          return '<div style="margin:10px 0"><video class="ann-video" controls src="' + escHTML(src) + '"></video></div>';
        }
        return '';
      })
      .join('');

    const fileChips = files
      .filter((f) => f.kind === 'document' || f.kind === 'image' || f.kind === 'video')
      .map((f) => {
        const href = f.data || f.url || '#';
        const onClick = f.data
          ? ''
          : 'target="_blank" rel="noopener"';
        return (
          '<a class="file-chip" href="' + escHTML(href) + '" ' + onClick + ' download="' + escHTML(f.name || 'file') + '">' +
            '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            escapeHtml(f.name || 'Download file') +
          '</a>'
        );
      })
      .join('');

    const priorityLabel = a.priority === 'high' ? 'High' : a.priority === 'low' ? 'Low' : 'Normal';

    rootEl.innerHTML =
      '<button class="back-link" id="ann-back-btn" type="button">' +
        '<svg class="ic ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
        'Back to announcements' +
      '</button>' +
      '<div class="ann-detail" style="margin-top:10px">' +
        '<div class="ad-head">' +
          '<div class="ad-meta">' +
            '<span class="pill priority ' + escHTML(a.priority || 'normal') + '">' + priorityLabel + '</span>' +
            '<span>' + escapeHtml(a.category || 'General') + '</span>' +
            '<span>' + fmtDateTime(a.date) + '</span>' +
            (a.expiryDate ? '<span>Expires: ' + fmtDate(a.expiryDate) + '</span>' : '') +
          '</div>' +
          '<div class="ad-title">' + escapeHtml(a.title) + '</div>' +
        '</div>' +
        mediaHtml +
        (a.body ? '<div class="ad-body">' + escapeHtml(a.body) + '</div>' : '') +
        (fileChips ? '<div class="ad-files">' + fileChips + '</div>' : '') +
        '<div class="ad-actions">' +
          '<button class="btn outline sm" id="ann-copy-btn" type="button">Copy Text</button>' +
          '<button class="btn outline sm" id="ann-print-btn" type="button">Print</button>' +
        '</div>' +
      '</div>';

    $('#ann-back-btn').addEventListener('click', () => mount(rootEl));
    $('#ann-copy-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(a.title + '\n\n' + (a.body || ''));
        toast('Announcement text copied!', 'success');
      } catch (e) {
        toast('Could not copy automatically.', 'error');
      }
    });
    $('#ann-print-btn').addEventListener('click', () => {
      const html =
        '<div class="print-card">' +
          '<div class="pc-head"><h1>MUSLIM COLLEGE</h1><div class="pc-title">Announcement</div></div>' +
          '<div class="pc-info">' +
            '<span><span class="k">Title:</span> ' + escHTML(a.title) + '</span>' +
            '<span><span class="k">Date:</span> ' + fmtDateTime(a.date) + '</span>' +
            '<span><span class="k">Category:</span> ' + escHTML(a.category || 'General') + '</span>' +
            '<span><span class="k">Priority:</span> ' + priorityLabel + '</span>' +
          '</div>' +
          (a.body ? '<div style="margin:10px 0; font-size:10.5pt; white-space:pre-wrap">' + escHTML(a.body) + '</div>' : '') +
          '<div class="pc-foot"><span>Muslim College, Multan</span><span>Printed ' + fmtDate(new Date().toISOString()) + '</span></div>' +
        '</div>';
      let area = document.getElementById('print-area');
      if (!area) {
        area = document.createElement('div');
        area.id = 'print-area';
        document.body.appendChild(area);
      }
      area.innerHTML = html;
      window.print();
    });
  }

  return { mount };
})();