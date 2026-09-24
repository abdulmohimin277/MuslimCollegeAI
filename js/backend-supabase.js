/* ============================================================
   BACKEND — SUPABASE PRODUCTION ADAPTER  (js/backend-supabase.js)
   ------------------------------------------------------------
   Everything in this module talks to the secure backend:

     • Authentication  → Edge Functions (bcrypt verify, JWT sign)
     • Data            → PostgREST with Row-Level Security
     • Files           → Edge Function validates type/size, then
                         uploads to Storage (executables rejected)
     • UPDATE WEBSITE  → Edge Function → GitHub repository_dispatch
                         (PAT lives only in a server-side secret)
     • Audit           → Postgres triggers + Edge Functions

   Sessions are held in MEMORY ONLY (never localStorage/sessionStorage).
   The anon key in site-config.js is the public publishable key —
   all authorization is enforced by server-side RLS + functions.

   IMPORTANT — the student portal must work with the STUDENT token,
   so read helpers fall back to the student session automatically.
   ============================================================ */
'use strict';

const BackendSupabase = (() => {
  const CFG = (window.SITE_CONFIG && SITE_CONFIG.supabase) || {};
  const GH = (window.SITE_CONFIG && SITE_CONFIG.github) || {};
  const BASE = CFG.url ? CFG.url.replace(/\/+$/, '') : '';
  const ANON = CFG.anonKey || '';
  const FILE_BASE = BASE + '/storage/v1/object/public/announcements/';

  let adminSession = null; // {access_token, username, isMaster, exp}
  let studentSession = null; // {access_token, student:{id,rollNumber,name}, exp}

  const SESSION_HOURS = 8;

  function headers(token, json) {
    const h = { apikey: ANON, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    if (json === false) delete h['Content-Type'];
    return h;
  }

  async function http(path, opts) {
    opts = opts || {};
    const res = await fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers(opts.token, opts.json !== false),
      body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
      signal: AbortSignal.timeout(opts.timeout || 30000),
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = text;
      }
    }
    if (!res.ok) {
      const msg = (data && (data.message || data.error_description || data.error)) || ('HTTP ' + res.status);
      throw new Error(String(msg));
    }
    return data;
  }

  /* ---------------- auth (Edge Functions) ---------------- */
  async function callFn(name, body, token) {
    return http('/functions/v1/' + name, { method: 'POST', body: body || {}, token });
  }

  function sessionFromJwt(token) {
    try {
      const parts = String(token).split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1]))));
      if (payload.exp && payload.exp * 1000 < Date.now()) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  async function adminLogin(username, password) {
    if (!username || !password) return { ok: false, error: 'Enter your username and password.' };
    try {
      const data = await callFn('admin-login', { username, password });
      const payload = sessionFromJwt(data.access_token);
      adminSession = {
        access_token: data.access_token,
        username: data.username,
        isMaster: !!data.is_master,
        exp: Date.now() + (payload && payload.exp ? payload.exp * 1000 - Date.now() : SESSION_HOURS * 3600 * 1000),
      };
      return { ok: true, user: { username: data.username, isMaster: !!data.is_master, role: 'admin' } };
    } catch (e) {
      return { ok: false, error: e.message.indexOf('Too many') !== -1 ? e.message : 'Invalid username or password.' };
    }
  }

  async function adminLogout() {
    adminSession = null;
    return { ok: true };
  }

  async function adminSessionInfo() {
    if (!adminSession) return null;
    const payload = sessionFromJwt(adminSession.access_token);
    if (!payload) {
      adminSession = null;
      return null;
    }
    return { username: adminSession.username, isMaster: adminSession.isMaster, role: 'admin' };
  }

  async function adminFirstRun() {
    return { needsSetup: false }; // admins are bootstrapped server-side
  }

  async function adminCreateFirst() {
    return { ok: false, error: 'Administrators are created server-side in Supabase mode. See SETUP.md → bootstrap-admins.' };
  }

  async function adminChangeCredentials() {
    // The single administrator account is FIXED — changeable only by
    // editing server-side configuration (FIXED_ADMIN_USER/FIXED_ADMIN_PASS
    // secrets → re-run bootstrap-admins), never from this panel.
    return { ok: false, error: 'This administrator account is fixed and can only be changed by editing the backend code/configuration (FIXED_ADMIN_USER / FIXED_ADMIN_PASS, see SETUP.md).' };
  }

  async function studentLogin(roll, pin) {
    if (!roll || !pin) return { ok: false, error: 'Enter your roll number and PIN.' };
    try {
      const data = await callFn('student-login', { roll_number: String(roll), pin: String(pin) });
      studentSession = {
        access_token: data.access_token,
        student: data.student,
        exp: Date.now() + 12 * 3600 * 1000,
      };
      return { ok: true, student: data.student };
    } catch (e) {
      return { ok: false, error: e.message.indexOf('Too many') !== -1 ? e.message : 'Roll number or PIN is incorrect.' };
    }
  }

  async function studentLogout() {
    studentSession = null;
    return { ok: true };
  }

  async function studentSessionInfo() {
    if (!studentSession) return null;
    const payload = sessionFromJwt(studentSession.access_token);
    if (!payload) {
      studentSession = null;
      return null;
    }
    return { ...studentSession.student, exp: studentSession.exp };
  }

  /* ---------------- token helpers ----------------
     Admin ops require the admin token. Read helpers used by the
     student portal fall back to the student token automatically. */
  function adminToken() {
    if (!adminSession) throw new Error('Admin session required.');
    return adminSession.access_token;
  }
  function studentToken() {
    if (!studentSession) throw new Error('Student session required.');
    return studentSession.access_token;
  }
  function dataToken() {
    if (adminSession) return adminSession.access_token;
    if (studentSession) return studentSession.access_token;
    throw new Error('Session required. Log in first.');
  }

  /* ---------------- REST helpers ---------------- */
  async function rGet(table, qs, token) {
    const q = qs || {};
    const parts = [];
    if (q.select) parts.push('select=' + q.select);
    if (q.eq) Object.keys(q.eq).forEach((k) => parts.push(k + '=eq.' + encodeURIComponent(q.eq[k])));
    if (q.ne) Object.keys(q.ne).forEach((k) => parts.push(k + '=neq.' + encodeURIComponent(q.ne[k])));
    if (q.lte) Object.keys(q.lte).forEach((k) => parts.push(k + '=lte.' + encodeURIComponent(q.lte[k])));
    if (q.gte) Object.keys(q.gte).forEach((k) => parts.push(k + '=gte.' + encodeURIComponent(q.gte[k])));
    if (q.order) parts.push('order=' + encodeURIComponent(q.order));
    if (q.limit) parts.push('limit=' + q.limit);
    if (q.ilike) Object.keys(q.ilike).forEach((k) => parts.push(k + '=ilike.' + encodeURIComponent(q.ilike[k])));
    return http('/rest/v1/' + table + (parts.length ? '?' + parts.join('&') : ''), { token: token || dataToken() });
  }
  async function rAdminGet(table, qs) {
    return rGet(table, qs, adminToken());
  }
  async function rPost(table, body, token) {
    return http('/rest/v1/' + table, { method: 'POST', body, token: token || adminToken() });
  }
  async function rPatch(table, id, body, token) {
    return http('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body, token: token || adminToken() });
  }
  async function rDelete(table, id, token) {
    return http('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', token: token || adminToken() });
  }

  /* ---------------- mapper: DB rows → shared UI shape ---------------- */
  function mapClass(r) {
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      classTypeId: r.class_type_id,
      classTypeName: r.class_type_name || '—',
      batch: r.batch || '1st Year',
      inchargeName: r.incharge_name || '',
      crName: r.cr_name || '',
      session: r.session,
      studentCount: r.student_count != null ? r.student_count : 0,
      subjectCount: r.subject_count != null ? r.subject_count : 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  function mapSubject(r) {
    return {
      id: r.id,
      classId: r.class_id,
      name: r.name,
      totalMarks: Number(r.total_marks || 0),
      passingMarks: Number(r.passing_marks || 0),
      sortOrder: r.sort_order == null ? 0 : r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  function mapStudent(r) {
    if (!r) return null;
    const o = {
      id: r.id,
      serial: r.serial_number,
      rollNumber: r.roll_number,
      name: r.name,
      fatherName: r.father_name || '',
      classId: r.class_id,
      session: r.session || '',
      gender: r.gender || '',
      dob: r.dob || '',
      contact: r.contact || '',
      admission: r.admission_info || '',
      notes: r.notes || '',
      photo: r.photo_url || '',
      pinSet: !!(r.pin_hash && r.pin_salt),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
    if (r.class_name != null) o.className = r.class_name;
    if (r.class_type_name != null) o.classTypeName = r.class_type_name;
    return o;
  }
  function mapAnnouncement(r) {
    return {
      id: r.id,
      title: r.title,
      body: r.body || '',
      date: r.date,
      expiryDate: r.expiry_date || null,
      priority: r.priority || 'normal',
      category: r.category || '',
      status: r.status || 'draft',
      publishAt: r.publish_at || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  function mapFile(r) {
    const url = r.storage_path ? FILE_BASE + r.storage_path : '';
    return {
      id: r.id,
      announcementId: r.announcement_id,
      kind: r.kind,
      name: r.name,
      mime: r.mime,
      size: r.size,
      storagePath: r.storage_path || '',
      url,
      data: url, // shared views read f.data || f.url
      createdAt: r.created_at,
    };
  }
  function mapMark(r) {
    return {
      id: r.id,
      studentId: r.student_id,
      classSubjectId: r.class_subject_id,
      totalMarks: Number(r.total_marks || 0),
      obtainedMarks: Number(r.obtained_marks || 0),
      updatedAt: r.updated_at,
    };
  }
  function mapAudit(r) {
    return {
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      admin: r.admin_username,
      details: r.details,
      success: r.success !== false,
      at: r.created_at,
      ip: r.ip || '',
    };
  }
  function mapDeployment(r) {
    return {
      id: r.id,
      status: r.status,
      simulated: !!r.simulated,
      summary: r.summary || {},
      triggeredBy: r.triggered_by,
      commitRef: r.commit_ref,
      buildStatus: r.build_status,
      deployStatus: r.deploy_status,
      error: r.error,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    };
  }

  /* ---------------- class types ---------------- */
  async function listClassTypes() {
    const rows = await rAdminGet('class_types', { order: 'name.asc' });
    return (rows || []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }
  async function addClassType(name) {
    const rows = await rPost('class_types', { name: str(name, 80) });
    return { id: rows[0] ? rows[0].id : null, name: str(name, 80) };
  }
  async function updateClassType(id, name) {
    await rPatch('class_types', id, { name: str(name, 80) });
    return { ok: true };
  }
  async function deleteClassType(id) {
    await rDelete('class_types', id);
    return { ok: true };
  }

  /* ---------------- classes ---------------- */
  async function listClasses() {
    const rows = await rAdminGet('classes', {
      order: 'session.asc,name.asc',
      select: 'id,name,class_type_id,batch,incharge_name,cr_name,class_types(name),session,created_at,updated_at,students(count),class_subjects(count)',
    });
    return (rows || []).map((r) =>
      mapClass({
        ...r,
        class_type_name: r.class_types ? r.class_types.name : '—',
        student_count: r.students && r.students.length ? r.students[0].count : 0,
        subject_count: r.class_subjects && r.class_subjects.length ? r.class_subjects[0].count : 0,
      })
    );
  }
  async function getClass(id) {
    const rows = await rGet('classes', {
      eq: { id }, limit: 1,
      select: 'id,name,class_type_id,batch,incharge_name,cr_name,class_types(name),session,created_at,updated_at,students(count),class_subjects(count)',
    });
    if (!rows || !rows.length) throw new Error('Class not found.');
    const r = rows[0];
    return mapClass({
      ...r,
      class_type_name: r.class_types ? r.class_types.name : '—',
      student_count: r.students && r.students.length ? r.students[0].count : 0,
      subject_count: r.class_subjects && r.class_subjects.length ? r.class_subjects[0].count : 0,
    });
  }
  async function addClass(data) {
    const rows = await rPost('classes', {
      name: str(data.name, 100),
      class_type_id: data.classTypeId,
      batch: str(data.batch, 20) || '1st Year',
      incharge_name: str(data.inchargeName, 120) || null,
      cr_name: str(data.crName, 120) || null,
      session: str(data.session, 20),
    });
    return { id: rows[0] ? rows[0].id : null, name: str(data.name, 100), classTypeId: data.classTypeId, batch: str(data.batch, 20) || '1st Year', inchargeName: str(data.inchargeName, 120), crName: str(data.crName, 120), session: str(data.session, 20) };
  }
  async function updateClass(id, data) {
    const patch = { name: str(data.name, 100), class_type_id: data.classTypeId, session: str(data.session, 20) };
    if (data.batch !== undefined) patch.batch = str(data.batch, 20) || '1st Year';
    if (data.inchargeName !== undefined) patch.incharge_name = str(data.inchargeName, 120) || null;
    if (data.crName !== undefined) patch.cr_name = str(data.crName, 120) || null;
    await rPatch('classes', id, patch);
    return { ok: true };
  }
  async function deleteClass(id) {
    await rDelete('classes', id);
    return { ok: true };
  }

  /* ---------------- subjects (per class) ---------------- */
  async function subjectsForClass(classId) {
    const rows = await rGet('class_subjects', { eq: { class_id: classId }, order: 'sort_order.asc' });
    return (rows || []).map(mapSubject);
  }
  async function addClassSubject(classId, data) {
    const rows = await rPost('class_subjects', {
      class_id: classId,
      name: str(data.name, 100),
      total_marks: num(data.totalMarks, 100),
      passing_marks: num(data.passingMarks, Math.round(num(data.totalMarks, 100) * 0.33)),
      sort_order: num(data.sortOrder, 0),
    });
    return { id: rows[0] ? rows[0].id : null, name: str(data.name, 100) };
  }
  async function updateClassSubject(id, data) {
    await rPatch('class_subjects', id, {
      name: str(data.name, 100),
      total_marks: num(data.totalMarks, 100),
      passing_marks: num(data.passingMarks, 33),
      sort_order: num(data.sortOrder, 0),
    });
    return { ok: true };
  }
  async function deleteClassSubject(id) {
    await rDelete('class_subjects', id);
    return { ok: true };
  }

  /* ---------------- students ---------------- */
  async function listStudents(filter) {
    filter = filter || {};
    const parts = [];
    if (filter.classId) parts.push('class_id=eq.' + encodeURIComponent(filter.classId));
    if (filter.session) parts.push('session=eq.' + encodeURIComponent(filter.session));
    if (filter.search) {
      parts.push('or=(name.ilike.' + encodeURIComponent('%' + filter.search + '%') +
        ',father_name.ilike.' + encodeURIComponent('%' + filter.search + '%') +
        ',roll_number.ilike.' + encodeURIComponent('%' + filter.search + '%') + ')');
    }
    parts.push('order=roll_number.asc');
    parts.push('select=id,serial_number,roll_number,name,father_name,class_id,session,gender,dob,contact,admission_info,notes,photo_url,pin_hash,pin_salt,created_at,updated_at,classes(name,class_types(name))');
    const rows = await http('/rest/v1/students?' + parts.join('&'), { token: adminToken() });
    return (rows || []).map((r) =>
      mapStudent({
        ...r,
        class_name: r.classes ? r.classes.name : '—',
        class_type_name: r.classes && r.classes.class_types ? r.classes.class_types.name : '—',
      })
    );
  }
  async function getStudent(id) {
    const rows = await rGet('students', {
      eq: { id }, limit: 1,
      select: 'id,serial_number,roll_number,name,father_name,class_id,session,gender,dob,contact,admission_info,notes,photo_url,pin_hash,pin_salt,created_at,updated_at,classes(name,class_types(name))',
    });
    if (!rows || !rows.length) throw new Error('Student not found.');
    const r = rows[0];
    return mapStudent({
      ...r,
      class_name: r.classes ? r.classes.name : '—',
      class_type_name: r.classes && r.classes.class_types ? r.classes.class_types.name : '—',
    });
  }
  async function addStudent(data) {
    const rows = await rPost('students', {
      serial_number: num(data.serial, 0),
      roll_number: onlyDigits(data.rollNumber, 20),
      name: str(data.name, 120),
      father_name: str(data.fatherName, 120),
      class_id: data.classId,
      session: str(data.session, 20),
      gender: str(data.gender, 20),
      dob: str(data.dob, 40),
      contact: str(data.contact, 60),
      admission_info: str(data.admission, 120),
      notes: str(data.notes, 1000),
      photo_url: str(data.photo, 20000),
    });
    return { id: rows[0] ? rows[0].id : null, rollNumber: onlyDigits(data.rollNumber, 20), name: str(data.name, 120) };
  }
  async function updateStudent(id, data) {
    const body = {};
    if (data.rollNumber !== undefined) body.roll_number = onlyDigits(data.rollNumber, 20);
    if (data.name !== undefined) body.name = str(data.name, 120);
    if (data.fatherName !== undefined) body.father_name = str(data.fatherName, 120);
    if (data.classId !== undefined) body.class_id = data.classId;
    if (data.session !== undefined) body.session = str(data.session, 20);
    if (data.gender !== undefined) body.gender = str(data.gender, 20);
    if (data.dob !== undefined) body.dob = str(data.dob, 40);
    if (data.contact !== undefined) body.contact = str(data.contact, 60);
    if (data.admission !== undefined) body.admission_info = str(data.admission, 120);
    if (data.notes !== undefined) body.notes = str(data.notes, 1000);
    if (data.photo !== undefined) body.photo_url = str(data.photo, 20000);
    await rPatch('students', id, body);
    return { ok: true };
  }
  async function deleteStudent(id) {
    await rDelete('students', id);
    return { ok: true };
  }
  async function setStudentPin(id, pin) {
    const data = await callFn('student-security', { op: 'set_pin', student_id: id, pin: String(pin) }, adminToken());
    return { ok: true, pin: data.pin };
  }

  /* ---------------- marks ---------------- */
  async function getMarks(studentId) {
    const rows = await rGet('marks', { eq: { student_id: studentId } });
    return (rows || []).map(mapMark);
  }
  async function saveMarks(studentId, marksArray) {
    const clean = (marksArray || []).map((m) => ({
      student_id: studentId,
      class_subject_id: m.classSubjectId,
      total_marks: num(m.totalMarks, 100),
      obtained_marks: num(m.obtainedMarks, 0),
    }));
    for (const row of clean) {
      const existing = await rAdminGet('marks', { eq: { student_id: studentId, class_subject_id: row.class_subject_id }, limit: 1 });
      if (existing && existing.length) {
        await rPatch('marks', existing[0].id, row);
      } else {
        await rPost('marks', row);
      }
    }
    const current = await rAdminGet('marks', { eq: { student_id: studentId } });
    const keepIds = clean.map((r) => r.class_subject_id);
    for (const row of current || []) {
      if (!keepIds.includes(row.class_subject_id)) await rDelete('marks', row.id);
    }
    return { ok: true, count: clean.length };
  }

  /* --------- public result lookup (batch + roll, no login) ---------
     The student Result tab asks for a batch (1st Year / Second Year)
     and a roll number; the public-result edge function (deployed with
     --no-verify-jwt) returns the card data for every match in ANY
     class of that batch. Only card fields are returned — never PIN
     hashes / contact / admission / photos. */
  async function publicResultLookup(batch, roll) {
    if (!batch || !roll) return { ok: false, error: 'Choose a batch and enter a roll number.' };
    const res = await callFn('public-result', { batch: String(batch), roll: String(roll) });
    return res && res.ok ? res : { ok: false, error: (res && res.error) || 'Lookup failed.' };
  }

  /* ---------------- announcements ---------------- */
  async function listAnnouncementsPublic() {
    const now = new Date().toISOString();
    const result = await http(
      '/rest/v1/announcements?status=eq.published&order=date.desc&select=*',
      { token: null }
    );
    const list = (result || []).filter((a) => {
      if (a.publish_at && new Date(a.publish_at) > new Date(now)) return false;
      if (a.expiry_date && new Date(a.expiry_date) < new Date(now)) return false;
      return true;
    });
    const pr = { high: 0, normal: 1, low: 2 };
    list.sort((a, b) => {
      const d1 = pr[a.priority] === undefined ? 1 : pr[a.priority];
      const d2 = pr[b.priority] === undefined ? 1 : pr[b.priority];
      if (d1 !== d2) return d1 - d2;
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
    const files = await http('/rest/v1/announcement_files?order=created_at.asc&select=*', { token: null }).catch(() => []);
    const fileMap = {};
    (files || []).forEach((f) => {
      fileMap[f.announcement_id] = fileMap[f.announcement_id] || [];
      fileMap[f.announcement_id].push(f);
    });
    return list.map((a) => ({ ...mapAnnouncement(a), files: (fileMap[a.id] || []).map(mapFile) }));
  }
  async function getAnnouncementPublic(id) {
    const rows = await http('/rest/v1/announcements?id=eq.' + encodeURIComponent(id) + '&status=eq.published&select=*', { token: null });
    if (!rows || !rows.length) throw new Error('Announcement not found or not published.');
    const files = await http('/rest/v1/announcement_files?announcement_id=eq.' + encodeURIComponent(id) + '&select=*', { token: null });
    return { ...mapAnnouncement(rows[0]), files: (files || []).map(mapFile) };
  }
  async function listAnnouncementsAdmin() {
    const rows = await rAdminGet('announcements', { order: 'created_at.desc' });
    const files = await rAdminGet('announcement_files', {});
    const fileMap = {};
    (files || []).forEach((f) => {
      fileMap[f.announcement_id] = fileMap[f.announcement_id] || [];
      fileMap[f.announcement_id].push(f);
    });
    return (rows || []).map((a) => ({ ...mapAnnouncement(a), files: (fileMap[a.id] || []).map(mapFile) }));
  }
  async function createAnnouncement(data) {
    const rows = await rPost('announcements', {
      title: str(data.title, 200),
      body: str(data.body, 100000),
      date: data.date || new Date().toISOString(),
      expiry_date: str(data.expiryDate, 40) || null,
      priority: data.priority || 'normal',
      category: str(data.category, 80),
      status: data.status || 'draft',
      publish_at: str(data.publishAt, 40) || null,
    });
    return { id: rows[0] ? rows[0].id : null, title: str(data.title, 200) };
  }
  async function updateAnnouncement(id, data) {
    const body = {};
    if (data.title !== undefined) body.title = str(data.title, 200);
    if (data.body !== undefined) body.body = str(data.body, 100000);
    if (data.date !== undefined) body.date = data.date;
    if (data.expiryDate !== undefined) body.expiry_date = str(data.expiryDate, 40) || null;
    if (data.priority !== undefined && ['high', 'normal', 'low'].includes(data.priority)) body.priority = data.priority;
    if (data.category !== undefined) body.category = str(data.category, 80);
    if (data.status !== undefined && ['draft', 'published', 'scheduled'].includes(data.status)) body.status = data.status;
    if (data.publishAt !== undefined) body.publish_at = str(data.publishAt, 40) || null;
    await rPatch('announcements', id, body);
    return { ok: true };
  }
  async function deleteAnnouncement(id) {
    await rDelete('announcements', id);
    return { ok: true };
  }
  async function setAnnouncementStatus(id, status) {
    await rPatch('announcements', id, { status });
    return { ok: true };
  }
  async function addAnnouncementFile(announcementId, file) {
    const data = await readAsBase64(file);
    const res = await callFn('upload', {
      announcement_id: announcementId || null,
      name: String(file.name || 'file'),
      mime: file.type,
      size: file.size,
      base64: data,
    }, adminToken());
    return { file: mapFile(res.file) };
  }
  async function deleteAnnouncementFile(fileId) {
    await callFn('upload', { op: 'delete', file_id: fileId }, adminToken());
    return { ok: true };
  }

  /* ---------------- audit ---------------- */
  async function listAuditLogs(limit) {
    const rows = await rAdminGet('audit_logs', { order: 'created_at.desc', limit: limit || 100 });
    return (rows || []).map(mapAudit);
  }
  async function logAudit(entry) {
    try {
      await rPost('audit_logs', {
        action: str(entry.action, 60),
        entity: str(entry.entity, 60),
        entity_id: str(entry.entityId, 80),
        admin_username: str(entry.admin, 80),
        details: str(entry.details, 500),
        success: entry.success !== false,
      });
    } catch (e) {
      /* audit best-effort */
    }
    return { ok: true };
  }

  /* ---------------- sessions / meta ---------------- */
  async function listSessions() {
    const rows = await rAdminGet('classes', { select: 'session' });
    const seen = {};
    (rows || []).forEach((r) => r.session && (seen[r.session] = true));
    return Object.keys(seen).sort().reverse();
  }

  async function getSiteMeta() {
    try {
      const rows = await http('/rest/v1/site_meta?select=*', { token: null });
      const out = { version: APP_VERSION, lastUpdate: null, lastStatus: 'idle', lastDeployAt: null, lastDeployStatus: null };
      (rows || []).forEach((r) => {
        if (r.value && typeof r.value === 'object') Object.assign(out, r.value);
      });
      return out;
    } catch (e) {
      return { version: APP_VERSION, lastUpdate: null, lastStatus: 'idle', lastDeployAt: null, lastDeployStatus: null };
    }
  }

  async function computeUpdateSummary() {
    const meta = await getSiteMeta();
    const since = meta.lastUpdate || new Date(0).toISOString();
    const count = async (table, col) => {
      try {
        const rows = await rAdminGet(table, { gte: { [col || 'updated_at']: since }, limit: 1000, select: 'id' });
        return (rows || []).length;
      } catch (e) {
        return 0;
      }
    };
    const classes = await count('classes');
    const students = await count('students');
    const marks = await count('marks');
    const announcements = await count('announcements');
    let files = 0;
    try {
      const f = await rAdminGet('announcement_files', { gte: { created_at: since }, limit: 1000, select: 'id' });
      files = (f || []).length;
    } catch (e) { /* ignore */ }
    return { classes, students, marks, announcements, files, asOf: since };
  }

  async function triggerUpdate(summary) {
    summary = summary || await computeUpdateSummary();
    const data = await callFn('deploy', { summary }, adminToken());
    return { id: data.deployment ? data.deployment.id : data.id, status: (data.deployment || data).status || 'pending', simulated: false };
  }

  async function deploymentHistory() {
    const rows = await rAdminGet('deployments', { order: 'created_at.desc', limit: 50 });
    return (rows || []).map(mapDeployment);
  }

  async function getDeployment(id) {
    const rows = await rAdminGet('deployments', { eq: { id }, limit: 1 });
    if (!rows || !rows.length) throw new Error('Deployment not found.');
    return mapDeployment(rows[0]);
  }

  async function rollbackTo(deploymentId) {
    await callFn('deploy', { op: 'rollback', deployment_id: deploymentId }, adminToken());
    return { ok: true };
  }

  /* ---------------- export / backup / restore ---------------- */
  async function exportData() {
    const res = await callFn('admin-data', { op: 'export' }, adminToken());
    return res.data || {};
  }
  async function restoreData(json) {
    await callFn('admin-data', { op: 'restore', data: json }, adminToken());
    return { ok: true };
  }

  /* ---------------- diagnostics ---------------- */
  async function serverStatus() {
    try {
      await http('/rest/v1/site_meta?limit=1', { token: null });
      return { mode: 'supabase', demo: false, ok: true, message: 'Backend connected (' + BASE + ')', version: APP_VERSION };
    } catch (e) {
      return { mode: 'supabase', demo: false, ok: false, message: 'Backend unreachable: ' + e.message, version: APP_VERSION };
    }
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = r.result;
        const idx = dataUrl.indexOf(',');
        resolve(idx === -1 ? dataUrl : dataUrl.slice(idx + 1));
      };
      r.onerror = () => reject(new Error('Could not read file.'));
      r.readAsDataURL(file);
    });
  }

  function num(v, def) {
    const n = Number(v);
    return isNaN(n) ? def : Math.round(n);
  }
  function str(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 500);
  }
  function onlyDigits(v, maxLen) {
    const s = String(v == null ? '' : v).replace(/[^\d]/g, '');
    return s.slice(0, maxLen || 20);
  }

  return {
    mode: 'supabase',
    isDemo: false,
    SESSION_HOURS,
    adminFirstRun, adminCreateFirst, adminLogin, adminLogout, adminSessionInfo,
    adminChangeCredentials,
    studentLogin, studentLogout, studentSessionInfo,
    listClassTypes, addClassType, updateClassType, deleteClassType,
    listClasses, getClass, addClass, updateClass, deleteClass,
    subjectsForClass, addClassSubject, updateClassSubject, deleteClassSubject,
    listStudents, getStudent, addStudent, updateStudent, deleteStudent, setStudentPin,
    getMarks, saveMarks, publicResultLookup,
    listAnnouncementsPublic, getAnnouncementPublic, listAnnouncementsAdmin,
    createAnnouncement, updateAnnouncement, deleteAnnouncement, setAnnouncementStatus,
    addAnnouncementFile, deleteAnnouncementFile,
    listAuditLogs, logAudit,
    listSessions,
    getSiteMeta, computeUpdateSummary, triggerUpdate, deploymentHistory, getDeployment, rollbackTo,
    exportData, restoreData,
    serverStatus,
  };
})();