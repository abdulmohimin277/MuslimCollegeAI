/* ============================================================
   ADMIN DASHBOARD — lock screen, sessions, sections, security,
   audit, AI diagnostics, export/restore and UPDATE WEBSITE
   (deployment summary → confirm → trigger → progress → history
   → rollback).
   ------------------------------------------------------------
   All admin authorization happens server-side (backend facade).
   This page never stores credentials, never trusts the browser.
   ============================================================ */
'use strict';

const AdminDashboard = (() => {
  let deployTimer = null;

  /* ============================================================
     ENTRY — decide lock screen vs dashboard from the backend session
     ============================================================ */
  async function mount() {
    try {
      const session = await Backend.adminSessionInfo();
      if (session) {
        renderDashboard(session);
      } else {
        renderLock();
      }
    } catch (e) {
      renderLock(e);
    }
  }

  /* ============================================================
     LOCK SCREEN (no session) — first-run setup or login form
     ============================================================ */
  async function renderLock(err) {
    const lock = $('#admin-lock');
    const dash = $('#admin-dashboard');
    const body = $('#admin-lock-body');
    if (!lock || !body) return;
    lock.classList.remove('hidden');
    if (dash) dash.classList.add('hidden');
    $('#panel-topbar-title').textContent = 'Admin Panel';

    let needsSetup = false;
    let firstRunErr = null;
    try {
      const info = await Backend.adminFirstRun();
      needsSetup = !!info.needsSetup;
    } catch (e) {
      firstRunErr = e;
    }

    const demoBanner = Backend.isDemo
      ? '<div class="demo-note"><strong>Local demo mode:</strong> data lives only in this browser. ' +
        'To run for real, set <code>site-config.js → backend: "supabase"</code> and follow SETUP.md. ' +
        'The master credential is not available in demo mode.</div>'
      : '';

    let formHtml = '';
    if (needsSetup) {
      formHtml =
        '<div class="sec-note" style="margin-bottom:10px">First run — create the administrator account. ' +
        'Credentials are stored securely by the backend (never in this browser).</div>' +
        '<div class="panel-field"><label class="panel-label" for="adm-setup-user">Admin username</label>' +
          '<input class="panel-input" id="adm-setup-user" autocomplete="off" /></div>' +
        '<div class="panel-field"><label class="panel-label" for="adm-setup-pass">Password (min 4 characters)</label>' +
          '<input class="panel-input" id="adm-setup-pass" type="password" autocomplete="new-password" /></div>' +
        '<div class="panel-field"><label class="panel-label" for="adm-setup-pass2">Repeat password</label>' +
          '<input class="panel-input" id="adm-setup-pass2" type="password" autocomplete="new-password" /></div>' +
        '<button class="btn primary" id="adm-setup-btn" type="button" style="width:100%">Create Administrator</button>';
    } else {
      formHtml =
        '<div class="panel-field"><label class="panel-label" for="adm-user">Username</label>' +
          '<input class="panel-input" id="adm-user" autocomplete="username" /></div>' +
        '<div class="panel-field"><label class="panel-label" for="adm-pass">Password</label>' +
          '<input class="panel-input" id="adm-pass" type="password" autocomplete="current-password" /></div>' +
        '<button class="btn primary" id="adm-login-btn" type="button" style="width:100%">Unlock Admin Panel</button>';
    }

    body.innerHTML = demoBanner + formHtml;

    if (firstRunErr) {
      body.insertAdjacentHTML('beforeend', '<div class="sec-note warn" style="margin-top:10px">' + escapeHtml(firstRunErr.message) + '</div>');
    }

    const doSetup = async () => {
      const u = $('#adm-setup-user').value.trim();
      const p1 = $('#adm-setup-pass').value;
      const p2 = $('#adm-setup-pass2').value;
      const btn = $('#adm-setup-btn');
      if (u.length < 3) return toast('Username must be at least 3 characters.', 'error');
      if (p1.length < 4) return toast('Password must be at least 4 characters.', 'error');
      if (p1 !== p2) return toast('Passwords do not match.', 'error');
      btn.disabled = true;
      btn.textContent = 'Creating…';
      const res = await Backend.adminCreateFirst(u, p1);
      btn.disabled = false;
      btn.textContent = 'Create Administrator';
      if (!res.ok) return toast(res.error || 'Could not create administrator.', 'error');
      toast('Administrator created. Logging you in…', 'success');
      const login = await Backend.adminLogin(u, p1);
      if (login.ok) return mount();
      renderLock(new Error('Account created — please log in.'));
    };

    const doLogin = async () => {
      const u = $('#adm-user').value.trim();
      const p = $('#adm-pass').value;
      const btn = $('#adm-login-btn');
      if (!u || !p) return toast('Enter your username and password.', 'error');
      btn.disabled = true;
      btn.textContent = 'Verifying…';
      const res = await Backend.adminLogin(u, p);
      btn.disabled = false;
      btn.textContent = 'Unlock Admin Panel';
      if (!res.ok) return toast(res.error || 'Login failed.', 'error');
      toast('Welcome, ' + res.user.username + '!', 'success');
      mount();
    };

    if (needsSetup) {
      $('#adm-setup-btn').addEventListener('click', doSetup);
      ['#adm-setup-pass2', '#adm-setup-pass'].forEach((s) => {
        const el = $(s);
        if (el) el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSetup();
        });
      });
    } else {
      $('#adm-login-btn').addEventListener('click', doLogin);
      $('#adm-pass').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
      });
      $('#adm-user').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
      });
    }
  }

  /* ============================================================
     DASHBOARD (valid session) — build + refresh everything
     ============================================================ */
  async function renderDashboard(session) {
    const lock = $('#admin-lock');
    const dash = $('#admin-dashboard');
    if (!dash) return;
    if (lock) lock.classList.add('hidden');
    dash.classList.remove('hidden');
    $('#panel-topbar-title').textContent = 'Admin Dashboard';

    const chip = $('#adm-userchip');
    if (chip) chip.textContent = session.username + (session.isMaster ? ' (Master)' : '');

    const banner = $('#demo-banner');
    if (banner) {
      if (Backend.isDemo) {
        banner.hidden = false;
        banner.innerHTML =
          '<strong>LOCAL DEMO MODE.</strong> Everything here works in this browser only (no server). ' +
          'Updates to the website are simulated. For the real, secure platform, switch <code>site-config.js</code> ' +
          'to <code>backend: "supabase"</code> (see SETUP.md).';
      } else {
        banner.hidden = true;
      }
    }

    wireFixedButtons();
    wireSectionTabs();
    ResultMgmt.wireResultTabs();
    AnnouncementMgmt.wireAnnouncementTabs();

    await Promise.all([
      refreshOverview(),
      loadAudit(),
      loadUpdateMeta(),
      loadDeployments(),
      ResultMgmt.refreshAll(),
      AnnouncementMgmt.renderAnnouncements(),
    ]);
    refreshLogs();
  }

  /* ---------------- section tabs ---------------- */
  function wireSectionTabs() {
    const tabs = $$('#adm-tabs .adm-tab');
    tabs.forEach((t) => {
      t.addEventListener('click', () => showSection(t.dataset.admsec));
    });
  }

  async function showSection(sec) {
    $$('#adm-tabs .adm-tab').forEach((t) => t.classList.toggle('active', t.dataset.admsec === sec));
    $$('.adm-sec').forEach((el) => el.classList.toggle('active', el.id === 'adm-sec-' + sec));

    if (sec === 'overview') {
      refreshOverview();
      refreshLogs();
    } else if (sec === 'logs') {
      loadAudit();
    } else if (sec === 'announcements') {
      AnnouncementMgmt.renderAnnouncements();
    } else if (sec === 'result') {
      ResultMgmt.refreshAll();
    } else if (sec === 'update') {
      loadUpdateMeta();
      loadDeployments();
      recomputeSummary();
    }
  }

  /* ============================================================
     OVERVIEW — quick stats + backend / model status
     ============================================================ */
  async function refreshOverview() {
    const statsEl = $('#adm-overview-stats');
    try {
      const [classes, announcements, deploys, audit] = await Promise.all([
        Backend.listClasses(),
        Backend.listAnnouncementsAdmin(),
        Backend.deploymentHistory(),
        Backend.listAuditLogs(500),
      ]);
      const studentCount = classes.reduce((s, c) => s + (c.studentCount || 0), 0);
      const subjectCount = classes.reduce((s, c) => s + (c.subjectCount || 0), 0);
      if (statsEl) {
        statsEl.innerHTML =
          statTile(classes.length, 'Classes') +
          statTile(studentCount, 'Students') +
          statTile(subjectCount, 'Subjects') +
          statTile(announcements.length, 'Announcements') +
          statTile((deploys || []).length, 'Deployments') +
          statTile((audit || []).length, 'Audit Entries');
      }
    } catch (e) {
      if (statsEl) statsEl.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load stats.') + '</div>';
    }

    const meta = await Backend.getSiteMeta().catch(() => null);
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set('#admin-rotation-status', 'Active (auto-rotate)');
    set('#adm-backend-mode', Backend.isDemo ? 'Local Demo (browser)' : 'Supabase (production)');
    set('#adm-site-version', (meta && meta.version) || APP_VERSION);
    set('#adm-last-update', (meta && meta.lastUpdate) ? fmtDateTime(meta.lastUpdate) : 'Never');
    set('#adm-about-version', APP_VERSION);
    set('#adm-about-mode', Backend.isDemo ? 'Local Demo' : 'Supabase');
    set('#adm-about-build', BUILD_DATE || '—');
  }

  function statTile(n, label) {
    return '<div class="adm-stat"><div class="stat-num">' + n + '</div><div class="stat-label">' + escapeHtml(label) + '</div></div>';
  }

  /* ============================================================
     SECURITY — changeable credentials + lock now
     ============================================================ */
  function wireFixedButtons() {
    // Use onclick/onchange assignments (not addEventListener) so calling
    // renderDashboard() more than once never stacks duplicate handlers.
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = fn;
    };

    on('#sec-change-btn', () => changeCredentials('sec'));
    on('#set-change-btn', () => changeCredentials('set'));
    on('#sec-lock-now-btn', lockNow);
    on('#adm-logout-btn', lockNow);
    on('#audit-refresh-btn', loadAudit);
    on('#refresh-logs-btn', refreshLogs);
    on('#admin-clear-logs-btn', () => {
      clearChat();
      refreshLogs();
      toast('Logs cleared.', 'success');
    });
    on('#admin-test-rotation-btn', adminTestRotation);
    on('#export-data-btn', exportBackup);

    const restoreFile = $('#restore-file-input');
    on('#restore-data-btn', () => restoreFile && restoreFile.click());
    if (restoreFile) restoreFile.onchange = restoreBackup;

    on('#update-site-btn', requestUpdate);
  }

  /**
   * Change the changeable admin credentials (server-side, hashed).
   * prefix selects which card's inputs to use:
   *   'sec' → Admin/Security card (sec-*)
   *   'set' → Settings card (set-*)
   */
  async function changeCredentials(prefix) {
    const p = prefix || 'sec';
    const currentEl = $('#' + p + '-current-pass');
    const newUserEl = $('#' + p + '-new-username');
    const newPassEl = $('#' + p + '-new-pass');
    const btn = $('#' + p + '-change-btn');
    if (!currentEl || !btn) return;
    const current = currentEl.value;
    const newUser = newUserEl ? newUserEl.value.trim() : '';
    const newPass = newPassEl ? newPassEl.value : '';
    if (!current) return toast('Enter your current password.', 'error');
    if (!newUser && !newPass) return toast('Enter a new username and/or password.', 'error');
    btn.disabled = true;
    try {
      await Backend.adminChangeCredentials(current, newUser || undefined, newPass || undefined);
      toast('Credentials updated.', 'success');
      currentEl.value = '';
      if (newUserEl) newUserEl.value = '';
      if (newPassEl) newPassEl.value = '';
      const s = await Backend.adminSessionInfo();
      renderDashboard(s || { username: 'Admin' });
    } catch (e) {
      toast(e.message, 'error');
    }
    btn.disabled = false;
  }

  /* ---------------- lock / logout ---------------- */
  async function lockNow() {
    if (deployTimer) {
      clearInterval(deployTimer);
      deployTimer = null;
    }
    await Backend.adminLogout();
    toast('Admin panel locked.', '');
    $('#admin-dashboard').classList.add('hidden');
    mount();
  }

  /* ============================================================
     AUDIT LOG
     ============================================================ */
  async function loadAudit() {
    const wrap = $('#audit-list-wrap');
    if (!wrap) return;
    try {
      const logs = await Backend.listAuditLogs(200);
      if (!logs.length) {
        wrap.innerHTML = '<div class="empty-state">No admin activity recorded yet. Actions will appear here.</div>';
        return;
      }
      wrap.innerHTML =
        '<div class="tbl-wrap">' +
          '<table class="data-table">' +
            '<thead><tr><th>Time</th><th>Action</th><th>Admin</th><th>Details</th><th class="num">Status</th></tr></thead>' +
            '<tbody>' +
            logs.map((l) =>
              '<tr>' +
                '<td class="at">' + fmtDateTime(l.at || l.created_at || l.createdAt) + '</td>' +
                '<td><span class="tag">' + escapeHtml(l.action || '—') + '</span></td>' +
                '<td>' + escapeHtml(l.admin || l.admin_username || 'system') + '</td>' +
                '<td>' + escapeHtml(l.details || '—') + '</td>' +
                '<td class="num"><span class="pill ' + (l.success !== false ? 'green' : 'red') + '">' + (l.success !== false ? 'OK' : 'ERR') + '</span></td>' +
              '</tr>'
            ).join('') +
            '</tbody>' +
          '</table>' +
        '</div>';
    } catch (e) {
      wrap.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load audit log.') + '</div>';
    }
  }

  /* ============================================================
     SETTINGS — export / restore backup
     ============================================================ */
  async function exportBackup() {
    try {
      const data = await Backend.exportData();
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'muslim-college-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(blobUrl);
      audit('DATA_EXPORTED', 'database', null, 'Full backup exported', true);
      toast('Backup exported!', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function restoreBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return toast('Backup file is too large.', 'error');
    let parsed = null;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      return toast('That file is not valid JSON.', 'error');
    }
    const ok = await confirmDialog(
      'Restore this backup now? Current classes, students, marks and announcements will be REPLACED. ' +
      'This action is written to the audit log and cannot be undone.',
      { danger: true, okText: 'Restore Backup', title: 'Restore data?' }
    );
    if (!ok) return;
    try {
      await Backend.restoreData(parsed);
      audit('DATA_RESTORED', 'database', null, 'Data restored from backup', true);
      toast('Backup restored.', 'success');
      refreshOverview();
      loadAudit();
      ResultMgmt.refreshAll();
      AnnouncementMgmt.renderAnnouncements();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  /* ============================================================
     UPDATE WEBSITE — summary → confirm → trigger → progress →
     history → rollback
     ============================================================ */
  async function recomputeSummary() {
    const box = $('#update-summary-box');
    if (!box) return;
    try {
      const s = await Backend.computeUpdateSummary();
      const total = s.classes + s.students + s.marks + s.announcements + (s.files || 0);
      box.innerHTML =
        '<div class="sec-note">' +
          (total
            ? '<strong>Ready to publish.</strong> Changes since the last update: ' +
              s.classes + ' class(es) · ' + s.students + ' student(s) · ' + s.marks + ' mark row(s) · ' +
              s.announcements + ' announcement(s)' + (s.files ? ' · ' + s.files + ' file(s)' : '') + '.'
            : '<strong>No new changes detected</strong> since the last update — the website is already up to date.') +
          (Backend.isDemo ? '<br /><span style="opacity:.8">Demo mode: this flow is simulated and clearly labelled as such.</span>' : '') +
        '</div>';
    } catch (e) {
      box.innerHTML = '<div class="sec-note warn">' + escapeHtml(e.message || 'Could not compute update summary.') + '</div>';
    }
  }

  async function requestUpdate() {
    let summary = null;
    try {
      summary = await Backend.computeUpdateSummary();
    } catch (e) {
      return toast(e.message, 'error');
    }
    const total = summary.classes + summary.students + summary.marks + summary.announcements + (summary.files || 0);
    const ok = await confirmDialog(
      Backend.isDemo
        ? 'This is DEMO mode — the update is simulated. ' +
          (total ? 'Your changes (' + total + ' item(s)) will be snapshotted as if published.' : 'No changes were detected.')
        : 'Publishing will securely store your changes, trigger GitHub Actions to rebuild the site and deploy it to GitHub Pages. ' +
          'Your GitHub token stays server-side and is never exposed. Continue?',
      { title: 'Publish website?' }
    );
    if (!ok) return;
    const btn = $('#update-site-btn');
    btn.disabled = true;
    const box = $('#update-progress-box');
    if (box) box.innerHTML = '<div class="deploy-steps"><li class="active"><span class="step-dot"></span>Starting secure deploy…</li></div>';
    try {
      const dep = await Backend.triggerUpdate(summary);
      audit('WEBSITE_UPDATE_TRIGGERED', 'deployment', dep.id, 'Update website requested', true);
      toast('Deploy started!', 'success');
      watchDeployment(dep.id);
    } catch (e) {
      if (box) box.innerHTML = '<div class="sec-note warn">Deploy failed: ' + escapeHtml(e.message) + '</div>';
      toast(e.message, 'error');
      btn.disabled = false;
    }
  }

  function watchDeployment(depId) {
    const box = $('#update-progress-box');
    const btn = $('#update-site-btn');
    let attempts = 0;
    const MAX = 120;

    if (deployTimer) clearInterval(deployTimer);

    const renderSteps = (d) => {
      const st = String(d.status || 'pending');
      const bs = String(d.buildStatus || '');
      const ds = String(d.deployStatus || '');
      const done = st === 'success';
      const failed = st === 'failed' || bs === 'failed' || ds === 'failed' || d.error;
      const steps = [
        { key: 'store', label: 'Securing & storing your changes' },
        { key: 'send', label: 'Sending to GitHub Actions' },
        { key: 'build', label: 'Building the website' },
        { key: 'deploy', label: 'Deploying to GitHub Pages' },
        { key: 'live', label: 'Live on the website' },
      ];
      let activeIdx = -1;
      if (st === 'pending' || st === 'saving') activeIdx = 0;
      else if (st === 'sending') activeIdx = 1;
      else if (bs === 'building') activeIdx = 2;
      else if (bs === 'deploying' || ds === 'deploying') activeIdx = 3;
      else if (done) activeIdx = 5;
      else activeIdx = 2;

      steps.forEach((s, i) => {
        let cls = '';
        if (failed) cls = i <= activeIdx && activeIdx < 5 ? 'failed' : '';
        else if (done) cls = 'done';
        else if (i < activeIdx) cls = 'done';
        else if (i === activeIdx) cls = 'active';
        s._cls = cls;
      });

      box.innerHTML =
        '<ul class="deploy-steps">' +
        steps.map((s) => '<li class="' + s._cls + '"><span class="step-dot"></span>' + escapeHtml(s.label) + '</li>').join('') +
        '</ul>' +
        '<div class="update-status ' + (failed ? 'sec-note warn' : 'sec-note') + '">' +
          (failed
            ? 'Deployment failed. No data was deleted — your changes remain safe. ' + escapeHtml(d.error || 'See deployment history for details.')
            : done
              ? 'Website updated successfully' + (d.commitRef ? ' (build ' + escapeHtml(d.commitRef) + ')' : '') + '!'
              : 'Deployment in progress…') +
        '</div>';
    };

    const tick = async () => {
      attempts++;
      try {
        const d = await Backend.getDeployment(depId);
        renderSteps(d);
        await loadUpdateMeta();
        if (d.status === 'success' || d.status === 'failed' || d.error) {
          stop();
          btn.disabled = false;
          await loadDeployments();
          return;
        }
        if (attempts >= MAX) {
          stop();
          btn.disabled = false;
          box.insertAdjacentHTML('beforeend', '<div class="sec-note warn">Still waiting on GitHub… refresh to check the latest status.</div>');
          loadDeployments();
        }
      } catch (e) {
        if (attempts >= MAX) {
          stop();
          btn.disabled = false;
        }
      }
    };
    const stop = () => {
      if (deployTimer) {
        clearInterval(deployTimer);
        deployTimer = null;
      }
    };
    tick();
    deployTimer = setInterval(tick, 2000);
  }

  async function loadUpdateMeta() {
    const meta = await Backend.getSiteMeta().catch(() => null);
    if (!meta) return;
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set('#up-version', meta.version || APP_VERSION);
    set('#up-last-update', meta.lastUpdate ? fmtDateTime(meta.lastUpdate) : 'Never');
    set('#up-last-status', meta.lastStatus ? escapeHtml(String(meta.lastStatus)) : '—');
    set('#up-last-deploy', meta.lastDeployAt ? fmtDateTime(meta.lastDeployAt) : '—');
    set('#up-deploy-status', meta.lastDeployStatus ? escapeHtml(String(meta.lastDeployStatus)) : 'No deployment yet');
  }

  async function loadDeployments() {
    const wrap = $('#deployment-history-wrap');
    if (!wrap) return;
    try {
      const list = await Backend.deploymentHistory();
      if (!list || !list.length) {
        wrap.innerHTML = '<div class="empty-state">No deployments yet.</div>';
        return;
      }
      wrap.innerHTML = list
        .map((d) => {
          const statusCls = d.status === 'success' ? 'green' : d.status === 'failed' ? 'red' : 'amber';
          const s = d.summary || {};
          const summaryText = s.rollback
            ? 'Rollback from ' + s.from
            : [s.classes && s.classes + ' classes', s.students && s.students + ' students', s.marks && s.marks + ' marks', s.announcements && s.announcements + ' announcements', s.files && s.files + ' files']
                .filter(Boolean).join(' · ') || '—';
          return (
            '<div class="dep-row" data-depid="' + escHTML(d.id) + '">' +
              '<div class="dep-info">' +
                '<span><strong>' + fmtDateTime(d.finishedAt || d.startedAt || d.created_at || d.createdAt) + '</strong></span>' +
                '<span class="pill ' + statusCls + '">' + escapeHtml(String(d.status || 'pending')) + '</span>' +
                '<small>' + escapeHtml(summaryText) + '</small>' +
                '<small>By ' + escapeHtml(d.triggeredBy || '—') +
                  (d.commitRef ? ' · build ' + escapeHtml(d.commitRef) : '') +
                  (d.simulated ? ' · simulated' : '') + '</small>' +
              '</div>' +
              '<div class="dep-actions">' +
                (d.status === 'success' ? '<button class="btn outline sm" data-act="rollback" type="button">Rollback</button>' : '') +
              '</div>' +
            '</div>'
          );
        })
        .join('');

      wrap.querySelectorAll('[data-act="rollback"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('.dep-row');
          const id = row.dataset.depid;
          const ok = await confirmDialog(
            Backend.isDemo
              ? 'Roll back to a previous snapshot? In demo mode this restores the demo data snapshot.'
              : 'Roll back the website to this deployment\u2019s data snapshot? A rebuild + redeploy will be triggered. This cannot be undone.',
            { danger: true, okText: 'Rollback' }
          );
          if (!ok) return;
          try {
            await Backend.rollbackTo(id);
            audit('WEBSITE_ROLLBACK', 'deployment', id, 'Rolled back website data', true);
            toast('Rollback complete.', 'success');
            await loadDeployments();
            await loadUpdateMeta();
            refreshOverview();
          } catch (e) {
            toast(e.message, 'error');
          }
        });
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load deployment history.') + '</div>';
    }
  }

  return { mount, showSection, lockNow };
})();