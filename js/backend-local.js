/* ============================================================
   BACKEND — LOCAL DEMO ADAPTER  (js/backend-local.js)
   ------------------------------------------------------------
   An in-browser sandbox that implements the exact same API as the
   production Supabase backend so the whole platform can be used,
   tested and previewed WITHOUT any server.

   IMPORTANT — honestly labelled:
   • This mode stores data ONLY in this browser (localStorage).
   • It is for development, offline preview and UI testing.
   • Real deployments MUST use 'supabase' mode (site-config.js).
   • Nothing here ever contains the master credential.
   ============================================================ */
'use strict';

const BackendLocal = (() => {
  const DB_KEY = 'mc_db_v3';
  const SESSION_HOURS = 8;

  /* ---------------- in-memory session (never persisted) ---------------- */
  let adminSession = null; // {username, exp, token}
  let studentSession = null; // {studentId, rollNumber, name, exp}

  /* ---------------- store helpers ---------------- */
  function loadDB() {
    let db = null;
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) db = JSON.parse(raw);
    } catch (e) {
      db = null;
    }
    if (!db || db.version !== 3) {
      db = seedDB();
      saveDB(db);
    }
    return db;
  }
  function saveDB(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      /* quota — ignore */
    }
  }
  function mut(fn) {
    const db = loadDB();
    const out = fn(db);
    saveDB(db);
    return out;
  }
  function seedDB() {
    return {
      version: 3,
      createdAt: new Date().toISOString(),
      admins: [],
      classTypes: [
        { id: uid('ct_'), name: 'Medical', createdAt: new Date().toISOString() },
        { id: uid('ct_'), name: 'ICS', createdAt: new Date().toISOString() },
        { id: uid('ct_'), name: 'Pre Engineering', createdAt: new Date().toISOString() },
        { id: uid('ct_'), name: 'DIT', createdAt: new Date().toISOString() },
        { id: uid('ct_'), name: 'I.Com', createdAt: new Date().toISOString() },
        { id: uid('ct_'), name: 'FA IT', createdAt: new Date().toISOString() },
      ],
      classes: [],
      classSubjects: [],
      students: [],
      marks: [],
      announcements: [],
      announcementFiles: [],
      auditLogs: [],
      loginAttempts: [],
      deployments: [],
      siteMeta: {
        version: APP_VERSION,
        lastUpdate: null,
        lastStatus: 'idle',
        lastDeployAt: null,
        lastDeployStatus: null,
      },
    };
  }

  /* ---------------- brute-force guard ---------------- */
  function checkLock(key) {
    const db = loadDB();
    const rec = db.loginAttempts.find((r) => r.key === key);
    if (!rec) return { locked: false, remaining: 5 };
    if (rec.lockedUntil && new Date(rec.lockedUntil) > new Date()) {
      return { locked: true, remaining: 0 };
    }
    return { locked: false, remaining: Math.max(0, 5 - rec.fails) };
  }
  function registerFailure(key) {
    return mut((db) => {
      const now = Date.now();
      const rec = db.loginAttempts.find((r) => r.key === key);
      if (rec) {
        // Reset after lock expiry / an hour of no failures
        if (rec.lockedUntil && new Date(rec.lockedUntil) <= new Date(now)) {
          rec.fails = 1;
          rec.lockedUntil = null;
        } else {
          rec.fails = (rec.fails || 0) + 1;
        }
        if (rec.fails >= 5 && !rec.lockedUntil) {
          rec.lockedUntil = new Date(now + 15 * 60 * 1000).toISOString();
          rec.fails = 0;
        }
      } else {
        db.loginAttempts.push({ key, fails: 1, lockedUntil: null });
      }
      db.loginAttempts = db.loginAttempts.slice(-40);
    });
  }
  function registerSuccess(key) {
    mut((db) => {
      db.loginAttempts = db.loginAttempts.filter((r) => r.key !== key);
    });
  }

  /* ---------------- admin auth ---------------- */
  async function adminFirstRun() {
    const db = loadDB();
    return { needsSetup: db.admins.length === 0 };
  }

  async function adminCreateFirst(username, password) {
    if (!isNonEmpty(username) || username.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };
    if (!password || String(password).length < 4) return { ok: false, error: 'Password must be at least 4 characters.' };
    const uname = str(username, 60);
    const db = loadDB();
    if (db.admins.some((a) => a.username.toLowerCase() === uname.toLowerCase())) {
      return { ok: false, error: 'An administrator with that username already exists.' };
    }
    const salt = makeSalt();
    try {
      const h = await hashPassword(password, salt);
      mut((d) => {
        d.admins.push({
          id: uid('adm_'),
          username: uname,
          salt: h.salt,
          hash: h.hash,
          iterations: h.iterations,
          isMaster: false,
          createdAt: new Date().toISOString(),
        });
        d.auditLogs.unshift({
          id: uid('aud_'), action: 'ADMIN_CREATED', entity: 'admin', entityId: null,
          admin: uname, details: 'First administrator account created (local demo mode)', success: true, at: new Date().toISOString(),
        });
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Secure hashing unavailable in this browser (WebCrypto). Please use HTTPS or a modern browser.' };
    }
  }

  function makeToken(role, sub) {
    return uid('tok_') + '.' + role + '.' + sub + '.' + Date.now();
  }

  async function adminLogin(username, password) {
    const uname = str(username, 60).toLowerCase();
    if (!uname || !password) return { ok: false, error: 'Enter your username and password.' };
    const lock = checkLock('adm:' + uname);
    if (lock.locked) return { ok: false, error: 'Too many failed attempts. Account locked for 15 minutes.' };
    const db = loadDB();
    const admin = db.admins.find((a) => a.username.toLowerCase() === uname);
    if (!admin) {
      registerFailure('adm:' + uname);
      return { ok: false, error: 'Invalid username or password.' };
    }
    try {
      const h = await hashPassword(password, admin.salt, admin.iterations);
      if (!safeEqual(h.hash, admin.hash)) {
        registerFailure('adm:' + uname);
        return { ok: false, error: 'Invalid username or password.' };
      }
    } catch (e) {
      return { ok: false, error: 'Secure hashing unavailable in this browser (WebCrypto).' };
    }
    registerSuccess('adm:' + uname);
    adminSession = {
      username: admin.username,
      isMaster: !!admin.isMaster,
      exp: Date.now() + SESSION_HOURS * 3600 * 1000,
      token: makeToken('admin', admin.id),
    };
    return {
      ok: true,
      user: { username: admin.username, isMaster: !!admin.isMaster, role: 'admin' },
    };
  }

  async function adminLogout() {
    adminSession = null;
    return { ok: true };
  }

  async function adminSessionInfo() {
    if (!adminSession) return null;
    if (adminSession.exp < Date.now()) {
      adminSession = null;
      return null;
    }
    return { username: adminSession.username, isMaster: adminSession.isMaster, role: 'admin' };
  }

  async function adminChangeCredentials(currentPassword, newUsername, newPassword) {
    const s = adminSessionInfo();
    if (!s) return { ok: false, error: 'Your session has expired. Please log in again.' };
    const db = loadDB();
    const admin = db.admins.find((a) => a.username.toLowerCase() === s.username.toLowerCase());
    if (!admin) return { ok: false, error: 'Administrator record not found.' };
    if (admin.isMaster) return { ok: false, error: 'The master administrator account cannot be changed from the panel.' };
    const h = await hashPassword(currentPassword || '', admin.salt, admin.iterations);
    if (!safeEqual(h.hash, admin.hash)) return { ok: false, error: 'Current password is incorrect.' };

    const uname = str(newUsername, 60);
    if (uname && uname.length < 3) return { ok: false, error: 'New username must be at least 3 characters.' };
    if (newPassword && String(newPassword).length < 4) return { ok: false, error: 'New password must be at least 4 characters.' };
    if (!uname && !newPassword) return { ok: false, error: 'Enter a new username and/or password.' };

    const finalUsername = uname || admin.username;
    if (
      db.admins.some((a) => a.username.toLowerCase() === finalUsername.toLowerCase() && a.id !== admin.id)
    ) {
      return { ok: false, error: 'That username is already in use.' };
    }

    const salt = makeSalt();
    const nh = await hashPassword(String(newPassword || ''), salt);
    mut((d) => {
      const a = d.admins.find((x) => x.id === admin.id);
      a.username = finalUsername;
      // Only rotate the hash when a new password was actually provided.
      if (newPassword) {
        a.salt = nh.salt;
        a.hash = nh.hash;
        a.iterations = nh.iterations;
      }
      d.auditLogs.unshift({
        id: uid('aud_'), action: 'ADMIN_CREDENTIALS_CHANGED', entity: 'admin', entityId: a.id,
        admin: finalUsername, details: 'Changeable admin credentials updated', success: true, at: new Date().toISOString(),
      });
    });
    adminSession.username = finalUsername;
    return { ok: true };
  }

  /* ------------- student auth (roll number + PIN) ------------- */
  async function studentLogin(roll, pin) {
    const rollStr = onlyDigits(roll, 20);
    if (!rollStr || !pin) return { ok: false, error: 'Enter your roll number and PIN.' };
    const lock = checkLock('stu:' + rollStr);
    if (lock.locked) return { ok: false, error: 'Too many failed attempts. Try again after 15 minutes.' };
    const db = loadDB();
    const student = db.students.find((st) => String(st.rollNumber).replace(/^0+/, '') === String(rollStr).replace(/^0+/, ''));
    if (!student || !student.pinSalt || !student.pinHash) {
      registerFailure('stu:' + rollStr);
      return { ok: false, error: 'Roll number or PIN is incorrect, or the student has no portal access.' };
    }
    try {
      const h = await hashPassword(pin, student.pinSalt, student.pinIterations || 60000);
      if (!safeEqual(h.hash, student.pinHash)) {
        registerFailure('stu:' + rollStr);
        return { ok: false, error: 'Roll number or PIN is incorrect.' };
      }
    } catch (e) {
      return { ok: false, error: 'Secure hashing unavailable in this browser (WebCrypto).' };
    }
    registerSuccess('stu:' + rollStr);
    studentSession = {
      studentId: student.id,
      rollNumber: student.rollNumber,
      name: student.name,
      exp: Date.now() + 12 * 3600 * 1000,
    };
    return { ok: true, student: { id: student.id, rollNumber: student.rollNumber, name: student.name } };
  }

  async function studentLogout() {
    studentSession = null;
    return { ok: true };
  }

  async function studentSessionInfo() {
    if (!studentSession) return null;
    if (studentSession.exp < Date.now()) {
      studentSession = null;
      return null;
    }
    return { id: studentSession.studentId, ...studentSession };
  }

  /* ------------- class types ------------- */
  async function listClassTypes() {
    const db = loadDB();
    return db.classTypes.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  async function addClassType(name) {
    const n = str(name, 80);
    if (!n) throw new Error('Class type name is required.');
    const id = mut((db) => {
      if (db.classTypes.some((c) => c.name.toLowerCase() === n.toLowerCase())) throw new Error('That class type already exists.');
      const rec = { id: uid('ct_'), name: n, createdAt: new Date().toISOString() };
      db.classTypes.push(rec);
      db.auditLogs.unshift(makeAudit('CLASS_TYPE_CREATED', 'class_type', rec.id, 'Created class type "' + n + '"', true));
      return rec.id;
    });
    return { id, name: n };
  }
  async function updateClassType(id, name) {
    const n = str(name, 80);
    if (!n) throw new Error('Class type name is required.');
    mut((db) => {
      const rec = db.classTypes.find((c) => c.id === id);
      if (!rec) throw new Error('Class type not found.');
      if (db.classTypes.some((c) => c.name.toLowerCase() === n.toLowerCase() && c.id !== id)) throw new Error('That class type already exists.');
      rec.name = n;
      db.auditLogs.unshift(makeAudit('CLASS_TYPE_UPDATED', 'class_type', id, 'Renamed class type to "' + n + '"', true));
    });
    return { ok: true };
  }
  async function deleteClassType(id) {
    mut((db) => {
      const rec = db.classTypes.find((c) => c.id === id);
      if (!rec) throw new Error('Class type not found.');
      if (db.classes.some((c) => c.classTypeId === id)) {
        throw new Error('Cannot delete: classes are linked to this class type.');
      }
      db.classTypes = db.classTypes.filter((c) => c.id !== id);
      db.auditLogs.unshift(makeAudit('CLASS_TYPE_DELETED', 'class_type', id, 'Deleted class type "' + rec.name + '"', true));
    });
    return { ok: true };
  }

  /* ------------- classes ------------- */
  async function listClasses() {
    const db = loadDB();
    return db.classes
      .slice()
      .sort((a, b) => (a.session || '').localeCompare(b.session || '') || a.name.localeCompare(b.name))
      .map((c) => {
        const type = db.classTypes.find((t) => t.id === c.classTypeId);
        const studentCount = db.students.filter((s) => s.classId === c.id).length;
        const subjects = db.classSubjects.filter((s) => s.classId === c.id);
        return { ...c, classTypeName: type ? type.name : '—', studentCount, subjectCount: subjects.length };
      });
  }
  async function getClass(id) {
    const db = loadDB();
    const c = db.classes.find((x) => x.id === id);
    if (!c) throw new Error('Class not found.');
    const type = db.classTypes.find((t) => t.id === c.classTypeId);
    return { ...c, classTypeName: type ? type.name : '—' };
  }
  async function addClass(data) {
    const name = str(data.name, 100);
    const classTypeId = str(data.classTypeId, 64);
    const session = str(data.session, 20);
    if (!name) throw new Error('Class name is required.');
    if (!classTypeId) throw new Error('Class type is required.');
    const id = mut((db) => {
      if (db.classes.some((c) => c.name.toLowerCase() === name.toLowerCase() && (c.session || '') === (session || ''))) {
        throw new Error('A class with that name and session already exists.');
      }
      const rec = {
        id: uid('cls_'), name, classTypeId, session,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      db.classes.push(rec);
      db.auditLogs.unshift(makeAudit('CLASS_CREATED', 'class', rec.id, 'Created class "' + name + '" (' + (session || 'no session') + ')', true));
      return rec.id;
    });
    return { id, name, classTypeId, session };
  }
  async function updateClass(id, data) {
    mut((db) => {
      const rec = db.classes.find((c) => c.id === id);
      if (!rec) throw new Error('Class not found.');
      const name = str(data.name, 100);
      const classTypeId = str(data.classTypeId, 64);
      const session = str(data.session, 20);
      if (!name) throw new Error('Class name is required.');
      if (!classTypeId) throw new Error('Class type is required.');
      if (db.classes.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase() && (c.session || '') === (session || ''))) {
        throw new Error('A class with that name and session already exists.');
      }
      rec.name = name;
      rec.classTypeId = classTypeId;
      rec.session = session;
      rec.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('CLASS_UPDATED', 'class', id, 'Updated class "' + name + '" (' + (session || '') + ')', true));
    });
    return { ok: true };
  }
  async function deleteClass(id) {
    mut((db) => {
      const rec = db.classes.find((c) => c.id === id);
      if (!rec) throw new Error('Class not found.');
      const linkedStudents = db.students.filter((s) => s.classId === id);
      if (linkedStudents.length) {
        throw new Error('Cannot delete: ' + linkedStudents.length + ' student(s) are enrolled in this class. Remove them first.');
      }
      const subjIds = db.classSubjects.filter((s) => s.classId === id).map((s) => s.id);
      db.classes = db.classes.filter((c) => c.id !== id);
      db.classSubjects = db.classSubjects.filter((s) => s.classId !== id);
      db.marks = db.marks.filter((m) => !subjIds.includes(m.classSubjectId));
      db.auditLogs.unshift(makeAudit('CLASS_DELETED', 'class', id, 'Deleted class "' + rec.name + '"', true));
    });
    return { ok: true };
  }

  /* ------------- per-class subjects ------------- */
  async function subjectsForClass(classId) {
    const db = loadDB();
    return db.classSubjects
      .filter((s) => s.classId === classId)
      .slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }
  async function addClassSubject(classId, data) {
    const name = str(data.name, 100);
    const totalMarks = clampNum(data.totalMarks, 1, 10000, 100);
    const passingMarks = clampNum(data.passingMarks, 0, totalMarks, Math.round(totalMarks * 0.33));
    const sortOrder = clampNum(data.sortOrder, 0, 9999, 0);
    if (!name) throw new Error('Subject name is required.');
    const id = mut((db) => {
      const cls = db.classes.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      const rec = { id: uid('sub_'), classId, name, totalMarks, passingMarks, sortOrder, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      db.classSubjects.push(rec);
      db.auditLogs.unshift(makeAudit('SUBJECT_ADDED', 'class_subject', rec.id, 'Added subject "' + name + '" (' + totalMarks + ' marks) to "' + cls.name + '"', true));
      return rec.id;
    });
    return { id, name, totalMarks, passingMarks, sortOrder };
  }
  async function updateClassSubject(id, data) {
    mut((db) => {
      const rec = db.classSubjects.find((s) => s.id === id);
      if (!rec) throw new Error('Subject not found.');
      const name = str(data.name, 100);
      const totalMarks = clampNum(data.totalMarks, 1, 10000, rec.totalMarks);
      const passingMarks = clampNum(data.passingMarks, 0, totalMarks, Math.min(rec.passingMarks, totalMarks));
      const sortOrder = clampNum(data.sortOrder, 0, 9999, rec.sortOrder);
      if (name) rec.name = name;
      rec.totalMarks = totalMarks;
      rec.passingMarks = passingMarks;
      rec.sortOrder = sortOrder;
      rec.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('SUBJECT_UPDATED', 'class_subject', id, 'Updated subject "' + rec.name + '"', true));
    });
    return { ok: true };
  }
  async function deleteClassSubject(id) {
    mut((db) => {
      const rec = db.classSubjects.find((s) => s.id === id);
      if (!rec) throw new Error('Subject not found.');
      db.classSubjects = db.classSubjects.filter((s) => s.id !== id);
      db.marks = db.marks.filter((m) => m.classSubjectId !== id);
      db.auditLogs.unshift(makeAudit('SUBJECT_REMOVED', 'class_subject', id, 'Removed subject "' + rec.name + '"', true));
    });
    return { ok: true };
  }

  /* ------------- students ------------- */
  async function listStudents(filter) {
    const db = loadDB();
    let rows = db.students.slice();
    filter = filter || {};
    if (filter.classId) rows = rows.filter((s) => s.classId === filter.classId);
    if (filter.session) rows = rows.filter((s) => (s.session || '') === filter.session);
    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      rows = rows.filter((s) =>
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.fatherName || '').toLowerCase().includes(q) ||
        String(s.rollNumber || '').toLowerCase().includes(q)
      );
    }
    return rows
      .slice()
      .sort((a, b) => String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), 'en', { numeric: true }))
      .map((s) => {
        const cls = db.classes.find((c) => c.id === s.classId);
        const type = cls ? db.classTypes.find((t) => t.id === cls.classTypeId) : null;
        return {
          ...s,
          className: cls ? cls.name : '—',
          classTypeName: type ? type.name : '—',
        };
      });
  }
  async function getStudent(id) {
    const db = loadDB();
    const s = db.students.find((x) => x.id === id);
    if (!s) throw new Error('Student not found.');
    const cls = db.classes.find((c) => c.id === s.classId);
    const type = cls ? db.classTypes.find((t) => t.id === cls.classTypeId) : null;
    return {
      ...s,
      className: cls ? cls.name : '—',
      classTypeName: type ? type.name : '—',
    };
  }
  async function addStudent(data) {
    const cls = loadDB().classes.find((c) => c.id === data.classId);
    if (!cls) throw new Error('You must choose a class.');
    const roll = onlyDigits(data.rollNumber, 20);
    if (!roll) throw new Error('Roll number is required (digits only).');
    const name = str(data.name, 120);
    if (!name) throw new Error('Student name is required.');
    const id = mut((db) => {
      if (db.students.some((s) => s.classId === data.classId && String(s.rollNumber).replace(/^0+/, '') === roll.replace(/^0+/, ''))) {
        throw new Error('A student with roll number ' + roll + ' already exists in this class.');
      }
      const rec = {
        id: uid('stu_'),
        serial: (db.students.length + 1),
        rollNumber: roll,
        name,
        fatherName: str(data.fatherName, 120),
        classId: data.classId,
        session: cls.session || str(data.session, 20),
        gender: str(data.gender, 20),
        dob: str(data.dob, 40),
        contact: str(data.contact, 60),
        admission: str(data.admission, 120),
        notes: str(data.notes, 1000),
        photo: str(data.photo, 20000),
        pinSalt: null, pinHash: null, pinIterations: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      db.students.push(rec);
      db.auditLogs.unshift(makeAudit('STUDENT_CREATED', 'student', rec.id, 'Added student "' + rec.name + '" (Roll ' + rec.rollNumber + ')', true));
      return rec.id;
    });
    return { id, rollNumber: roll, name };
  }
  async function setStudentPin(id, pin) {
    if (!pin || String(pin).length < 4) throw new Error('PIN must be at least 4 characters.');
    const salt = makeSalt();
    const h = await hashPassword(String(pin), salt);
    mut((db) => {
      const s = db.students.find((x) => x.id === id);
      if (!s) throw new Error('Student not found.');
      s.pinSalt = h.salt;
      s.pinHash = h.hash;
      s.pinIterations = h.iterations;
      s.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('STUDENT_PIN_RESET', 'student', id, 'Set/reset portal PIN for "' + s.name + '"', true));
    });
    return { ok: true };
  }
  async function updateStudent(id, data) {
    mut((db) => {
      const s = db.students.find((x) => x.id === id);
      if (!s) throw new Error('Student not found.');
      if (data.classId && data.classId !== s.classId) {
        const cls = db.classes.find((c) => c.id === data.classId);
        if (!cls) throw new Error('Class not found.');
        const roll = onlyDigits(data.rollNumber, 20) || s.rollNumber;
        if (db.students.some((x) => x.id !== id && x.classId === data.classId && String(x.rollNumber).replace(/^0+/, '') === roll.replace(/^0+/, ''))) {
          throw new Error('A student with that roll number already exists in the target class.');
        }
      }
      if (data.rollNumber) s.rollNumber = onlyDigits(data.rollNumber, 20);
      s.name = str(data.name, 120) || s.name;
      s.fatherName = data.fatherName === undefined ? s.fatherName : str(data.fatherName, 120);
      s.classId = data.classId || s.classId;
      s.gender = data.gender === undefined ? s.gender : str(data.gender, 20);
      s.dob = data.dob === undefined ? s.dob : str(data.dob, 40);
      s.contact = data.contact === undefined ? s.contact : str(data.contact, 60);
      s.admission = data.admission === undefined ? s.admission : str(data.admission, 120);
      s.notes = data.notes === undefined ? s.notes : str(data.notes, 1000);
      if (data.photo !== undefined) s.photo = str(data.photo, 20000);
      s.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('STUDENT_UPDATED', 'student', id, 'Updated student "' + s.name + '"', true));
    });
    return { ok: true };
  }
  async function deleteStudent(id) {
    mut((db) => {
      const s = db.students.find((x) => x.id === id);
      if (!s) throw new Error('Student not found.');
      db.students = db.students.filter((x) => x.id !== id);
      db.marks = db.marks.filter((m) => m.studentId !== id);
      db.auditLogs.unshift(makeAudit('STUDENT_DELETED', 'student', id, 'Deleted student "' + s.name + '" (Roll ' + s.rollNumber + ') and their marks', true));
    });
    return { ok: true };
  }

  /* ------------- marks ------------- */
  async function getMarks(studentId) {
    const db = loadDB();
    return db.marks.filter((m) => m.studentId === studentId).map((m) => ({ ...m }));
  }
  async function saveMarks(studentId, marksArray) {
    const db0 = loadDB();
    const student = db0.students.find((s) => s.id === studentId);
    if (!student) throw new Error('Student not found.');
    const subjectIds = db0.classSubjects.filter((s) => s.classId === student.classId).map((s) => s.id);
    const sanitized = (marksArray || []).map((m) => {
      if (!subjectIds.includes(m.classSubjectId)) throw new Error('Subject does not belong to the student\u2019s class.');
      return {
        studentId,
        classSubjectId: m.classSubjectId,
        totalMarks: clampNum(m.totalMarks, 1, 10000, 100),
        obtainedMarks: clampNum(m.obtainedMarks, 0, Math.max(m.totalMarks, 0), 0),
      };
    });
    mut((db) => {
      db.marks = db.marks.filter((m) => m.studentId !== studentId);
      sanitized.forEach((m) => {
        db.marks.push({ id: uid('mk_'), ...m, updatedAt: new Date().toISOString() });
      });
      db.auditLogs.unshift(makeAudit('MARKS_UPDATED', 'marks', studentId, 'Saved marks for "' + student.name + '" (' + sanitized.length + ' subjects)', true));
    });
    return { ok: true, count: sanitized.length };
  }

  /* ------------- announcements ------------- */
  async function listAnnouncementsPublic() {
    const db = loadDB();
    const now = Date.now();
    return db.announcements
      .filter((a) => a.status === 'published')
      .filter((a) => !a.publishAt || new Date(a.publishAt).getTime() <= now)
      .filter((a) => !a.expiryDate || new Date(a.expiryDate).getTime() >= now)
      .slice()
      .sort((a, b) => {
        const pr = { high: 0, normal: 1, low: 2 };
        const d1 = pr[a.priority] === undefined ? 1 : pr[a.priority];
        const d2 = pr[b.priority] === undefined ? 1 : pr[b.priority];
        if (d1 !== d2) return d1 - d2;
        return new Date(b.date || 0) - new Date(a.date || 0);
      })
      .map((a) => ({ ...a }));
  }
  async function getAnnouncementPublic(id) {
    const db = loadDB();
    const a = db.announcements.find((x) => x.id === id && x.status === 'published');
    if (!a) throw new Error('Announcement not found or not published.');
    const files = db.announcementFiles.filter((f) => f.announcementId === id);
    return { ...a, files };
  }
  async function listAnnouncementsAdmin() {
    const db = loadDB();
    return db.announcements
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map((a) => {
        const files = db.announcementFiles.filter((f) => f.announcementId === a.id);
        return { ...a, files };
      });
  }
  async function createAnnouncement(data) {
    const title = str(data.title, 200);
    if (!title) throw new Error('Announcement title is required.');
    const id = mut((db) => {
      const rec = {
        id: uid('ann_'),
        title,
        body: str(data.body, 100000),
        date: data.date || new Date().toISOString(),
        expiryDate: str(data.expiryDate, 40) || null,
        priority: ['high', 'normal', 'low'].includes(data.priority) ? data.priority : 'normal',
        category: str(data.category, 80),
        status: ['draft', 'published', 'scheduled'].includes(data.status) ? data.status : 'draft',
        publishAt: str(data.publishAt, 40) || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.announcements.push(rec);
      db.auditLogs.unshift(makeAudit('ANNOUNCEMENT_CREATED', 'announcement', rec.id, 'Created announcement "' + title + '"', true));
      return rec.id;
    });
    return { id, title };
  }
  async function updateAnnouncement(id, data) {
    mut((db) => {
      const a = db.announcements.find((x) => x.id === id);
      if (!a) throw new Error('Announcement not found.');
      if (data.title !== undefined) {
        if (!str(data.title, 200)) throw new Error('Announcement title is required.');
        a.title = str(data.title, 200);
      }
      if (data.body !== undefined) a.body = str(data.body, 100000);
      if (data.date !== undefined) a.date = data.date;
      if (data.expiryDate !== undefined) a.expiryDate = str(data.expiryDate, 40) || null;
      if (data.priority !== undefined && ['high', 'normal', 'low'].includes(data.priority)) a.priority = data.priority;
      if (data.category !== undefined) a.category = str(data.category, 80);
      if (data.status !== undefined && ['draft', 'published', 'scheduled'].includes(data.status)) a.status = data.status;
      if (data.publishAt !== undefined) a.publishAt = str(data.publishAt, 40) || null;
      a.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('ANNOUNCEMENT_UPDATED', 'announcement', id, 'Updated announcement "' + a.title + '"', true));
    });
    return { ok: true };
  }
  async function deleteAnnouncement(id) {
    mut((db) => {
      const a = db.announcements.find((x) => x.id === id);
      if (!a) throw new Error('Announcement not found.');
      db.announcements = db.announcements.filter((x) => x.id !== id);
      db.announcementFiles = db.announcementFiles.filter((f) => f.announcementId !== id);
      db.auditLogs.unshift(makeAudit('ANNOUNCEMENT_DELETED', 'announcement', id, 'Deleted announcement "' + a.title + '"', true));
    });
    return { ok: true };
  }
  async function setAnnouncementStatus(id, status) {
    mut((db) => {
      const a = db.announcements.find((x) => x.id === id);
      if (!a) throw new Error('Announcement not found.');
      if (!['draft', 'published', 'scheduled'].includes(status)) throw new Error('Invalid status.');
      a.status = status;
      a.updatedAt = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('ANNOUNCEMENT_STATUS', 'announcement', id, 'Set announcement "' + a.title + '" to ' + status, true));
    });
    return { ok: true };
  }
  async function addAnnouncementFile(announcementId, file) {
    const v = validateUpload(file);
    if (!v.ok) throw new Error(v.error);
    const dataUrl = await readFileAsDataURL(file);
    return mut((db) => {
      const rec = {
        id: uid('af_'),
        announcementId: announcementId || null,
        kind: v.kind,
        name: v.name,
        mime: file.type,
        size: v.size,
        data: dataUrl,
        createdAt: new Date().toISOString(),
      };
      db.announcementFiles.push(rec);
      db.auditLogs.unshift(makeAudit('FILE_UPLOADED', 'announcement_file', rec.id, 'Uploaded "' + v.name + '"', true));
      return { file: rec };
    }).file;
  }
  async function deleteAnnouncementFile(fileId) {
    mut((db) => {
      db.announcementFiles = db.announcementFiles.filter((f) => f.id !== fileId);
      db.auditLogs.unshift(makeAudit('FILE_DELETED', 'announcement_file', fileId, 'Deleted attached file', true));
    });
    return { ok: true };
  }

  /* ------------- audit ------------- */
  function makeAudit(action, entity, entityId, details, success) {
    return {
      id: uid('aud_'), action, entity, entityId,
      admin: adminSession ? adminSession.username : 'system',
      details, success, at: new Date().toISOString(),
      ip: 'local-demo',
    };
  }
  async function listAuditLogs(limit) {
    const db = loadDB();
    return db.auditLogs.slice(0, limit || 100);
  }
  async function logAudit(entry) {
    mut((db) => {
      db.auditLogs.unshift({
        id: uid('aud_'),
        action: str(entry.action, 60),
        entity: str(entry.entity, 60),
        entityId: str(entry.entityId, 80),
        admin: str(entry.admin, 80),
        details: str(entry.details, 500),
        success: entry.success !== false,
        at: new Date().toISOString(),
        ip: 'local-demo',
      });
    });
    return { ok: true };
  }

  /* ------------- sessions / meta ------------- */
  async function listSessions() {
    const db = loadDB();
    return db.classes.map((c) => c.session).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).sort().reverse();
  }

  async function getSiteMeta() {
    const db = loadDB();
    return { ...db.siteMeta };
  }

  async function computeUpdateSummary() {
    const db = loadDB();
    const last = db.siteMeta.lastUpdate ? new Date(db.siteMeta.lastUpdate).getTime() : 0;
    const count = (arr, field) => arr.filter((r) => !last || new Date(r[field] || r.createdAt).getTime() >= last).length;
    return {
      classes: count(db.classes, 'updatedAt'),
      students: count(db.students, 'updatedAt'),
      marks: count(db.marks, 'updatedAt'),
      announcements: count(db.announcements, 'updatedAt'),
      files: count(db.announcementFiles, 'createdAt'),
      asOf: db.siteMeta.lastUpdate,
    };
  }

  async function triggerUpdate(summary) {
    const s = await adminSessionInfo();
    if (!s) throw new Error('Admin session required.');
    summary = summary || await computeUpdateSummary();
    const depId = mut((db) => {
      const dep = {
        id: uid('dep_'),
        status: 'pending',
        simulated: true,
        summary: summary || {},
        triggeredBy: s.username,
        commitRef: null,
        buildStatus: 'pending',
        deployStatus: 'pending',
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        snapshot: JSON.parse(JSON.stringify({
          classes: db.classes, classSubjects: db.classSubjects, students: db.students,
          marks: db.marks, announcements: db.announcements, announcementFiles: db.announcementFiles,
        })),
      };
      db.deployments.unshift(dep);
      db.siteMeta.lastStatus = 'building';
      db.auditLogs.unshift(makeAudit('WEBSITE_UPDATE_TRIGGERED', 'deployment', dep.id, 'Update website requested', true));
      return dep.id;
    });
    // Simulated state machine (DEMO ONLY) — production uses the real
    // GitHub repository_dispatch → GitHub Actions pipeline.
    runDemoDeploy(depId);
    return { id: depId, status: 'pending', simulated: true };
  }

  function runDemoDeploy(depId) {
    const stages = [
      { status: 'saving', buildStatus: 'preparing', delay: 700 },
      { status: 'sending', buildStatus: 'queued', delay: 900 },
      { status: 'running', buildStatus: 'building', delay: 1400 },
      { status: 'running', buildStatus: 'deploying', delay: 1200 },
    ];
    let i = 0;
    const step = () => {
      const st = stages[i];
      if (!st) {
        mut((db) => {
          const dep = db.deployments.find((d) => d.id === depId);
          if (dep) {
            dep.status = 'success';
            dep.buildStatus = 'success';
            dep.deployStatus = 'success';
            dep.commitRef = 'demo-' + depId.slice(-8);
            dep.finishedAt = new Date().toISOString();
          }
          db.siteMeta.lastStatus = 'success';
          db.siteMeta.lastUpdate = new Date().toISOString();
          db.siteMeta.lastDeployAt = new Date().toISOString();
          db.siteMeta.lastDeployStatus = 'success';
          db.auditLogs.unshift(makeAudit('WEBSITE_UPDATED', 'deployment', depId, 'Website update complete (demo simulation)', true));
        });
        return;
      }
      mut((db) => {
        const dep = db.deployments.find((d) => d.id === depId);
        if (dep) {
          dep.status = st.status === 'running' ? 'running' : st.status;
          dep.buildStatus = st.buildStatus;
          dep.deployStatus = st.buildStatus === 'deploying' ? 'deploying' : dep.deployStatus;
        }
      });
      i++;
      setTimeout(step, st.delay);
    };
    setTimeout(step, 400);
  }

  async function deploymentHistory() {
    const db = loadDB();
    return db.deployments.slice(0, 50);
  }

  async function getDeployment(id) {
    const db = loadDB();
    const d = db.deployments.find((x) => x.id === id);
    if (!d) throw new Error('Deployment not found.');
    return { ...d };
  }

  async function rollbackTo(deploymentId) {
    const s = await adminSessionInfo();
    if (!s) throw new Error('Admin session required.');
    return mut((db) => {
      const dep = db.deployments.find((d) => d.id === deploymentId && d.status === 'success');
      if (!dep) throw new Error('No successful deployment found with that ID.');
      if (!dep.snapshot) throw new Error('This deployment has no rollback snapshot.');
      db.classes = JSON.parse(JSON.stringify(dep.snapshot.classes || []));
      db.classSubjects = JSON.parse(JSON.stringify(dep.snapshot.classSubjects || []));
      db.students = JSON.parse(JSON.stringify(dep.snapshot.students || []));
      db.marks = JSON.parse(JSON.stringify(dep.snapshot.marks || []));
      db.announcements = JSON.parse(JSON.stringify(dep.snapshot.announcements || []));
      db.announcementFiles = JSON.parse(JSON.stringify(dep.snapshot.announcementFiles || []));
      db.deployments.unshift({
        id: uid('dep_'),
        status: 'success',
        simulated: true,
        summary: { rollback: true, from: deploymentId },
        triggeredBy: s.username,
        commitRef: 'rollback-' + deploymentId.slice(-8),
        buildStatus: 'success',
        deployStatus: 'success',
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        snapshot: null,
      });
      db.siteMeta.lastUpdate = new Date().toISOString();
      db.auditLogs.unshift(makeAudit('WEBSITE_ROLLBACK', 'deployment', deploymentId, 'Rolled back to deployment ' + deploymentId, true));
      return { ok: true };
    });
  }

  /* ------------- export / backup / restore ------------- */
  async function exportData() {
    const db = loadDB();
    const out = JSON.parse(JSON.stringify(db));
    // Never export raw password material — strip hashes entirely.
    out.admins = [];
    out.students = out.students.map((s) => {
      const { pinSalt, pinHash, pinIterations, ...rest } = s;
      return rest;
    });
    return out;
  }

  async function restoreData(json) {
    const s = await adminSessionInfo();
    if (!s) throw new Error('Admin session required.');
    if (!json || typeof json !== 'object' || json.version !== 3) {
      throw new Error('Invalid backup file (wrong format or version).');
    }
    mut((db) => {
      // Merge only known collections and never admins/credential material.
      ['classTypes', 'classes', 'classSubjects', 'students', 'marks', 'announcements', 'announcementFiles']
        .forEach((k) => {
          if (Array.isArray(json[k])) db[k] = json[k];
        });
      db.auditLogs.unshift(makeAudit('DATA_RESTORED', 'database', null, 'Data restored from backup by ' + s.username, true));
      db.siteMeta.lastUpdate = new Date().toISOString();
    });
    return { ok: true };
  }

  /* ------------- diagnostics ------------ */
  async function serverStatus() {
    return {
      mode: 'local',
      demo: true,
      ok: true,
      message: 'LOCAL DEMO MODE — no backend configured. Data is stored in this browser only.',
      version: APP_VERSION,
    };
  }

  /* ---------- file helper ---------- */
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read file.'));
      r.readAsDataURL(file);
    });
  }

  function clampNum(v, min, max, def) {
    const n = Number(v);
    if (isNaN(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  return {
    mode: 'local',
    isDemo: true,
    SESSION_HOURS,
    adminFirstRun, adminCreateFirst, adminLogin, adminLogout, adminSessionInfo,
    adminChangeCredentials,
    studentLogin, studentLogout, studentSessionInfo,
    listClassTypes, addClassType, updateClassType, deleteClassType,
    listClasses, getClass, addClass, updateClass, deleteClass,
    subjectsForClass, addClassSubject, updateClassSubject, deleteClassSubject,
    listStudents, getStudent, addStudent, updateStudent, deleteStudent, setStudentPin,
    getMarks, saveMarks,
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