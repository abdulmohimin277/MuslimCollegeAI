/* ============================================================
   ADMIN — Result Management (new drill-down flow).
   ------------------------------------------------------------
   Flow (as requested):
     Result tab
       → [1st Year | Second Year]  (batch cards)
          → "+ Add New Class" + class cards
             → click class → class detail (Incharge, CR, type,
               session, subjects, students)
                → "+ Add New Student"
                → "Marks" on any student → enter marks for
                  ALL subjects
       → top search box: enter student roll no → opens the
         marks sheet for that student directly.
   Class Result (print / PDF / CSV) and single Student Result
   card (print / PDF) stay available from the class detail.
   ============================================================ */
'use strict';

const ResultMgmt = (() => {
  const BATCHES = ['1st Year', 'Second Year'];
  const state = { view: 'home' };

  let marksCache = null;
  function setMarksCache(s) { marksCache = s; }
  function getMarksCache() { return marksCache; }

  /* ---------------- tiny shared helpers ---------------- */
  function ig(k, v) {
    return '<div class="ig"><div class="k">' + escHTML(String(k)) + '</div><div class="v">' +
      (v === undefined || v === null || v === '' ? '—' : escHTML(String(v))) + '</div></div>';
  }

  function batchOf(c) { return (c && c.batch) || '1st Year'; }

  async function fillClassTypeMeta() {
    const classTypes = await Backend.listClassTypes();
    return { classTypes };
  }

  /* ---------------- navigation ---------------- */
  function setNav(show, label) {
    const bar = $('#result-navbar');
    if (bar) bar.classList.toggle('hidden', !show);
    const bc = $('#result-breadcrumb');
    if (bc) bc.textContent = label || '';
    const back = $('#result-back-btn');
    if (back) back.onclick = goBack;
  }

  function goBack() {
    const v = state.view;
    if (v === 'class') showBatch(state.batch || '1st Year');
    else if (v === 'classresult') showClassView(state.classId);
    else if (v === 'marks' || v === 'studentresult') {
      if (state.from === 'class') showClassView(state.classId);
      else showHome();
    } else showHome();
  }

  /* ---------------- HOME: batch picker ---------------- */
  async function showHome() {
    state.view = 'home';
    setNav(false, '');
    const wrap = $('#result-content');
    if (!wrap) return;
    const classes = await Backend.listClasses();
    const counts = {};
    BATCHES.forEach((b) => (counts[b] = { classes: 0, students: 0 }));
    classes.forEach((c) => {
      const b = batchOf(c);
      if (!counts[b]) counts[b] = { classes: 0, students: 0 };
      counts[b].classes += 1;
      counts[b].students += c.studentCount || 0;
    });
    wrap.innerHTML =
      '<div class="result-home">' +
        '<div class="sec-note">Choose a batch to manage its classes, students and results.</div>' +
        '<div class="result-batches">' +
          BATCHES.map((b) =>
            '<button class="batch-card" data-batch="' + escHTML(b) + '" type="button">' +
              '<div class="bc-icon">' + (b === '1st Year' ? '1' : '2') + '</div>' +
              '<div class="bc-info">' +
                '<strong>' + escapeHtml(b) + '</strong>' +
                '<span>' + counts[b].classes + ' class' + (counts[b].classes === 1 ? '' : 'es') +
                  ' · ' + counts[b].students + ' student' + (counts[b].students === 1 ? '' : 's') + '</span>' +
              '</div>' +
              '<span class="bc-arrow">→</span>' +
            '</button>'
          ).join('') +
        '</div>' +
        '<div class="btn-row" style="margin-top:16px">' +
          '<button class="btn outline sm" id="result-manage-types" type="button">Manage class types</button>' +
        '</div>' +
      '</div>';
    wrap.querySelectorAll('.batch-card').forEach((b) => {
      b.addEventListener('click', () => showBatch(b.dataset.batch));
    });
    const mt = $('#result-manage-types');
    if (mt) mt.addEventListener('click', manageClassTypes);
    wireRollSearch();
  }

  /* ---------------- BATCH: classes of one batch ---------------- */
  function classCard(c) {
    return (
      '<div class="class-card" data-classid="' + escHTML(c.id) + '" role="button" tabindex="0">' +
        '<div class="cc-head">' +
          '<strong>' + escapeHtml(c.name) + '</strong>' +
          '<span class="pill blue">' + escapeHtml(c.classTypeName || '—') + '</span>' +
        '</div>' +
        (c.session ? '<div class="cc-line">Session <strong>' + escapeHtml(c.session) + '</strong></div>' : '') +
        '<div class="cc-line"><span>Incharge</span>' + escapeHtml(c.inchargeName || '—') + '</div>' +
        '<div class="cc-line"><span>CR</span>' + escapeHtml(c.crName || '—') + '</div>' +
        '<div class="cc-meta">' +
          '<span>' + (c.studentCount || 0) + ' students</span>' +
          '<span>' + (c.subjectCount || 0) + ' subjects</span>' +
        '</div>' +
      '</div>'
    );
  }

  async function showBatch(batch) {
    state.view = 'batch';
    state.batch = batch;
    setNav(true, 'Home / ' + batch);
    const wrap = $('#result-content');
    if (!wrap) return;
    const classes = await Backend.listClasses();
    const list = classes.filter((c) => batchOf(c) === batch);
    wrap.innerHTML =
      '<div class="adm-toolbar">' +
        '<span class="pill blue">' + escapeHtml(batch) + '</span> ' +
        '<button class="btn primary sm" id="result-add-class" type="button">+ Add New Class</button>' +
      '</div>' +
      (list.length
        ? '<div class="class-grid">' + list.map((c) => classCard(c)).join('') + '</div>'
        : '<div class="empty-state"><div class="es-title">No classes in ' + escapeHtml(batch) + ' yet</div>' +
          'Click <b>"+ Add New Class"</b> to create the first class of this batch.</div>');
    wrap.querySelectorAll('.class-card').forEach((card) => {
      card.addEventListener('click', () => showClassView(card.dataset.classid));
    });
    const add = $('#result-add-class');
    if (add) add.addEventListener('click', () => addClassFlow(batch));
  }

  /* ---------------- ADD / EDIT / DELETE CLASS ---------------- */
  async function addClassFlow(batch) {
    const { classTypes } = await fillClassTypeMeta();
    const typeOpts =
      classTypes.map((t) => '<option value="' + escHTML(t.id) + '">' + escapeHtml(t.name) + '</option>').join('') +
      '<option value="__new">+ New class type…</option>';
    const overlay = openModal(
      '<div class="sec-note">Adding class to batch <strong>' + escapeHtml(batch) + '</strong></div>' +
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Class name *</label><input class="panel-input" id="cls-name" placeholder="e.g. FSc Pre-Engineering" /></div>' +
        '<div class="panel-field"><label class="panel-label">Class type *</label>' +
          '<select class="panel-select" id="cls-type">' + typeOpts + '</select>' +
          '<input class="panel-input hidden" id="cls-type-new" placeholder="New class type name" style="margin-top:8px" /></div>' +
        '<div class="panel-field"><label class="panel-label">Incharge name</label><input class="panel-input" id="cls-incharge" placeholder="Class incharge / teacher" /></div>' +
        '<div class="panel-field"><label class="panel-label">CR name</label><input class="panel-input" id="cls-cr" placeholder="Class representative" /></div>' +
        '<div class="panel-field"><label class="panel-label">Session / Year</label><input class="panel-input" id="cls-session" placeholder="e.g. 2025-2026" /></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-body"><h3>Subjects</h3>' +
          '<p class="card-note">Add the class subjects with total and passing marks. You can add or change them later from the class page.</p></div></div>' +
        '<div class="subj-add-row">' +
          '<input class="panel-input grow" id="cls-sub-name" placeholder="Subject name" />' +
          '<input class="panel-input" id="cls-sub-total" type="number" min="1" value="100" placeholder="Total" style="max-width:92px" />' +
          '<input class="panel-input" id="cls-sub-passing" type="number" min="0" value="33" placeholder="Passing" style="max-width:92px" />' +
          '<button class="btn outline sm" id="cls-sub-add" type="button">+ Add</button>' +
        '</div>' +
        '<div id="cls-sub-list" class="subj-list"></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="cls-save" type="button">Create Class</button>' +
      '</div>',
      { title: 'Add New Class — ' + batch }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));

    const typeSel = overlay.querySelector('#cls-type');
    const typeNew = overlay.querySelector('#cls-type-new');
    typeSel.addEventListener('change', () => {
      typeNew.classList.toggle('hidden', typeSel.value !== '__new');
    });

    const listEl = overlay.querySelector('#cls-sub-list');
    const pending = [];
    const redrawChips = () => {
      listEl.innerHTML = pending.map((s, i) =>
        '<div class="subj-chip">' + escapeHtml(s.name) + ' <em>' + s.total + ' / ' + s.passing + '</em>' +
          '<button type="button" class="chip-x" data-i="' + i + '" aria-label="Remove">×</button></div>'
      ).join('');
      listEl.querySelectorAll('.chip-x').forEach((x) => {
        x.addEventListener('click', () => {
          pending.splice(Number(x.dataset.i), 1);
          redrawChips();
        });
      });
    };
    overlay.querySelector('#cls-sub-add').addEventListener('click', () => {
      const n = $('#cls-sub-name').value.trim();
      const t = Number($('#cls-sub-total').value || 0);
      const p = Number($('#cls-sub-passing').value || 0);
      if (!n) return toast('Enter a subject name.', 'error');
      if (!(t > 0)) return toast('Total marks must be above 0.', 'error');
      if (p < 0) return toast('Passing marks cannot be negative.', 'error');
      pending.push({ name: n, total: t, passing: p });
      redrawChips();
      $('#cls-sub-name').value = '';
      $('#cls-sub-total').value = 100;
      $('#cls-sub-passing').value = 33;
      $('#cls-sub-name').focus();
    });

    overlay.querySelector('#cls-save').addEventListener('click', async () => {
      const name = $('#cls-name').value.trim();
      let classTypeId = typeSel.value;
      const saveBtn = overlay.querySelector('#cls-save');
      if (!name) return toast('Enter a class name.', 'error');
      saveBtn.disabled = true;
      try {
        if (classTypeId === '__new') {
          const nn = $('#cls-type-new').value.trim();
          if (!nn) {
            saveBtn.disabled = false;
            return toast('Enter the new class type name.', 'error');
          }
          const created = await Backend.addClassType(nn);
          classTypeId = created.id;
        }
        const cls = await Backend.addClass({
          name,
          classTypeId,
          batch,
          session: $('#cls-session').value.trim(),
          inchargeName: $('#cls-incharge').value.trim(),
          crName: $('#cls-cr').value.trim(),
        });
        for (let i = 0; i < pending.length; i++) {
          await Backend.addClassSubject(cls.id, {
            name: pending[i].name,
            totalMarks: pending[i].total,
            passingMarks: pending[i].passing,
            sortOrder: i,
          });
        }
        audit('CLASS_CREATED', 'class', cls.id, 'Created class "' + name.trim() + '" (' + batch + ')' + (pending.length ? ' with ' + pending.length + ' subject(s)' : ''), true);
        toast('Class created.', 'success');
        closeModal(overlay);
        showBatch(batch);
      } catch (e) {
        toast(e.message, 'error');
        saveBtn.disabled = false;
      }
    });
  }

  async function editClassFlow(c) {
    const { classTypes } = await fillClassTypeMeta();
    const typeOpts = classTypes.map((t) =>
      '<option value="' + escHTML(t.id) + '"' + (t.id === c.classTypeId ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>'
    ).join('');
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Class name *</label><input class="panel-input" id="cls-name" value="' + escHTML(c.name) + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Class type *</label><select class="panel-select" id="cls-type">' + typeOpts + '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Batch</label><select class="panel-select" id="cls-batch">' +
          BATCHES.map((b) => '<option value="' + escHTML(b) + '"' + (batchOf(c) === b ? ' selected' : '') + '>' + escapeHtml(b) + '</option>').join('') +
        '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Session / Year</label><input class="panel-input" id="cls-session" value="' + escHTML(c.session || '') + '" placeholder="e.g. 2025-2026" /></div>' +
        '<div class="panel-field"><label class="panel-label">Incharge name</label><input class="panel-input" id="cls-incharge" value="' + escHTML(c.inchargeName || '') + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">CR name</label><input class="panel-input" id="cls-cr" value="' + escHTML(c.crName || '') + '" /></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="cls-save" type="button">Save Class</button>' +
      '</div>',
      { title: 'Edit Class' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#cls-save').addEventListener('click', async () => {
      const btn = overlay.querySelector('#cls-save');
      btn.disabled = true;
      try {
        await Backend.updateClass(c.id, {
          name: $('#cls-name').value.trim(),
          classTypeId: $('#cls-type').value,
          batch: $('#cls-batch').value,
          session: $('#cls-session').value.trim(),
          inchargeName: $('#cls-incharge').value.trim(),
          crName: $('#cls-cr').value.trim(),
        });
        audit('CLASS_UPDATED', 'class', c.id, 'Edited class "' + $('#cls-name').value.trim() + '"', true);
        toast('Class updated.', 'success');
        closeModal(overlay);
        showClassView(c.id);
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  async function deleteClassFlow(c, batch) {
    if (!(await confirmDialog('Delete class "' + c.name + '"? Its subjects will also be removed. (Classes with students must remove students first.)', { danger: true, okText: 'Delete Class' }))) return;
    try {
      await Backend.deleteClass(c.id);
      audit('CLASS_DELETED', 'class', c.id, 'Deleted class "' + c.name + '"', true);
      toast('Class deleted.', 'success');
      showBatch(batch || batchOf(c));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- CLASS DETAIL (students + actions) ---------------- */
  function studentsTable(students, filter) {
    if (!students.length) {
      return '<div class="empty-state"><div class="es-title">No students yet</div>Click <b>"+ Add New Student"</b> to add the first student.</div>';
    }
    return (
      '<table class="data-table">' +
        '<thead><tr><th class="num">Sr</th><th>Roll No</th><th>Student Name</th><th>Father Name</th><th class="actions">Actions</th></tr></thead>' +
        '<tbody>' +
        students.map((st, i) =>
          '<tr data-stuid="' + escHTML(st.id) + '">' +
            '<td class="num">' + (st.serial || i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(st.rollNumber) + '</strong></td>' +
            '<td>' + escapeHtml(st.name) + '</td>' +
            '<td>' + escapeHtml(st.fatherName || '—') + '</td>' +
            '<td class="actions">' +
              '<button class="btn outline sm" data-act="marks" title="Enter marks for all subjects">Marks</button> ' +
              '<button class="btn outline sm" data-act="view" title="View result card">Result</button> ' +
              '<button class="btn outline sm" data-act="pin" title="Set portal PIN">PIN</button> ' +
              '<button class="btn outline sm" data-act="edit">Edit</button> ' +
              '<button class="btn danger sm" data-act="delete">Delete</button>' +
            '</td>' +
          '</tr>'
        ).join('') +
        '</tbody>' +
      '</table>'
    );
  }

  async function showClassView(classId) {
    const classes = await Backend.listClasses();
    const c = classes.find((x) => x.id === classId);
    if (!c) return showHome();
    const batch = batchOf(c);
    state.view = 'class';
    state.classId = classId;
    state.batch = batch;
    setNav(true, 'Home / ' + batch + ' / ' + c.name);

    const wrap = $('#result-content');
    if (!wrap) return;
    const students = await Backend.listStudents({ classId });

    wrap.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<div class="card-icon"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></div>' +
          '<div class="card-body"><h3>' + escapeHtml(c.name) + '</h3>' +
            '<p class="card-note">' + escapeHtml(batch) + ' · ' + escapeHtml(c.classTypeName || '—') +
              (c.session ? ' · Session ' + escapeHtml(c.session) : '') + '</p></div>' +
        '</div>' +
        '<div class="info-grid">' +
          ig('Incharge', c.inchargeName) +
          ig('Class Representative (CR)', c.crName) +
          ig('Students', c.studentCount || 0) +
          ig('Subjects', c.subjectCount || 0) +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn outline sm" id="cv-edit" type="button">Edit Class</button> ' +
          '<button class="btn outline sm" id="cv-subjects" type="button">Manage Subjects</button> ' +
          '<button class="btn outline sm" id="cv-result" type="button">Class Result</button> ' +
          '<button class="btn danger sm" id="cv-delete" type="button">Delete Class</button>' +
        '</div>' +
      '</div>' +
      '<div id="cv-subjects-area"></div>' +
      '<div class="adm-toolbar" style="margin-top:14px">' +
        '<button class="btn primary sm" id="cv-add-student" type="button">+ Add New Student</button> ' +
        '<input class="panel-input grow" id="cv-student-search" type="search" placeholder="Search students in this class (name / roll / father)…" />' +
      '</div>' +
      '<div class="tbl-wrap" id="cv-students-table">' + studentsTable(students) + '</div>';

    $('#cv-edit').addEventListener('click', () => editClassFlow(c));
    $('#cv-delete').addEventListener('click', () => deleteClassFlow(c, batch));
    $('#cv-result').addEventListener('click', () => showClassResultView(c.id));
    $('#cv-subjects').addEventListener('click', () => renderSubjectsArea(c.id));
    $('#cv-add-student').addEventListener('click', () => addStudentFlow(c.id));

    $('#cv-student-search').addEventListener('input', () => {
      const q = $('#cv-student-search').value.trim().toLowerCase();
      const filtered = q
        ? students.filter((s) =>
            String(s.rollNumber).toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            (s.fatherName || '').toLowerCase().includes(q)
          )
        : students;
      $('#cv-students-table').innerHTML = studentsTable(filtered);
      wireStudentRows(filtered);
    });

    if (state._openSubjects) {
      state._openSubjects = false;
      renderSubjectsArea(c.id);
    }
    wireStudentRows(students);
  }

  function wireStudentRows(students) {
    const wrap = $('#cv-students-table');
    if (!wrap) return;
    wrap.querySelectorAll('tr[data-stuid]').forEach((tr) => {
      const id = tr.dataset.stuid;
      const student = students.find((s) => s.id === id);
      if (!student) return;
      tr.querySelector('[data-act="marks"]').addEventListener('click', () => showMarksView(id, 'class'));
      tr.querySelector('[data-act="view"]').addEventListener('click', () => showStudentResultView(id, 'class'));
      tr.querySelector('[data-act="pin"]').addEventListener('click', () => setStudentPinFlow(student));
      tr.querySelector('[data-act="edit"]').addEventListener('click', () => editStudentFlow(student));
      tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteStudentFlow(student));
    });
  }

  /* ---------------- SUBJECTS (inside class detail) ---------------- */
  async function renderSubjectsArea(classId) {
    const area = $('#cv-subjects-area');
    if (!area) return;
    const subjects = await Backend.subjectsForClass(classId);
    area.innerHTML =
      '<div class="card" style="margin-top:14px">' +
        '<div class="card-head"><div class="card-body"><h3>Subjects of this class</h3>' +
          '<p class="card-note">Total and passing marks are used for result calculation.</p></div></div>' +
        '<div class="subj-add-row">' +
          '<input class="panel-input grow" id="cv-sub-name" placeholder="Subject name" />' +
          '<input class="panel-input" id="cv-sub-total" type="number" min="1" value="100" placeholder="Total" style="max-width:92px" />' +
          '<input class="panel-input" id="cv-sub-passing" type="number" min="0" value="33" placeholder="Passing" style="max-width:92px" />' +
          '<button class="btn primary sm" id="cv-sub-add" type="button">+ Add Subject</button>' +
        '</div>' +
        '<div class="tbl-wrap">' +
          '<table class="data-table">' +
            '<thead><tr><th class="num">#</th><th>Subject</th><th class="num">Total Marks</th><th class="num">Passing Marks</th><th class="actions">Actions</th></tr></thead>' +
            '<tbody>' +
            (subjects.length
              ? subjects.map((s, i) =>
                  '<tr data-subid="' + escHTML(s.id) + '">' +
                    '<td class="num">' + (s.sortOrder != null ? s.sortOrder : i + 1) + '</td>' +
                    '<td>' + escapeHtml(s.name) + '</td>' +
                    '<td class="num">' + s.totalMarks + '</td>' +
                    '<td class="num">' + s.passingMarks + '</td>' +
                    '<td class="actions">' +
                      '<button class="btn outline sm" data-act="edit">Edit</button> ' +
                      '<button class="btn danger sm" data-act="delete">Remove</button>' +
                    '</td>' +
                  '</tr>'
                ).join('')
              : '<tr><td colspan="5" class="empty-row">No subjects yet — add the first one above.</td></tr>') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    const addBtn = $('#cv-sub-add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const name = $('#cv-sub-name').value.trim();
      const total = Number($('#cv-sub-total').value || 0);
      const passing = Number($('#cv-sub-passing').value || 0);
      if (!name) return toast('Enter a subject name.', 'error');
      if (!(total > 0)) return toast('Total marks must be above 0.', 'error');
      try {
        const existing = await Backend.subjectsForClass(classId);
        await Backend.addClassSubject(classId, {
          name, totalMarks: total, passingMarks: passing, sortOrder: existing.length,
        });
        audit('SUBJECT_ADDED', 'class_subject', classId, 'Added subject "' + name + '"', true);
        toast('Subject added.', 'success');
        renderSubjectsArea(classId);
      } catch (e) {
        toast(e.message, 'error');
      }
    });

    area.querySelectorAll('tr[data-subid]').forEach((tr) => {
      const sid = tr.dataset.subid;
      const s = subjects.find((x) => x.id === sid);
      if (!s) return;
      tr.querySelector('[data-act="edit"]').addEventListener('click', async () => {
        const nn = await promptDialog('Edit subject "' + s.name + '"', s.name, { title: 'Edit Subject' });
        if (nn === null) return;
        const total = await promptDialog('Total marks for "' + nn.trim() + '"', String(s.totalMarks), { title: 'Total marks' });
        if (total === null) return;
        const passing = await promptDialog('Passing marks for "' + nn.trim() + '"', String(s.passingMarks), { title: 'Passing marks' });
        if (passing === null) return;
        try {
          await Backend.updateClassSubject(sid, {
            name: nn.trim(),
            totalMarks: Math.max(1, Number(total) || s.totalMarks),
            passingMarks: Math.max(0, Number(passing) || 0),
            sortOrder: s.sortOrder,
          });
          toast('Subject updated.', 'success');
          renderSubjectsArea(classId);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
      tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!(await confirmDialog('Remove subject "' + s.name + '"? Its marks will be deleted.', { danger: true, okText: 'Remove Subject' }))) return;
        try {
          await Backend.deleteClassSubject(sid);
          toast('Subject removed.', 'success');
          renderSubjectsArea(classId);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
  }

  /* ---------------- STUDENT CRUD ---------------- */
  async function addStudentFlow(classId) {
    let selected = classId;
    if (!selected) {
      const classes = await Backend.listClasses();
      if (!classes.length) {
        alertDialog('Create a class first, then add students.');
        return;
      }
      selected = classes[0].id;
    }
    const clsOpts = (await Backend.listClasses()).map((c) =>
      '<option value="' + escHTML(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'
    ).join('');
    const overlay = openModal(
      '<div class="sec-note">Adding a student to this class. The class subjects are set from the class — marks are entered later per student.</div>' +
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Roll number *</label><input class="panel-input" id="st-roll" inputmode="numeric" placeholder="e.g. 101" /></div>' +
        '<div class="panel-field"><label class="panel-label">Student name *</label><input class="panel-input" id="st-name" placeholder="Full name" /></div>' +
        '<div class="panel-field"><label class="panel-label">Father name</label><input class="panel-input" id="st-father" placeholder="Father\u2019s name" /></div>' +
        '<div class="panel-field"><label class="panel-label">Class</label><select class="panel-select" id="st-class">' + clsOpts + '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Gender</label><select class="panel-select" id="st-gender"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option></select></div>' +
        '<div class="panel-field"><label class="panel-label">Date of birth</label><input class="panel-input" id="st-dob" placeholder="e.g. 2008-03-14" /></div>' +
        '<div class="panel-field"><label class="panel-label">Contact</label><input class="panel-input" id="st-contact" /></div>' +
        '<div class="panel-field"><label class="panel-label">Admission info</label><input class="panel-input" id="st-admission" /></div>' +
        '<div class="panel-field full"><label class="panel-label">Notes</label><textarea class="panel-textarea" id="st-notes"></textarea></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="st-save" type="button">Add Student</button>' +
      '</div>',
      { title: 'Add New Student' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#st-save').addEventListener('click', async () => {
      const btn = overlay.querySelector('#st-save');
      const name = $('#st-name').value.trim();
      const roll = $('#st-roll').value.trim();
      if (!name) return toast('Enter the student name.', 'error');
      if (!roll) return toast('Enter the roll number.', 'error');
      btn.disabled = true;
      try {
        const targetClass = $('#st-class').value;
        await Backend.addStudent({
          rollNumber: roll,
          name,
          fatherName: $('#st-father').value.trim(),
          classId: targetClass,
          gender: $('#st-gender').value,
          dob: $('#st-dob').value.trim(),
          contact: $('#st-contact').value.trim(),
          admission: $('#st-admission').value.trim(),
          notes: $('#st-notes').value.trim(),
        });
        audit('STUDENT_CREATED', 'student', '', 'Added student "' + name + '" (Roll ' + roll + ')', true);
        toast('Student added. You can now set their portal PIN.', 'success');
        closeModal(overlay);
        showClassView(targetClass);
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  async function editStudentFlow(student) {
    const clsOpts = (await Backend.listClasses()).map((c) =>
      '<option value="' + escHTML(c.id) + '"' + (c.id === student.classId ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'
    ).join('');
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Roll number</label><input class="panel-input" id="st-roll" value="' + escHTML(student.rollNumber || '') + '" inputmode="numeric" /></div>' +
        '<div class="panel-field"><label class="panel-label">Student name</label><input class="panel-input" id="st-name" value="' + escHTML(student.name || '') + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Father name</label><input class="panel-input" id="st-father" value="' + escHTML(student.fatherName || '') + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Class</label><select class="panel-select" id="st-class">' + clsOpts + '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Gender</label><select class="panel-select" id="st-gender"><option value="">—</option><option value="Male"' + (student.gender === 'Male' ? ' selected' : '') + '>Male</option><option value="Female"' + (student.gender === 'Female' ? ' selected' : '') + '>Female</option></select></div>' +
        '<div class="panel-field"><label class="panel-label">Date of birth</label><input class="panel-input" id="st-dob" value="' + escHTML(student.dob || '') + '" placeholder="e.g. 2008-03-14" /></div>' +
        '<div class="panel-field"><label class="panel-label">Contact</label><input class="panel-input" id="st-contact" value="' + escHTML(student.contact || '') + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Admission info</label><input class="panel-input" id="st-admission" value="' + escHTML(student.admission || '') + '" placeholder="e.g. admission no / date" /></div>' +
        '<div class="panel-field full"><label class="panel-label">Notes</label><textarea class="panel-textarea" id="st-notes">' + escHTML(student.notes || '') + '</textarea></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="st-save" type="button">Save Student</button>' +
      '</div>',
      { title: 'Edit Student' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#st-save').addEventListener('click', async () => {
      const btn = overlay.querySelector('#st-save');
      btn.disabled = true;
      try {
        await Backend.updateStudent(student.id, {
          rollNumber: $('#st-roll').value.trim(),
          name: $('#st-name').value.trim(),
          fatherName: $('#st-father').value.trim(),
          classId: $('#st-class').value,
          gender: $('#st-gender').value,
          dob: $('#st-dob').value.trim(),
          contact: $('#st-contact').value.trim(),
          admission: $('#st-admission').value.trim(),
          notes: $('#st-notes').value.trim(),
        });
        audit('STUDENT_UPDATED', 'student', student.id, 'Updated student "' + $('#st-name').value.trim() + '"', true);
        toast('Student updated.', 'success');
        closeModal(overlay);
        showClassView(student.classId);
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  }

  async function deleteStudentFlow(student) {
    if (!(await confirmDialog('Delete student "' + student.name + '" (Roll ' + student.rollNumber + ')? Their marks will also be deleted. This cannot be undone.', { danger: true, okText: 'Delete Student' }))) return;
    try {
      await Backend.deleteStudent(student.id);
      audit('STUDENT_DELETED', 'student', student.id, 'Deleted student "' + student.name + '"', true);
      toast('Student deleted.', 'success');
      showClassView(student.classId);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function setStudentPinFlow(student) {
    const pin = await promptDialog(
      'Set / reset the portal PIN for ' + student.name + ' (Roll ' + student.rollNumber + '). Give this PIN to the student to view their result online.',
      '',
      { title: 'Student Portal PIN', okText: 'Set PIN' }
    );
    if (pin === null) return;
    if (!pin || String(pin).length < 4) {
      toast('PIN must be at least 4 characters.', 'error');
      return;
    }
    try {
      await Backend.setStudentPin(student.id, pin.trim());
      audit('STUDENT_PIN_RESET', 'student', student.id, 'Set portal PIN for "' + student.name + '"', true);
      toast('Portal PIN set for ' + student.name, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- MARKS ENTRY (all subjects) ---------------- */
  async function renderMarksEditor(studentId, area) {
    let student;
    try {
      student = await Backend.getStudent(studentId);
    } catch (e) {
      area.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Student not found.') + '</div>';
      return;
    }
    let cls = null;
    let subjects = [];
    try {
      cls = await Backend.getClass(student.classId);
      subjects = await Backend.subjectsForClass(student.classId);
    } catch (e) {
      area.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load class data.') + '</div>';
      return;
    }
    const marks = await Backend.getMarks(studentId);
    setMarksCache({ student, cls, subjects, marks });

    if (!subjects.length) {
      area.innerHTML =
        '<div class="empty-state">' +
          '<div class="es-title">No subjects configured for this class</div>' +
          'Add subjects from the class page first, then come back to enter marks. ' +
        '</div>' +
        '<div class="btn-row"><button class="btn outline sm" id="go-class-subjects" type="button">Add Subjects in ' + escapeHtml(cls.name) + '</button></div>';
      const g = $('#go-class-subjects');
      if (g) g.addEventListener('click', () => showClassView(student.classId).then(() => renderSubjectsArea(student.classId)));
      return;
    }

    const boxes = subjects
      .map((sub) => {
        const m = marks.find((x) => x.classSubjectId === sub.id);
        return (
          '<div class="mark-box" data-subid="' + escHTML(sub.id) + '">' +
            '<div class="mb-name"><span>' + escapeHtml(sub.name) + '</span>' +
              '<span class="pill gray">' + sub.totalMarks + ' · pass ' + sub.passingMarks + '</span></div>' +
            '<div class="mb-inputs">' +
              '<label>Obtained<input class="panel-input mb-obtained" type="number" min="0" max="' + sub.totalMarks + '" value="' + (m ? m.obtainedMarks : '') + '" /></label>' +
            '</div>' +
            '<div class="mb-auto"></div>' +
          '</div>'
        );
      })
      .join('');

    area.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<div class="card-icon"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
          '<div class="card-body"><h3>Marks — ' + escapeHtml(student.name) + '</h3>' +
            '<p class="card-note">' + escapeHtml(cls.name) + ' · ' + escapeHtml(cls.classTypeName || '') + ' · Session ' + escapeHtml(student.session || cls.session || '') + '</p></div>' +
        '</div>' +
        '<div class="marks-grid">' + boxes + '</div>' +
        '<div class="btn-row">' +
          '<button class="btn primary sm" id="marks-save-btn" type="button">Save Marks</button> ' +
          '<button class="btn outline sm" id="marks-calc-btn" type="button">Calculate Totals</button>' +
        '</div>' +
      '</div>';

    const autoUpdate = () => {
      const cache = getMarksCache();
      if (!cache) return;
      let total = 0;
      let obtained = 0;
      cache.subjects.forEach((sub) => {
        const box = area.querySelector('.mark-box[data-subid="' + sub.id + '"]');
        if (!box) return;
        const inp = box.querySelector('.mb-obtained');
        const val = Math.max(0, Math.min(Number(inp.value) || 0, sub.totalMarks));
        const pct = sub.totalMarks > 0 ? ((val / sub.totalMarks) * 100).toFixed(1) : '0';
        const pass = val >= sub.passingMarks;
        const auto = box.querySelector('.mb-auto');
        auto.textContent = val + ' / ' + sub.totalMarks + ' (' + pct + '%) ' + (pass ? '✔ Pass' : '✘ Fail');
        auto.style.color = pass ? '#15803d' : '#b91c1c';
        total += sub.totalMarks;
        obtained += val;
      });
      const old = area.querySelector('#marks-run-sum');
      if (old) old.remove();
      const sumEl = document.createElement('div');
      sumEl.id = 'marks-run-sum';
      sumEl.className = 'sec-note';
      sumEl.style.marginTop = '10px';
      sumEl.textContent = 'Running total: ' + obtained + ' / ' + total + ' (' + (total ? ((obtained / total) * 100).toFixed(1) : '0') + '%)';
      const saveBtn = area.querySelector('#marks-save-btn');
      if (saveBtn) saveBtn.closest('.btn-row').before(sumEl);
    };

    area.querySelectorAll('.mb-obtained').forEach((inp) => {
      inp.addEventListener('input', autoUpdate);
    });
    autoUpdate();

    $('#marks-save-btn').addEventListener('click', async () => {
      const cache = getMarksCache();
      const arr = cache.subjects.map((sub) => {
        const box = area.querySelector('.mark-box[data-subid="' + sub.id + '"]');
        const obtained = Math.max(0, Math.min(Number(box.querySelector('.mb-obtained').value) || 0, sub.totalMarks));
        return { classSubjectId: sub.id, totalMarks: sub.totalMarks, obtainedMarks: obtained };
      });
      const btn = $('#marks-save-btn');
      btn.disabled = true;
      try {
        await Backend.saveMarks(studentId, arr);
        audit('MARKS_UPDATED', 'marks', studentId, 'Saved marks for "' + student.name + '"', true);
        toast('Marks saved for ' + student.name, 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      btn.disabled = false;
    });

    $('#marks-calc-btn').addEventListener('click', autoUpdate);
  }

  async function showMarksView(studentId, from) {
    state.view = 'marks';
    state.studentId = studentId;
    state.from = from || 'class';
    let stu = null;
    try {
      stu = await Backend.getStudent(studentId);
    } catch (e) {
      stu = null;
    }
    setNav(true, (stu ? stu.name + ' — ' : '') + 'Enter Marks');
    const wrap = $('#result-content');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Loading marks…</div>';
    await renderMarksEditor(studentId, wrap);
  }

  /* ---------------- SINGLE STUDENT RESULT CARD ---------------- */
  function renderSingleCardInto(holder, ctx) {
    const { student, cls, calc } = ctx;
    const overallClass = calc.overall === 'Pass' ? 'pass' : 'fail';
    holder.innerHTML =
      '<div class="student-result-card">' +
        '<div class="sr-head"><h3>MUSLIM COLLEGE</h3><p>Student Result Card</p></div>' +
        '<div class="sr-body">' +
          '<div class="info-grid">' +
            '<div class="ig"><div class="k">Roll No</div><div class="v">' + escapeHtml(student.rollNumber) + '</div></div>' +
            '<div class="ig"><div class="k">Name</div><div class="v">' + escapeHtml(student.name) + '</div></div>' +
            '<div class="ig"><div class="k">Father Name</div><div class="v">' + escapeHtml(student.fatherName || '—') + '</div></div>' +
            '<div class="ig"><div class="k">Class</div><div class="v">' + escapeHtml(cls.name) + '</div></div>' +
            '<div class="ig"><div class="k">Class Type</div><div class="v">' + escapeHtml(cls.classTypeName || '—') + '</div></div>' +
            '<div class="ig"><div class="k">Session</div><div class="v">' + escapeHtml(student.session || cls.session) + '</div></div>' +
          '</div>' +
          '<table class="subject-marks"><thead><tr><th>Subject</th><th class="num">Total</th><th class="num">Obtained</th><th class="num">%</th><th class="num">Grade</th><th>Status</th></tr></thead><tbody>' +
          calc.rows.map((r) => '<tr><td>' + escapeHtml(r.subjectName) + '</td><td class="num">' + r.totalMarks + '</td><td class="num">' + r.obtainedMarks + '</td><td class="num">' + r.percentage + '%</td><td class="num">' + escapeHtml(r.grade) + '</td><td>' + escapeHtml(r.status) + '</td></tr>').join('') +
          '</tbody></table>' +
          '<div class="sr-summary">' +
            '<div class="ss"><div class="n">' + calc.totalMarks + '</div><div class="l">Total Marks</div></div>' +
            '<div class="ss"><div class="n">' + calc.obtainedMarks + '</div><div class="l">Obtained</div></div>' +
            '<div class="ss"><div class="n">' + calc.percentage + '%</div><div class="l">Percentage</div></div>' +
            '<div class="ss"><div class="n">' + calc.grade + '</div><div class="l">Grade</div></div>' +
          '</div>' +
          '<div class="sr-overall ' + overallClass + '">Overall Result: ' + escapeHtml(calc.overall) + '</div>' +
        '</div>' +
      '</div>';
  }

  async function showStudentResultView(studentId, from) {
    state.view = 'studentresult';
    state.studentId = studentId;
    state.from = from || 'class';
    setNav(true, 'Result Card');
    const wrap = $('#result-content');
    if (!wrap) return;
    try {
      const ctx = await loadStudentResultContext(studentId);
      wrap.innerHTML =
        '<div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:10px">' +
          '<button class="btn primary sm" id="sr-admin-print" type="button">Print</button>' +
          '<button class="btn outline sm" id="sr-admin-pdf" type="button">Download PDF</button>' +
          '<button class="btn outline sm" id="sr-admin-copy" type="button">Copy Info</button>' +
        '</div><div id="single-result-card-holder"><div class="empty-state">Rendering…</div></div>';
      const holder = $('#single-result-card-holder');
      renderSingleCardInto(holder, ctx);
      $('#sr-admin-print').addEventListener('click', () => StudentResultView.printSingleResult(ctx));
      $('#sr-admin-pdf').addEventListener('click', () => StudentResultView.pdfSingleResult(ctx));
      $('#sr-admin-copy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ResultCalc.resultText(ctx.student, ctx.cls, ctx.calc));
          toast('Result copied!', 'success');
        } catch (e) {
          toast('Could not copy automatically.', 'error');
        }
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load result.') + '</div>';
    }
  }

  /* ---------------- CLASS RESULT (print / PDF / CSV) ---------------- */
  function renderClassRows(rows) {
    if (!rows.length) return '<tr><td colspan="8" class="empty-row">No matching students.</td></tr>';
    return rows
      .map(
        (r, i) =>
          '<tr data-rid="' + escHTML(r.student.id) + '">' +
            '<td class="num">' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(r.rollNumber) + '</strong></td>' +
            '<td>' + escapeHtml(r.name) + '</td>' +
            '<td class="num">' + r.totalMarks + '</td>' +
            '<td class="num">' + r.obtainedMarks + '</td>' +
            '<td class="num">' + r.percentage + '%</td>' +
            '<td><span class="pill ' + (r.overall === 'Pass' ? 'green' : 'red') + '">' + escapeHtml(r.overall) + '</span></td>' +
            '<td class="actions"><button class="btn outline sm" data-act="view">Result Card</button></td>' +
          '</tr>'
      )
      .join('');
  }

  async function showClassResultView(classId) {
    state.view = 'classresult';
    state.classId = classId;
    setNav(true, 'Class Result');
    const wrap = $('#result-content');
    if (!wrap) return;
    try {
      const { cls, students, rows } = await loadClassResultContext(classId);
      if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">No students in this class yet.</div>';
        return;
      }
      const data = { cls, students, rows };
      let html = '';
      html +=
        '<div class="adm-toolbar">' +
          '<input class="panel-input grow" id="cr-search" type="search" placeholder="Search roll / name…" />' +
          '<select class="panel-select" id="cr-sort" style="max-width:180px">' +
            '<option value="roll">Sort: Roll No</option>' +
            '<option value="name">Sort: Name</option>' +
            '<option value="pct">Sort: Percentage</option>' +
          '</select>' +
          '<button class="btn outline sm" id="cr-download" type="button">CSV</button>' +
          '<button class="btn primary sm" id="cr-print" type="button">Print</button>' +
          '<button class="btn outline sm" id="cr-pdf" type="button">PDF</button>' +
        '</div>' +
        '<div class="tbl-wrap">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th class="num">Sr</th><th>Roll No</th><th>Student Name</th>' +
              '<th class="num">Total Marks</th><th class="num">Obtained</th><th class="num">Percentage</th><th>Result</th>' +
              '<th class="actions">View</th>' +
            '</tr></thead>' +
            '<tbody id="cr-tbody">' + renderClassRows(rows) + '</tbody>' +
          '</table>' +
        '</div>';
      wrap.innerHTML = html;

      const applyFilter = () => {
        const q = ($('#cr-search').value || '').toLowerCase();
        const sort = $('#cr-sort').value;
        let list = rows.slice();
        if (q) {
          list = list.filter(
            (r) => String(r.rollNumber).toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
          );
        }
        if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === 'pct') list.sort((a, b) => b.percentage - a.percentage);
        else list.sort((a, b) => String(a.rollNumber).localeCompare(String(b.rollNumber), 'en', { numeric: true }));
        data._filtered = list;
        $('#cr-tbody').innerHTML = renderClassRows(list);
      };

      $('#cr-search').addEventListener('input', applyFilter);
      $('#cr-sort').addEventListener('change', applyFilter);
      $('#cr-download').addEventListener('click', () => downloadClassCsv(data));
      $('#cr-print').addEventListener('click', () => printClassResult(data));
      $('#cr-pdf').addEventListener('click', () => pdfClassResult(data));
      wrap.querySelectorAll('#cr-tbody tr[data-rid]').forEach((tr) => {
        tr.querySelector('[data-act="view"]').addEventListener('click', () => {
          showStudentResultView(tr.dataset.rid, 'class');
        });
      });
    } catch (e) {
      wrap.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load class result.') + '</div>';
    }
  }

  function printClassResult(data) {
    const rows = (data._filtered || data.rows).slice();
    const head =
      '<div class="print-card">' +
        '<div class="pc-head"><h1>MUSLIM COLLEGE</h1><div class="pc-sub">Class Result Sheet</div>' +
        '<div class="pc-title">' + escapeHtml(data.cls.name) + ' — ' + escapeHtml(data.cls.classTypeName || '') + ' (' + escapeHtml(data.cls.session || '') + ')</div></div>' +
        '<table class="pc-marks"><thead><tr><th>Sr</th><th>Roll No</th><th>Name</th><th>Total</th><th>Obtained</th><th>%</th><th>Result</th></tr></thead><tbody>';
    const body = rows.map((r, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + escHTML(r.rollNumber) + '</td><td>' + escHTML(r.name) + '</td>' +
      '<td class="num">' + r.totalMarks + '</td><td class="num">' + r.obtainedMarks + '</td><td class="num">' + r.percentage + '%</td>' +
      '<td>' + escHTML(r.overall) + '</td></tr>'
    ).join('');
    const foot = '</tbody></table><div class="pc-foot"><span>Generated ' + fmtDateTime(new Date().toISOString()) + '</span><span>Pass: ' + rows.filter((r) => r.overall === 'Pass').length + ' / ' + rows.length + '</span></div></div>';
    let area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    area.innerHTML = head + body + foot;
    window.print();
  }

  function pdfClassResult(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      toast('PDF engine not loaded — printing instead.', '');
      printClassResult(data);
      return;
    }
    const rows = (data._filtered || data.rows).slice();
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth();
    let y = 44;
    const margin = 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(29, 78, 216);
    doc.text('MUSLIM COLLEGE — CLASS RESULT', W / 2, y, { align: 'center' });
    y += 18;
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(data.cls.name + ' · ' + (data.cls.classTypeName || '') + ' · Session ' + (data.cls.session || ''), W / 2, y, { align: 'center' });
    y += 22;
    const cols = [40, 100, 260, 380, 470, 560, 650, W - 40];
    const headers = ['Sr', 'Roll No', 'Student Name', 'Total Marks', 'Obtained', 'Percentage', 'Result'];
    doc.setFontSize(9);
    doc.setFillColor(238, 242, 255);
    doc.rect(margin, y - 12, W - 2 * margin, 18, 'F');
    headers.forEach((h, i) => doc.text(h, cols[i], y));
    y += 6;
    doc.setFont('helvetica', 'normal');
    rows.forEach((r, i) => {
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 50;
      }
      doc.text(String(i + 1), cols[0], y);
      doc.text(String(r.rollNumber), cols[1], y);
      doc.text(r.name, cols[2], y);
      doc.text(String(r.totalMarks), cols[3], y);
      doc.text(String(r.obtainedMarks), cols[4], y);
      doc.text(r.percentage + '%', cols[5], y);
      doc.text(r.overall, cols[6], y);
      y += 16;
    });
    doc.save('ClassResult-' + data.cls.name.replace(/\s+/g, '_') + '.pdf');
    toast('Class result PDF downloaded!', 'success');
  }

  function downloadClassCsv(data) {
    const rows = (data._filtered || data.rows).slice();
    const lines = ['Sr,Roll No,Student Name,Total Marks,Obtained Marks,Percentage,Result'];
    rows.forEach((r, i) => {
      lines.push([i + 1, r.rollNumber, '"' + r.name.replace(/"/g, '""') + '"', r.totalMarks, r.obtainedMarks, r.percentage, r.overall].join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ClassResult-' + data.cls.name.replace(/\s+/g, '_') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('CSV downloaded!', 'success');
  }

  /* ---------------- ROLL SEARCH (top of the Result tab) ---------------- */
  let docHitGuardBound = false;
  function wireRollSearch() {
    const inp = $('#result-roll-search');
    const hits = $('#result-roll-hits');
    if (!inp || !hits) return;
    inp.oninput = async () => {
      const q = inp.value.trim();
      if (!q) {
        hits.classList.add('hidden');
        hits.innerHTML = '';
        return;
      }
      try {
        const list = await Backend.listStudents({ search: q });
        const top = list.slice(0, 8);
        hits.innerHTML = top.length
          ? top.map((s) =>
              '<button class="rh-hit" data-id="' + escHTML(s.id) + '" type="button">' +
                '<strong>' + escapeHtml(s.rollNumber) + '</strong> ' + escapeHtml(s.name) +
                ' <span class="muted">' + escapeHtml(s.className || '') + '</span>' +
              '</button>'
            ).join('')
          : '<div class="rh-empty">No student found for "' + escapeHtml(q) + '"</div>';
        hits.classList.remove('hidden');
        hits.querySelectorAll('.rh-hit').forEach((b) => {
          b.addEventListener('click', () => {
            hits.classList.add('hidden');
            hits.innerHTML = '';
            inp.value = '';
            showMarksView(b.dataset.id, 'home');
          });
        });
      } catch (e) {
        hits.classList.add('hidden');
      }
    };
    if (!docHitGuardBound) {
      docHitGuardBound = true;
      document.addEventListener('click', (ev) => {
        const h = $('#result-roll-hits');
        const i = $('#result-roll-search');
        if (!h) return;
        if (h.contains(ev.target) || (i && i.contains(ev.target))) return;
        h.classList.add('hidden');
        h.innerHTML = '';
      });
    }
  }

  /* ---------------- CLASS TYPES manager ---------------- */
  async function manageClassTypes() {
    const types = await Backend.listClassTypes();
    const overlay = openModal(
      '<div class="adm-toolbar">' +
        '<input class="panel-input grow" id="ct-new-name" placeholder="New class type, e.g. Commerce" />' +
        '<button class="btn primary sm" id="ct-add" type="button">+ Add</button>' +
      '</div>' +
      '<div class="tbl-wrap">' +
        '<table class="data-table"><thead><tr><th>Class Type</th><th class="actions">Actions</th></tr></thead>' +
        '<tbody id="ct-body">' +
        (types.length
          ? types.map((t) =>
              '<tr data-ctid="' + escHTML(t.id) + '">' +
                '<td><strong>' + escapeHtml(t.name) + '</strong></td>' +
                '<td class="actions">' +
                  '<button class="btn outline sm" data-act="edit">Rename</button> ' +
                  '<button class="btn danger sm" data-act="delete">Delete</button>' +
                '</td></tr>'
            ).join('')
          : '<tr><td colspan="2" class="empty-row">No class types yet.</td></tr>') +
        '</tbody></table>' +
      '</div>' +
      '<div class="btn-row"><button class="btn outline sm modal-close-custom" type="button">Close</button></div>',
      { title: 'Manage class types' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));

    const body = overlay.querySelector('#ct-body');
    if (body) {
      body.querySelectorAll('tr[data-ctid]').forEach((tr) => {
        const id = tr.dataset.ctid;
        const name = types.find((t) => t.id === id).name;
        tr.querySelector('[data-act="edit"]').addEventListener('click', async () => {
          const nn = await promptDialog('Rename class type "' + name + '"', name, { title: 'Rename' });
          if (nn === null || !nn.trim()) return;
          try {
            await Backend.updateClassType(id, nn.trim());
            toast('Class type renamed.', 'success');
            closeModal(overlay);
            manageClassTypes();
          } catch (e) {
            toast(e.message, 'error');
          }
        });
        tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          if (!(await confirmDialog('Delete class type "' + name + '"? Classes using it must be deleted or moved first.', { danger: true, okText: 'Delete' }))) return;
          try {
            await Backend.deleteClassType(id);
            toast('Class type deleted.', 'success');
            closeModal(overlay);
            manageClassTypes();
          } catch (e) {
            toast(e.message, 'error');
          }
        });
      });
    }

    const addBtn = overlay.querySelector('#ct-add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      const nn = $('#ct-new-name').value.trim();
      if (!nn) return toast('Enter a class type name.', 'error');
      try {
        await Backend.addClassType(nn);
        toast('Class type added.', 'success');
        closeModal(overlay);
        manageClassTypes();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  /* ---------------- entry points ---------------- */
  async function refreshAll() {
    await showHome();
    wireRollSearch();
  }

  function wireResultTabs() {
    wireRollSearch();
  }

  return { refreshAll, wireResultTabs };
})();