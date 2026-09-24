/* ============================================================
   ADMIN — Result Management (classes, class types, subjects,
   students, marks, class result, student result).
   ============================================================ */
'use strict';

const ResultMgmt = (() => {
  /* ---------------- generic populators ---------------- */
  async function fillClassSelect(sel, placeholder) {
    const classes = await Backend.listClasses();
    sel.innerHTML = '<option value="">' + escapeHtml(placeholder || 'Select class…') + '</option>';
    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.session ? ' (' + c.session + ')' : '') + ' — ' + (c.classTypeName || '');
      sel.appendChild(opt);
    });
    return classes;
  }

  async function fillTypeSelect(sel) {
    const types = await Backend.listClassTypes();
    sel.innerHTML = '';
    types.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
    return types;
  }

  async function fillClassTypeMeta() {
    const classes = await Backend.listClasses();
    const typeById = {};
    (await Backend.listClassTypes()).forEach((t) => (typeById[t.id] = t));
    return { classes, typeById };
  }

  /* ---------------- CLASSES ---------------- */
  async function renderClasses() {
    const wrap = $('#classes-table-wrap');
    if (!wrap) return;
    const q = $('#class-search') ? $('#class-search').value.trim().toLowerCase() : '';
    let classes = await Backend.listClasses();
    if (q) {
      classes = classes.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.classTypeName || '').toLowerCase().includes(q) ||
          (c.session || '').toLowerCase().includes(q)
      );
    }
    if (!classes.length) {
      wrap.innerHTML =
        '<div class="empty-state"><div class="es-title">No classes found</div>' +
        'Create a class to begin managing students, subjects and results.</div>';
      return;
    }
    wrap.innerHTML =
      '<table class="data-table">' +
        '<thead><tr><th>Class</th><th>Type</th><th>Session</th><th class="num">Subjects</th><th class="num">Students</th><th class="actions">Actions</th></tr></thead>' +
        '<tbody>' +
        classes.map((c) =>
          '<tr data-classid="' + escHTML(c.id) + '">' +
            '<td><strong>' + escapeHtml(c.name) + '</strong></td>' +
            '<td>' + escapeHtml(c.classTypeName || '—') + '</td>' +
            '<td>' + escapeHtml(c.session || '—') + '</td>' +
            '<td class="num">' + c.subjectCount + '</td>' +
            '<td class="num">' + c.studentCount + '</td>' +
            '<td class="actions">' +
              '<button class="btn outline sm" data-act="subjects" title="Manage subjects">Subjects</button> ' +
              '<button class="btn outline sm" data-act="edit" title="Edit class">Edit</button> ' +
              '<button class="btn danger sm" data-act="delete" title="Delete class">Delete</button>' +
            '</td>' +
          '</tr>'
        ).join('') +
        '</tbody>' +
      '</table>';

    wrap.querySelectorAll('tr[data-classid]').forEach((tr) => {
      const id = tr.dataset.classid;
      tr.querySelector('[data-act="subjects"]').addEventListener('click', () => {
        switchResultSec('subjects');
        $('#subject-class-select').value = id;
        renderSubjects();
      });
      tr.querySelector('[data-act="edit"]').addEventListener('click', () => editClass(id));
      tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteClass(id));
    });
  }

  async function editClass(id) {
    const info = await fillClassTypeMeta();
    const cls = info.classes.find((c) => c.id === id);
    if (!cls) return toast('Class not found.', 'error');
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Class name</label><input class="panel-input" id="cls-name" value="' + escHTML(cls.name) + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Class type</label><select class="panel-select" id="cls-type">' +
          info.classTypes.map((t) => '<option value="' + escHTML(t.id) + '"' + (t.id === cls.classTypeId ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('') +
        '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Session / Year</label><input class="panel-input" id="cls-session" value="' + escHTML(cls.session || '') + '" placeholder="e.g. 2025-2026" /></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="cls-save" type="button">Save Class</button>' +
      '</div>',
      { title: 'Edit Class' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#cls-save').addEventListener('click', async () => {
      overlay.querySelector('#cls-save').disabled = true;
      try {
        await Backend.updateClass(id, {
          name: $('#cls-name').value,
          classTypeId: $('#cls-type').value,
          session: $('#cls-session').value,
        });
        audit('CLASS_UPDATED', 'class', id, 'Edited class "' + $('#cls-name').value.trim() + '"', true);
        toast('Class updated.', 'success');
        closeModal(overlay);
        renderClasses();
      } catch (e) {
        toast(e.message, 'error');
        overlay.querySelector('#cls-save').disabled = false;
      }
    });
  }

  async function addClassFlow() {
    const info = await fillClassTypeMeta();
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Class name</label><input class="panel-input" id="cls-name" placeholder="e.g. First Year" /></div>' +
        '<div class="panel-field"><label class="panel-label">Class type</label><select class="panel-select" id="cls-type">' +
          info.classTypes.map((t) => '<option value="' + escHTML(t.id) + '">' + escapeHtml(t.name) + '</option>').join('') +
        '</select></div>' +
        '<div class="panel-field"><label class="panel-label">Session / Year</label><input class="panel-input" id="cls-session" placeholder="e.g. 2025-2026" /></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="cls-save" type="button">Create Class</button>' +
      '</div>',
      { title: 'Add Class' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#cls-save').addEventListener('click', async () => {
      overlay.querySelector('#cls-save').disabled = true;
      try {
        await Backend.addClass({
          name: $('#cls-name').value,
          classTypeId: $('#cls-type').value,
          session: $('#cls-session').value,
        });
        audit('CLASS_CREATED', 'class', '', 'Created class "' + $('#cls-name').value.trim() + '"', true);
        toast('Class created. Add subjects now.', 'success');
        closeModal(overlay);
        renderClasses();
      } catch (e) {
        toast(e.message, 'error');
        overlay.querySelector('#cls-save').disabled = false;
      }
    });
  }

  async function deleteClass(id) {
    if (!(await confirmDialog('Delete this class? Its subjects will also be removed. (Classes with students must remove students first.)', { danger: true, okText: 'Delete Class' }))) return;
    try {
      await Backend.deleteClass(id);
      audit('CLASS_DELETED', 'class', id, 'Deleted class', true);
      toast('Class deleted.', 'success');
      renderClasses();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- CLASS TYPES ---------------- */
  async function renderClassTypes() {
    const wrap = $('#classtypes-table-wrap');
    if (!wrap) return;
    const types = await Backend.listClassTypes();
    wrap.innerHTML =
      '<table class="data-table">' +
        '<thead><tr><th>Class Type</th><th class="actions">Actions</th></tr></thead>' +
        '<tbody>' +
        (types.length ? types.map((t) =>
          '<tr data-ctid="' + escHTML(t.id) + '">' +
            '<td><strong>' + escapeHtml(t.name) + '</strong></td>' +
            '<td class="actions">' +
              '<button class="btn outline sm" data-act="edit">Rename</button> ' +
              '<button class="btn danger sm" data-act="delete">Delete</button>' +
            '</td>' +
          '</tr>'
        ).join('') : '<tr><td colspan="2" class="empty-row">No class types yet.</td></tr>') +
        '</tbody>' +
      '</table>';

    wrap.querySelectorAll('tr[data-ctid]').forEach((tr) => {
      const id = tr.dataset.ctid;
      const name = types.find((t) => t.id === id).name;
      tr.querySelector('[data-act="edit"]').addEventListener('click', async () => {
        const nn = await promptDialog('Rename class type "' + name + '"', name, { title: 'Rename' });
        if (nn === null || !nn.trim()) return;
        try {
          await Backend.updateClassType(id, nn);
          audit('CLASS_TYPE_UPDATED', 'class_type', id, 'Renamed to "' + nn.trim() + '"', true);
          toast('Class type renamed.', 'success');
          renderClassTypes();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
      tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!(await confirmDialog('Delete class type "' + name + '"?', { danger: true, okText: 'Delete' }))) return;
        try {
          await Backend.deleteClassType(id);
          toast('Class type deleted.', 'success');
          renderClassTypes();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
  }

  /* ---------------- SUBJECTS (per class) ---------------- */
  async function renderSubjects() {
    const sel = $('#subject-class-select');
    const wrap = $('#subjects-table-wrap');
    if (!sel || !wrap) return;
    const classId = sel.value;
    if (!classId) {
      wrap.innerHTML = '<div class="empty-state">Select a class to configure its subjects.</div>';
      return;
    }
    const subjects = await Backend.subjectsForClass(classId);
    if (!subjects.length) {
      wrap.innerHTML = '<div class="empty-state">No subjects configured yet. Add the first subject below.</div>';
      return;
    }
    wrap.innerHTML =
      '<table class="data-table">' +
        '<thead><tr><th class="num">#</th><th>Subject</th><th class="num">Total Marks</th><th class="num">Passing Marks</th><th class="actions">Actions</th></tr></thead>' +
        '<tbody>' +
        subjects.map((s) =>
          '<tr data-subid="' + escHTML(s.id) + '">' +
            '<td class="num">' + (s.sortOrder || 0) + '</td>' +
            '<td>' + escapeHtml(s.name) + '</td>' +
            '<td class="num">' + s.totalMarks + '</td>' +
            '<td class="num">' + s.passingMarks + '</td>' +
            '<td class="actions">' +
              '<button class="btn outline sm" data-act="up" title="Move up">↑</button> ' +
              '<button class="btn outline sm" data-act="down" title="Move down">↓</button> ' +
              '<button class="btn outline sm" data-act="edit">Edit</button> ' +
              '<button class="btn danger sm" data-act="delete">Remove</button>' +
            '</td>' +
          '</tr>'
        ).join('') +
        '</tbody>' +
      '</table>';

    wrap.querySelectorAll('tr[data-subid]').forEach((tr) => {
      const sid = tr.dataset.subid;
      const idx = subjects.findIndex((s) => s.id === sid);
      tr.querySelector('[data-act="up"]').addEventListener('click', async () => {
        if (idx <= 0) return;
        const a = subjects[idx - 1];
        const b = subjects[idx];
        await Backend.updateClassSubject(a.id, { sortOrder: b.sortOrder });
        await Backend.updateClassSubject(b.id, { sortOrder: a.sortOrder });
        renderSubjects();
      });
      tr.querySelector('[data-act="down"]').addEventListener('click', async () => {
        if (idx >= subjects.length - 1) return;
        const a = subjects[idx];
        const b = subjects[idx + 1];
        await Backend.updateClassSubject(b.id, { sortOrder: a.sortOrder });
        await Backend.updateClassSubject(a.id, { sortOrder: b.sortOrder });
        renderSubjects();
      });
      tr.querySelector('[data-act="edit"]').addEventListener('click', () => editSubject(sid));
      tr.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        const s = subjects.find((x) => x.id === sid);
        if (!(await confirmDialog('Remove subject "' + s.name + '"? Its marks will be deleted.', { danger: true, okText: 'Remove Subject' }))) return;
        try {
          await Backend.deleteClassSubject(sid);
          toast('Subject removed.', 'success');
          renderSubjects();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
  }

  async function editSubject(id) {
    const classId = $('#subject-class-select').value;
    const subjects = await Backend.subjectsForClass(classId);
    const s = subjects.find((x) => x.id === id);
    if (!s) return;
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Subject name</label><input class="panel-input" id="sub-name" value="' + escHTML(s.name) + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Total marks</label><input class="panel-input" id="sub-total" type="number" min="1" value="' + s.totalMarks + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Passing marks</label><input class="panel-input" id="sub-passing" type="number" min="0" value="' + s.passingMarks + '" /></div>' +
        '<div class="panel-field"><label class="panel-label">Order</label><input class="panel-input" id="sub-order" type="number" min="0" value="' + (s.sortOrder || 0) + '" /></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn outline sm modal-close-custom" type="button">Cancel</button>' +
        '<button class="btn primary sm" id="sub-save" type="button">Save Subject</button>' +
      '</div>',
      { title: 'Edit Subject' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#sub-save').addEventListener('click', async () => {
      try {
        await Backend.updateClassSubject(id, {
          name: $('#sub-name').value,
          totalMarks: Number($('#sub-total').value),
          passingMarks: Number($('#sub-passing').value),
          sortOrder: Number($('#sub-order').value),
        });
        toast('Subject updated.', 'success');
        closeModal(overlay);
        renderSubjects();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  async function addSubjectFlow() {
    const classId = $('#subject-class-select').value;
    if (!classId) return toast('Select a class first.', 'error');
    try {
      const existing = await Backend.subjectsForClass(classId);
      await Backend.addClassSubject(classId, {
        name: $('#subject-name').value,
        totalMarks: Number($('#subject-total').value || 100),
        passingMarks: Number($('#subject-passing').value || 0),
        sortOrder: existing.length,
      });
      audit('SUBJECT_ADDED', 'class_subject', classId, 'Added subject "' + $('#subject-name').value.trim() + '"', true);
      $('#subject-name').value = '';
      toast('Subject added.', 'success');
      renderSubjects();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- STUDENTS ---------------- */
  async function renderStudents() {
    const wrap = $('#students-table-wrap');
    if (!wrap) return;
    const classId = $('#student-class-filter').value;
    const search = $('#student-search').value.trim();
    let students = await Backend.listStudents({ classId: classId || undefined, search: search || undefined });
    if (!students.length) {
      wrap.innerHTML =
        '<div class="empty-state"><div class="es-title">No students found</div>' +
        'Add students to start entering marks.</div>';
      return;
    }
    wrap.innerHTML =
      '<table class="data-table">' +
        '<thead><tr><th class="num">Sr</th><th>Roll No</th><th>Student Name</th><th>Father Name</th><th>Class</th><th>Session</th><th class="actions">Actions</th></tr></thead>' +
        '<tbody>' +
        students.map((st, i) =>
          '<tr data-stuid="' + escHTML(st.id) + '">' +
            '<td class="num">' + (st.serial || i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(st.rollNumber) + '</strong></td>' +
            '<td>' + escapeHtml(st.name) + '</td>' +
            '<td>' + escapeHtml(st.fatherName || '—') + '</td>' +
            '<td>' + escapeHtml(st.className || '—') + '</td>' +
            '<td>' + escapeHtml(st.session || '—') + '</td>' +
            '<td class="actions">' +
              '<button class="btn outline sm" data-act="view">View</button> ' +
              '<button class="btn outline sm" data-act="marks">Marks</button> ' +
              '<button class="btn outline sm" data-act="pin">PIN</button> ' +
              '<button class="btn outline sm" data-act="edit">Edit</button> ' +
              '<button class="btn danger sm" data-act="delete">Delete</button>' +
            '</td>' +
          '</tr>'
        ).join('') +
        '</tbody>' +
      '</table>';

    wrap.querySelectorAll('tr[data-stuid]').forEach((tr) => {
      const id = tr.dataset.stuid;
      const student = students.find((s) => s.id === id);
      tr.querySelector('[data-act="view"]').addEventListener('click', () => viewStudent(student));
      tr.querySelector('[data-act="marks"]').addEventListener('click', () => {
        switchResultSec('marks');
        $('#marks-student-select').value = id;
        renderMarksEntry();
      });
      tr.querySelector('[data-act="pin"]').addEventListener('click', () => setStudentPinFlow(id, student));
      tr.querySelector('[data-act="edit"]').addEventListener('click', () => editStudent(id, student));
      tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteStudentFlow(id, student));
    });
  }

  async function studentClassOptions(selectedId) {
    const classes = await Backend.listClasses();
    return classes.map((c) => '<option value="' + escHTML(c.id) + '"' + (c.id === selectedId ? ' selected' : '') + '>' + escapeHtml(c.name + (c.session ? ' (' + c.session + ')' : '')) + '</option>').join('');
  }

  async function editStudent(id, student) {
    const clsOpts = await studentClassOptions(student.classId);
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
      overlay.querySelector('#st-save').disabled = true;
      try {
        await Backend.updateStudent(id, {
          rollNumber: $('#st-roll').value,
          name: $('#st-name').value,
          fatherName: $('#st-father').value,
          classId: $('#st-class').value,
          gender: $('#st-gender').value,
          dob: $('#st-dob').value,
          contact: $('#st-contact').value,
          admission: $('#st-admission').value,
          notes: $('#st-notes').value,
        });
        audit('STUDENT_UPDATED', 'student', id, 'Updated student "' + $('#st-name').value.trim() + '"', true);
        toast('Student updated.', 'success');
        closeModal(overlay);
        renderStudents();
      } catch (e) {
        toast(e.message, 'error');
        overlay.querySelector('#st-save').disabled = false;
      }
    });
  }

  async function addStudentFlow() {
    const classId = $('#student-class-filter').value;
    let selected = classId;
    if (!selected) {
      const classes = await Backend.listClasses();
      if (classes.length) selected = classes[0].id;
    }
    const clsOpts = await studentClassOptions(selected);
    if (!clsOpts) {
      alertDialog('Create a class first, then add students.');
      return;
    }
    const overlay = openModal(
      '<div class="form-grid">' +
        '<div class="panel-field"><label class="panel-label">Roll number</label><input class="panel-input" id="st-roll" inputmode="numeric" placeholder="e.g. 101" /></div>' +
        '<div class="panel-field"><label class="panel-label">Student name</label><input class="panel-input" id="st-name" placeholder="Full name" /></div>' +
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
      { title: 'Add Student' }
    );
    overlay.querySelector('.modal-close-custom').addEventListener('click', () => closeModal(overlay));
    overlay.querySelector('#st-save').addEventListener('click', async () => {
      overlay.querySelector('#st-save').disabled = true;
      try {
        await Backend.addStudent({
          rollNumber: $('#st-roll').value,
          name: $('#st-name').value,
          fatherName: $('#st-father').value,
          classId: $('#st-class').value,
          gender: $('#st-gender').value,
          dob: $('#st-dob').value,
          contact: $('#st-contact').value,
          admission: $('#st-admission').value,
          notes: $('#st-notes').value,
        });
        audit('STUDENT_CREATED', 'student', '', 'Added student "' + $('#st-name').value.trim() + '"', true);
        toast('Student added. You can now set their portal PIN.', 'success');
        closeModal(overlay);
        renderStudents();
      } catch (e) {
        toast(e.message, 'error');
        overlay.querySelector('#st-save').disabled = false;
      }
    });
  }

  async function deleteStudentFlow(id, student) {
    if (!(await confirmDialog('Delete student "' + student.name + '" (Roll ' + student.rollNumber + ')? Their marks will also be deleted. This cannot be undone.', { danger: true, okText: 'Delete Student' }))) return;
    try {
      await Backend.deleteStudent(id);
      audit('STUDENT_DELETED', 'student', id, 'Deleted student "' + student.name + '"', true);
      toast('Student deleted.', 'success');
      renderStudents();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function viewStudent(student) {
    const overlay = openModal(
      '<div class="info-grid">' +
        '<div class="ig"><div class="k">Roll No</div><div class="v">' + escapeHtml(student.rollNumber) + '</div></div>' +
        '<div class="ig"><div class="k">Serial No</div><div class="v">' + escapeHtml(String(student.serial || '')) + '</div></div>' +
        '<div class="ig"><div class="k">Name</div><div class="v">' + escapeHtml(student.name) + '</div></div>' +
        '<div class="ig"><div class="k">Father Name</div><div class="v">' + escapeHtml(student.fatherName || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Class</div><div class="v">' + escapeHtml(student.className || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Class Type</div><div class="v">' + escapeHtml(student.classTypeName || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Session</div><div class="v">' + escapeHtml(student.session || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Gender</div><div class="v">' + escapeHtml(student.gender || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Date of Birth</div><div class="v">' + escapeHtml(student.dob || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Contact</div><div class="v">' + escapeHtml(student.contact || '—') + '</div></div>' +
        '<div class="ig"><div class="k">Admission</div><div class="v">' + escapeHtml(student.admission || '—') + '</div></div>' +
        '<div class="ig full"><div class="k">Notes</div><div class="v">' + escapeHtml(student.notes || '—') + '</div></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn primary sm" id="view-result-btn" type="button">View Result Card</button>' +
      '</div>',
      { title: 'Student Profile' }
    );
    overlay.querySelector('#view-result-btn').addEventListener('click', () => {
      closeModal(overlay);
      switchResultSec('studentresult');
      populateSingleResultSelect().then(() => {
        $('#singleresult-student-select').value = student.id;
        renderSingleResult();
      });
    });
  }

  async function setStudentPinFlow(id, student) {
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
      await Backend.setStudentPin(id, pin);
      audit('STUDENT_PIN_RESET', 'student', id, 'Set portal PIN for "' + student.name + '"', true);
      toast('Portal PIN set for ' + student.name, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* ---------------- MARKS ENTRY ---------------- */
  let marksCache = null;

  function setMarksCache(s) {
    marksCache = s;
  }
  function getMarksCache() {
    return marksCache;
  }

  async function renderMarksEntry() {
    const sel = $('#marks-student-select');
    const area = $('#marks-entry-area');
    if (!sel || !area) return;
    const studentId = sel.value;
    if (!studentId) {
      area.innerHTML = '<div class="empty-state">Choose a student to enter marks.</div>';
      return;
    }
    try {
      const student = await Backend.getStudent(studentId);
      const cls = await Backend.getClass(student.classId);
      const subjects = await Backend.subjectsForClass(student.classId);
      const marks = await Backend.getMarks(studentId);
      setMarksCache({ student, cls, subjects, marks });

      if (!subjects.length) {
        area.innerHTML =
          '<div class="empty-state">This class has no subjects configured. Go to <b>Subjects</b> and add subjects first.</div>';
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
          const box = document.querySelector('.mark-box[data-subid="' + sub.id + '"]');
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
        document.querySelectorAll('.mb-auto').forEach(() => {});
        const sumEl = document.createElement('div');
        sumEl.className = 'sec-note';
        sumEl.style.marginTop = '10px';
        sumEl.textContent = 'Running total: ' + obtained + ' / ' + total + ' (' + (total ? ((obtained / total) * 100).toFixed(1) : '0') + '%)';
        const old = document.getElementById('marks-run-sum');
        if (old) old.remove();
        sumEl.id = 'marks-run-sum';
        document.getElementById('marks-save-btn').closest('.btn-row').before(sumEl);
      };

      area.querySelectorAll('.mb-obtained').forEach((inp) => {
        inp.addEventListener('input', autoUpdate);
      });
      autoUpdate();

      $('#marks-save-btn').addEventListener('click', async () => {
        const cache = getMarksCache();
        const arr = cache.subjects.map((sub) => {
          const box = document.querySelector('.mark-box[data-subid="' + sub.id + '"]');
          const obtained = Math.max(0, Math.min(Number(box.querySelector('.mb-obtained').value) || 0, sub.totalMarks));
          return { classSubjectId: sub.id, totalMarks: sub.totalMarks, obtainedMarks: obtained };
        });
        $('#marks-save-btn').disabled = true;
        try {
          await Backend.saveMarks(studentId, arr);
          audit('MARKS_UPDATED', 'marks', studentId, 'Saved marks for "' + student.name + '"', true);
          toast('Marks saved for ' + student.name, 'success');
        } catch (e) {
          toast(e.message, 'error');
        }
        $('#marks-save-btn').disabled = false;
      });

      $('#marks-calc-btn').addEventListener('click', autoUpdate);
    } catch (e) {
      area.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Error loading marks.') + '</div>';
    }
  }

  async function populateMarksStudentSelect() {
    const sel = $('#marks-student-select');
    if (!sel) return;
    const students = await Backend.listStudents({});
    sel.innerHTML = '<option value="">Select a student…</option>';
    students.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.rollNumber + ' — ' + s.name + (s.className ? ' (' + s.className + ')' : '');
      sel.appendChild(opt);
    });
  }

  /* ---------------- SINGLE STUDENT RESULT ---------------- */
  async function populateSingleResultSelect() {
    const sel = $('#singleresult-student-select');
    if (!sel) return;
    const students = await Backend.listStudents({});
    sel.innerHTML = '<option value="">Select a student…</option>';
    students.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.rollNumber + ' — ' + s.name + (s.className ? ' (' + s.className + ')' : '');
      sel.appendChild(opt);
    });
  }

  async function renderSingleResult() {
    const sel = $('#singleresult-student-select');
    const area = $('#single-result-area');
    if (!sel || !area) return;
    const id = sel.value;
    if (!id) {
      area.innerHTML = '<div class="empty-state">Select a student to view and print their result card.</div>';
      return;
    }
    try {
      const ctx = await loadStudentResultContext(id);
      area.innerHTML = '<div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:10px">' +
        '<button class="btn primary sm" id="sr-admin-print" type="button">Print</button>' +
        '<button class="btn outline sm" id="sr-admin-pdf" type="button">Download PDF</button>' +
        '<button class="btn outline sm" id="sr-admin-copy" type="button">Copy Info</button>' +
      '</div><div id="single-result-card-holder"></div>';
      // Render the card directly (the admin session is not a student
      // session, so we must NOT mount the student portal view here):
      const holder = area.querySelector('#single-result-card-holder');
      holder.innerHTML = '<div class="empty-state">Rendering…</div>';
      renderSingleCardInto(holder, ctx);
      $('#sr-admin-print').addEventListener('click', () => StudentResultView.printSingleResult(ctx));
      $('#sr-admin-pdf').addEventListener('click', () => StudentResultView.pdfSingleResult(ctx));
      $('#sr-admin-copy').addEventListener('click', async () => {
        const text = ResultCalc.resultText(ctx.student, ctx.cls, ctx.calc);
        try {
          await navigator.clipboard.writeText(text);
          toast('Result copied!', 'success');
        } catch (e) {
          toast('Could not copy automatically.', 'error');
        }
      });
    } catch (e) {
      area.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load result.') + '</div>';
    }
  }

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

  /* ---------------- CLASS RESULT ---------------- */
  async function renderClassResult() {
    const sel = $('#classresult-class-select');
    const area = $('#class-result-area');
    if (!sel || !area) return;
    const classId = sel.value;
    if (!classId) {
      area.innerHTML = '<div class="empty-state">Select a class to generate the complete class result.</div>';
      return;
    }
    try {
      const { cls, students, rows } = await loadClassResultContext(classId);
      if (!rows.length) {
        area.innerHTML = '<div class="empty-state">No students in this class yet.</div>';
        return;
      }
      window.__classResultData = { cls, students, rows };
      let filtered = rows;
      let html = '';
      html +=
        '<div class="adm-toolbar">' +
          '<input class="panel-input grow" id="cr-search" type="search" placeholder="Search roll / name…" />' +
          '<select class="panel-select" id="cr-sort" style="max-width:180px">' +
            '<option value="roll">Sort: Roll No</option>' +
            '<option value="name">Sort: Name</option>' +
            '<option value="pct">Sort: Percentage</option>' +
          '</select>' +
          '<button class="btn outline sm" id="cr-download" type="button">Download CSV</button>' +
        '</div>' +
        '<div class="tbl-wrap">' +
          '<table class="data-table">' +
            '<thead><tr>' +
              '<th class="num">Sr</th><th>Roll No</th><th>Student Name</th>' +
              '<th class="num">Total Marks</th><th class="num">Obtained</th><th class="num">Percentage</th><th>Result</th>' +
              '<th class="actions">View</th>' +
            '</tr></thead>' +
            '<tbody id="cr-tbody">' +
              renderClassRows(filtered, 'cr') +
            '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="btn primary sm" id="cr-print-top" type="button">Print Class Result</button> ' +
        '</div>';

      area.innerHTML = html;

      const applyFilter = () => {
        const q = ($('#cr-search').value || '').toLowerCase();
        const sort = $('#cr-sort').value;
        let list = window.__classResultData.rows.slice();
        if (q) {
          list = list.filter(
            (r) =>
              String(r.rollNumber).toLowerCase().includes(q) ||
              r.name.toLowerCase().includes(q)
          );
        }
        if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === 'pct') list.sort((a, b) => b.percentage - a.percentage);
        else list.sort((a, b) => String(a.rollNumber).localeCompare(String(b.rollNumber), 'en', { numeric: true }));
        $('#cr-tbody').innerHTML = renderClassRows(list, 'cr-f');
        window.__classResultData._filtered = list;
      };

      $('#cr-search').addEventListener('input', applyFilter);
      $('#cr-sort').addEventListener('change', applyFilter);
      $('#cr-download').addEventListener('click', () => downloadClassCsv(window.__classResultData));
      $('#cr-print-top').addEventListener('click', () => printClassResult(window.__classResultData));
      area.querySelectorAll('#cr-tbody tr[data-rid]').forEach((tr) => {
        tr.querySelector('[data-act]').addEventListener('click', () => {
          const rid = tr.dataset.rid;
          switchResultSec('studentresult');
          $('#singleresult-student-select').value = rid;
          renderSingleResult();
        });
      });
      $('#classresult-print-btn').addEventListener('click', () => printClassResult(window.__classResultData));
      $('#classresult-pdf-btn').addEventListener('click', () => pdfClassResult(window.__classResultData));
    } catch (e) {
      area.innerHTML = '<div class="empty-state">' + escapeHtml(e.message || 'Could not load class result.') + '</div>';
    }
  }

  function renderClassRows(rows, prefix) {
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
            '<td class="actions"><button class="btn outline sm ' + prefix + '-view" data-act="view">Result Card</button></td>' +
          '</tr>'
      )
      .join('');
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

  /* ---------------- sub-tab switching ---------------- */
  function switchResultSec(sec) {
    document.querySelectorAll('.result-subtabs .adm-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.resultsec === sec);
    });
    document.querySelectorAll('.result-sec').forEach((el) => {
      el.classList.toggle('hidden', el.id !== 'result-sec-' + sec);
    });
  }

  async function wireResultTabs() {
    const tabs = document.querySelectorAll('.result-subtabs .adm-tab');
    tabs.forEach((t) => {
      t.addEventListener('click', () => switchResultSec(t.dataset.resultsec));
    });

    // Classes
    const addClassBtn = $('#add-class-btn');
    if (addClassBtn) addClassBtn.addEventListener('click', addClassFlow);
    const classSearch = $('#class-search');
    if (classSearch) classSearch.addEventListener('input', renderClasses);

    // Class types
    const addCtBtn = $('#add-classtype-btn');
    if (addCtBtn) {
      addCtBtn.addEventListener('click', async () => {
        const name = $('#classtype-name').value.trim();
        if (!name) return toast('Enter a class type name.', 'error');
        try {
          await Backend.addClassType(name);
          audit('CLASS_TYPE_CREATED', 'class_type', '', 'Created class type "' + name + '"', true);
          $('#classtype-name').value = '';
          toast('Class type added.', 'success');
          renderClassTypes();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    }

    // Subjects
    const subjSel = $('#subject-class-select');
    if (subjSel) {
      subjSel.addEventListener('change', renderSubjects);
      const addSubj = $('#add-subject-btn');
      if (addSubj) addSubj.addEventListener('click', addSubjectFlow);
    }

    // Students
    const stuFilter = $('#student-class-filter');
    if (stuFilter) {
      stuFilter.addEventListener('change', renderStudents);
      const stuSearch = $('#student-search');
      if (stuSearch) stuSearch.addEventListener('input', renderStudents);
      const addStu = $('#add-student-btn');
      if (addStu) addStu.addEventListener('click', addStudentFlow);
    }

    // Marks
    const msSel = $('#marks-student-select');
    if (msSel) msSel.addEventListener('change', renderMarksEntry);

    // Class result
    const crSel = $('#classresult-class-select');
    if (crSel) {
      crSel.addEventListener('change', renderClassResult);
      const crRefresh = $('#classresult-refresh-btn');
      if (crRefresh) crRefresh.addEventListener('click', renderClassResult);
    }

    // Single result
    const srSel = $('#singleresult-student-select');
    if (srSel) {
      srSel.addEventListener('change', renderSingleResult);
      const srRefresh = $('#singleresult-refresh-btn');
      if (srRefresh) srRefresh.addEventListener('click', renderSingleResult);
    }
  }

  /* ---------------- initial population ---------------- */
  async function refreshAll() {
    // Populate selects
    const classes = await Backend.listClasses();
    const fill = (sel, withAll) => {
      if (!sel) return;
      sel.innerHTML = '';
      if (withAll) sel.appendChild(new Option('All classes', ''));
      classes.forEach((c) => {
        sel.appendChild(new Option(c.name + (c.session ? ' (' + c.session + ')' : '') + ' — ' + (c.classTypeName || ''), c.id));
      });
    };
    fill($('#student-class-filter'), true);
    fill($('#subject-class-select'), false);
    fill($('#classresult-class-select'), false);

    await renderClasses();
    await renderClassTypes();
    await renderSubjects();
    await renderStudents();
    await populateMarksStudentSelect();
    await populateSingleResultSelect();
  }

  return {
    refreshAll,
    wireResultTabs,
    renderClasses,
    renderClassTypes,
    renderStudents,
    renderSubjects,
    renderMarksEntry,
    renderClassResult,
    renderSingleResult,
    switchResultSec,
  };
})();