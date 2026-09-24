/* ============================================================
   BACKEND — facade. Picks the active adapter from site-config.js
   and exposes result-calculation helpers shared by the admin
   dashboard and the student portal.
   ============================================================ */
'use strict';

/* Active backend adapter (local sandbox or Supabase). */
let ActiveBackend = null;

function initBackend() {
  if (ActiveBackend) return ActiveBackend;
  const mode = (window.SITE_CONFIG && SITE_CONFIG.backend) || 'local';
  ActiveBackend = mode === 'supabase' ? BackendSupabase : BackendLocal;
  return ActiveBackend;
}

window.Backend = initBackend();

/* ============================================================
   RESULT CALC — totals, percentages, pass/fail, grades.
   Used identically by admin result views and the student portal
   so a student can never compute a different result.
   ============================================================ */
const ResultCalc = {
  GRADE_BANDS: [
    { min: 90, grade: 'A+' },
    { min: 80, grade: 'A' },
    { min: 70, grade: 'B' },
    { min: 60, grade: 'C' },
    { min: 50, grade: 'D' },
    { min: 40, grade: 'E' },
    { min: 0, grade: 'F' },
  ],

  gradeOf(pct) {
    const p = Number(pct);
    if (isNaN(p)) return '—';
    for (const band of this.GRADE_BANDS) {
      if (p >= band.min) return band.grade;
    }
    return 'F';
  },

  /** Builds the full result for one student.
      subjects: [{id, name, totalMarks, passingMarks, sortOrder}]
      marks:    [{classSubjectId, totalMarks, obtainedMarks}] */
  computeStudent(subjects, marks) {
    const rows = (subjects || [])
      .slice()
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((sub) => {
        const found = (marks || []).find((m) => m.classSubjectId === sub.id);
        const total = found ? Number(found.totalMarks) : Number(sub.totalMarks);
        const obtained = found ? Number(found.obtainedMarks) : 0;
        const entered = !!found;
        const pct = total > 0 ? (obtained / total) * 100 : 0;
        const pass = total > 0 ? obtained >= Number(sub.passingMarks || 0) : false;
        return {
          subjectId: sub.id,
          subjectName: sub.name,
          totalMarks: total,
          obtainedMarks: obtained,
          passingMarks: Number(sub.passingMarks || 0),
          percentage: Math.round(pct * 100) / 100,
          grade: this.gradeOf(pct),
          status: entered ? (pass ? 'Pass' : 'Fail') : 'Not Entered',
          sortOrder: sub.sortOrder || 0,
        };
      });

    const totalMarks = rows.reduce((s, r) => s + r.totalMarks, 0);
    const obtainedMarks = rows.reduce((s, r) => s + r.obtainedMarks, 0);
    const pct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
    const failSubjects = rows.filter((r) => r.status === 'Fail' || r.status === 'Not Entered');
    const overall = failSubjects.length ? 'Fail' : rows.length ? 'Pass' : 'No Subjects';

    return {
      rows,
      totalMarks,
      obtainedMarks,
      percentage: Math.round(pct * 100) / 100,
      grade: this.gradeOf(pct),
      failSubjects: failSubjects.length,
      passSubjects: rows.length - failSubjects.length,
      overall,
    };
  },

  /** Class result table: one row per student. */
  computeClass(students, subjectsByStudent) {
    return (students || [])
      .map((student) => {
        const subj = subjectsByStudent[student.id] || [];
        const marks = (student._marks || []);
        const calc = this.computeStudent(subj, marks);
        return {
          student,
          rollNumber: student.rollNumber,
          name: student.name,
          fatherName: student.fatherName,
          ...calc,
        };
      })
      .sort((a, b) =>
        String(a.rollNumber).localeCompare(String(b.rollNumber), 'en', { numeric: true })
      );
  },

  /** Text summary of a result (used by Copy / Download). */
  resultText(student, classInfo, calc) {
    const L = [];
    L.push('MUSLIM COLLEGE');
    L.push('Student Result Card');
    L.push('--------------------------------');
    L.push('Class: ' + (classInfo.name || ''));
    L.push('Class Type: ' + (classInfo.classTypeName || ''));
    L.push('Session: ' + (student.session || classInfo.session || ''));
    L.push('Roll No: ' + (student.rollNumber || ''));
    L.push('Name: ' + (student.name || ''));
    L.push('Father Name: ' + (student.fatherName || ''));
    L.push('--------------------------------');
    L.push('Subject | Total | Obtained | % | Grade | Status');
    calc.rows.forEach((r) => {
      L.push(r.subjectName + ' | ' + r.totalMarks + ' | ' + r.obtainedMarks + ' | ' + r.percentage + '% | ' + r.grade + ' | ' + r.status);
    });
    L.push('--------------------------------');
    L.push('Total Marks: ' + calc.totalMarks);
    L.push('Obtained Marks: ' + calc.obtainedMarks);
    L.push('Percentage: ' + calc.percentage + '%');
    L.push('Overall Grade: ' + calc.grade);
    L.push('Result: ' + calc.overall);
    return L.join('\n');
  },
};

/** Convenience: load everything needed to render a class result. */
async function loadClassResultContext(classId) {
  const cls = await Backend.getClass(classId);
  const students = await Backend.listStudents({ classId });
  const subjects = await Backend.subjectsForClass(classId);
  const marksByStudent = {};
  for (const student of students) {
    marksByStudent[student.id] = await Backend.getMarks(student.id);
  }
  const rows = ResultCalc.computeClass(
    students.map((s) => ({ ...s, _marks: marksByStudent[s.id] || [] })),
    Object.fromEntries(students.map((s) => [s.id, subjects]))
  );
  return { cls, students, subjects, rows };
}

/** Convenience: one student's full result context. */
async function loadStudentResultContext(studentId) {
  const student = await Backend.getStudent(studentId);
  const cls = await Backend.getClass(student.classId);
  const subjects = await Backend.subjectsForClass(student.classId);
  const marks = await Backend.getMarks(studentId);
  const calc = ResultCalc.computeStudent(subjects, marks);
  return { student, cls, subjects, marks, calc };
}