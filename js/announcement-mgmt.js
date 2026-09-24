/* ============================================================
   ADMIN — Announcement Management
   (create / edit / publish / schedule / preview / delete and
   validated file attachments for TEXT, IMAGE, VIDEO, DOCUMENT).
   ============================================================ */
'use strict';

const AnnouncementMgmt = (() => {
  const STATUS_LABEL = { draft: 'Draft', published: 'Published', scheduled: 'Scheduled' };

  /* ---------------- list ---------------- */
  async function renderAnnouncements() {
    const wrap = $('#ann-admin-list');
    if (!wrap) return;
    try {
      const list = await Backend.listAnnouncementsAdmin();
      if (!list.length) {
        wrap.innerHTML =
          '<div class="empty-state"><div class="es-title">No announcements yet</div>' +
          'Create your first announcement so it can appear on the students\u2019 portal.</div>';
        return;
      }
      wrap.innerHTML = list
        .map((a) => {
          const statusCls = 'pill ' + (a.status === 'published' ? 'published' : a.status === 'scheduled' ? 'scheduled' : 'draft');
          const now = Date.now();
          const autoNote =
            a.status === 'scheduled' && a.publishAt
              ? ' · publishes ' + fmtDateTime(a.publishAt)
              : a.status === 'published' && a.expiryDate && new Date(a.expiryDate).getTime() < now
                ? ' · <span class="er">expired</span>'
                : '';
          const fileCount = (a.files || []).length;
          return (
            '<div class="ann-admin-card" data-annid="' + escHTML(a.id) + '">' +
              '<div class="aac-head">' +
                '<div class="aac-title"><strong>' + escapeHtml(a.title) + '</strong>' +
                  '<span class="pill ' + escHTML(a.priority || 'normal') + '">' + escHTML((a.priority || 'normal')) + '</span>' +
                  '<span class="' + statusCls + '">' + (STATUS_LABEL[a.status] || a.status) + '</span>' +
                  '<span class="aac-cat">' + escapeHtml(a.category || 'General') + '</span>' +
                '</div>' +
                '<div class="aac-actions">' +
                  '<button class="btn outline sm" data-act="preview" type="button">Preview</button> ' +
                  '<button class="btn outline sm" data-act="edit" type="button">Edit</button> ' +
                  '<button class="btn outline sm" data-act="publish" type="button">' + (a.status === 'published' ? 'Unpublish' : 'Publish') + '</button> ' +
                  '<button class="btn danger sm" data-act="delete" type="button">Delete</button>' +
                '</div>' +
              '</div>' +
              '<div class="aac-meta">' +
                '<span>' + fmtDateTime(a.date) + '</span>' +
                (a.expiryDate ? '<span>Expires ' + fmtDate(a.expiryDate) + '</span>' : '') +
                '<span>' + fileCount + ' file(s)</span>' +
                (a.body ? '<span class="aac-snippet">' + escapeHtml(String(a.body).slice(0, 90)) + (a.body.length > 90 ? '…' : '') + '</span>' : '') +
                autoNote +
              '</div>' +
            '</div>'
          );
        })
        .join('');

      wrap.querySelectorAll('.ann-admin-card[data-annid]').forEach((card) => {
        const id = card.dataset.annid;
        const a = list.find((x) => x.id === id);
        card.querySelector('[data-act="preview"]').addEventListener('click', () => previewAnnouncement(id));
        card.querySelector('[data-act="edit"]').addEventListener('click', () => editAnnouncement(id));
        card.querySelector('[data-act="publish"]').addEventListener('click', async () => {
          const next = a.status === 'published' ? 'draft' : 'published';
          try {
            await Backend.setAnnouncementStatus(id, next);
            audit('ANNOUNCEMENT_STATUS', 'announcement', id, 'Set "' + a.title + '" to ' + next, true);
            toast(next === 'published' ? 'Announcement published.' : 'Announcement unpublished.', 'success');
            renderAnnouncements();
          } catch (e) {
            toast(e.message, 'error');
          }
        });
        card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          if (!(await confirmDialog('Delete announcement "' + a.title + '"? Attached files will also be deleted. This cannot be undone.', { danger: true, okText: 'Delete Announcement' }))) return;
          try {
            await Backend.deleteAnnouncement(id);
            audit('ANNOUNCEMENT_DELETED', 'announcement', id, 'Deleted "' + a.title + '"', true);
            toast('Announcement deleted.', 'success');
            renderAnnouncements();
          } catch (e) {
            toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load announcements.') + '</div>';
    }
  }

  /* ---------------- shared editor modal ---------------- */
  function editorModal(a, files) {
    const isNew = !a;
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field full"><label class="panel-label">Title *</label>' +
          '<input class="panel-input" id="an-title" value="' + (a ? escHTML(a.title) : '') + '" placeholder="e.g. Mid Term Exam Schedule" /></div>' +
        '<div class="panel-field"><label class="panel-label">Date / time</label>' +
          '<input class="panel-input" id="an-date" type="datetime-local" value="' + (a ? toLocalInput(a.date) : '') + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Expiry date (optional)</label>' +
          '<input class="panel-input" id="an-expiry" type="date" value="' + (a && a.expiryDate ? String(a.expiryDate).slice(0, 10) : '') + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Priority</label>' +
          '<select class="panel-select" id="an-priority">' +
            '<option value="normal"' + (a && a.priority === 'normal' ? ' selected' : '') + '>Normal</option>' +
            '<option value="high"' + (a && a.priority === 'high' ? ' selected' : '') + '>High</option>' +
            '<option value="low"' + (a && a.priority === 'low' ? ' selected' : '') + '>Low</option>' +
          '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Category</label>' +
          '<input class="panel-input" id="an-category" value="' + (a ? escHTML(a.category || '') : '') + '" placeholder="e.g. Exam, Notice, Event" /></div>' +
        '<div class="panel-field"><label class="panel-label">Status</label>' +
          '<select class="panel-select" id="an-status">' +
            '<option value="draft"' + (a && a.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
            '<option value="published"' + (a && a.status === 'published' ? ' selected' : '') + '>Published</option>' +
            '<option value="scheduled"' + (a && a.status === 'scheduled' ? ' selected' : '') + '>Scheduled</option>' +
          '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Publish at (scheduled)</label>' +
          '<input class="panel-input" id="an-publish-at" type="datetime-local" value="' + (a && a.publishAt ? toLocalInput(a.publishAt) : '') + '" /></div>' +
        '<div class="panel-field full"><label class="panel-label">Body *</label>' +
          '<textarea class="panel-textarea" id="an-body" rows="6" placeholder="Full announcement text…">' + (a ? escHTML(a.body || '') : '') + '</textarea></div>' +
        '<div class="panel-field full"><label class="panel-label">Attachments (images, documents or videos — max 8 MB each)</label>' +
          '<div class="dropzone" id="an-drop">' +
            '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<div>Click to choose files, or drop them here</div>' +
            '<input type="file" id="an-file-input" multiple hidden />' +
          '</div>' +
          '<div id="an-file-list" class="file-list"></div>' +
        '</div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="an-save" type="button">' + (isNew ? 'Create Announcement' : 'Save Changes') + '</button>' +
      '</div>',
      { title: isNew ? 'New Announcement' : 'Edit Announcement', id: 'ann-editor' }
    );

    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));

    // File upload wiring (validate + keep reference list)
    const enteredFiles = [];
    const drop = overlay.querySelector('#an-drop');
    const input = overlay.querySelector('#an-file-input');
    const listEl = overlay.querySelector('#an-file-list');

    (files || []).forEach((f) => enteredFiles.push({ file: null, existing: f }));

    const renderFileList = () => {
      listEl.innerHTML = enteredFiles
        .filter((f) => !f.removed)
        .map((f, i) =>
          '<div class="file-chip">' +
            '<span>' + (f.existing ? existingLabel(f.existing) : escapeHtml(f.file.name)) + '</span>' +
            '<button type="button" class="rm" data-rm="' + i + '" title="Remove">&times;</button>' +
          '</div>'
        )
        .join('');
      listEl.querySelectorAll('[data-rm]').forEach((b) => {
        b.addEventListener('click', () => {
          const i = Number(b.dataset.rm);
          const f = enteredFiles.filter((x) => !x.removed)[i];
          if (!f) return;
          if (f.existing && f.existing.id) {
            // Keep the entry so it is deleted ON THE SERVER after save.
            f.removed = true;
          } else {
            enteredFiles.splice(enteredFiles.indexOf(f), 1);
          }
          renderFileList();
        });
      });
    };
    renderFileList();

    const addFiles = (fileList) => {
      Array.from(fileList || []).forEach((file) => {
        const v = validateUpload(file);
        if (!v.ok) {
          toast(v.error, 'error');
          return;
        }
        enteredFiles.push({ file, existing: null });
      });
      renderFileList();
      input.value = '';
    };
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      addFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', () => addFiles(input.files));

    overlay.querySelector('#an-save').addEventListener('click', async () => {
      const title = overlay.querySelector('#an-title').value.trim();
      const body = overlay.querySelector('#an-body').value.trim();
      if (!title || !body) {
        toast('Title and body are required.', 'error');
        return;
      }
      const dateVal = overlay.querySelector('#an-date').value;
      const payload = {
        title,
        body,
        date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
        expiryDate: overlay.querySelector('#an-expiry').value
          ? new Date(overlay.querySelector('#an-expiry').value + 'T23:59:59').toISOString()
          : null,
        priority: overlay.querySelector('#an-priority').value,
        category: overlay.querySelector('#an-category').value.trim(),
        status: overlay.querySelector('#an-status').value,
        publishAt: overlay.querySelector('#an-publish-at').value
          ? new Date(overlay.querySelector('#an-publish-at').value).toISOString()
          : null,
      };
      const saveBtn = overlay.querySelector('#an-save');
      saveBtn.disabled = true;
      try {
        let id = a && a.id;
        if (isNew) {
          const res = await Backend.createAnnouncement(payload);
          id = res.id;
          audit('ANNOUNCEMENT_CREATED', 'announcement', id, 'Created "' + title + '"', true);
        } else {
          await Backend.updateAnnouncement(id, payload);
          audit('ANNOUNCEMENT_UPDATED', 'announcement', id, 'Updated "' + title + '"', true);
        }
        // Upload new files then delete removed existing files (server-side).
        for (const f of enteredFiles) {
          if (f.removed) continue;
          if (f.file) await Backend.addAnnouncementFile(id, f.file);
        }
        for (const f of enteredFiles) {
          if (f.removed && f.existing && f.existing.id) {
            try {
              await Backend.deleteAnnouncementFile(f.existing.id);
            } catch (e) { /* file may already be gone */ }
          }
        }
        toast(isNew ? 'Announcement created.' : 'Announcement updated.', 'success');
        closeModal(overlay);
        renderAnnouncements();
      } catch (e) {
        toast(e.message, 'error');
        saveBtn.disabled = false;
      }
    });

    return overlay;
  }

  async function createAnnouncementFlow() {
    editorModal(null, []);
  }

  async function editAnnouncement(id) {
    try {
      const list = await Backend.listAnnouncementsAdmin();
      const a = list.find((x) => x.id === id);
      if (!a) throw new Error('Announcement not found.');
      editorModal(a, a.files || []);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- preview (exact student view) ---------------- */
  async function previewAnnouncement(id) {
    try {
      // Preview reflects the stored record regardless of its status.
      const list = await Backend.listAnnouncementsAdmin();
      const a = list.find((x) => x.id === id);
      if (!a) throw new Error('Announcement not found.');
      const files = a.files || [];
      const mediaHtml = files
        .map((f) => {
          const src = f.data || f.url || '';
          if (f.kind === 'image' && src) {
            return '<div style="margin:10px 0"><img class="ann-media-big" src="' + escHTML(src) + '" alt="' + escHTML(f.name) + '" /></div>';
          }
          if (f.kind === 'video' && src) {
            return '<div style="margin:10px 0"><video class="ann-video" controls src="' + escHTML(src) + '"></video></div>';
          }
          return '';
        })
        .join('');
      const fileChips = files
        .filter((f) => f.kind !== 'video' || f.data || f.url)
        .map((f) => {
          const href = f.data || f.url || '#';
          return '<a class="file-chip" href="' + escHTML(href) + '" download="' + escHTML(f.name || 'file') + '">📄 ' + escapeHtml(f.name || 'Download file') + '</a>';
        })
        .join('');
      openModal(
        '<div class="ann-detail">' +
          '<div class="ad-head"><div class="ad-meta">' +
            '<span class="pill priority ' + escHTML(a.priority || 'normal') + '">' + escHTML(a.priority || 'normal') + '</span>' +
            '<span>' + escapeHtml(a.category || 'General') + '</span>' +
            '<span>' + fmtDateTime(a.date) + '</span>' +
          '</div><div class="ad-title">' + escapeHtml(a.title) + '</div></div>' +
          mediaHtml +
          (a.body ? '<div class="ad-body">' + escapeHtml(a.body) + '</div>' : '') +
          (fileChips ? '<div class="ad-files">' + fileChips + '</div>' : '') +
        '</div>',
        { title: 'Preview — ' + a.title }
      );
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- helpers ---------------- */
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function existingLabel(f) {
    if (f.kind === 'image') return '🖼️ ' + (f.name || 'Image');
    if (f.kind === 'video') return '🎬 ' + (f.name || 'Video');
    return '📄 ' + (f.name || 'Document');
  }

  /* ---------------- wiring ---------------- */
  function wireAnnouncementTabs() {
    const create = $('#ann-create-btn');
    if (create) create.addEventListener('click', createAnnouncementFlow);
    const refresh = $('#ann-refresh-btn');
    if (refresh) refresh.addEventListener('click', renderAnnouncements);
  }

  return {
    renderAnnouncements,
    wireAnnouncementTabs,
    createAnnouncementFlow,
    editAnnouncement,
    previewAnnouncement,
  };
})();