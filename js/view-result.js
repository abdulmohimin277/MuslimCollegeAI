/* ============================================================
   VIEW — student Result portal (read-only, session-protected).
   ============================================================ */
'use strict';

const StudentResultView = (() => {
  let current = null; // { student, cls, calc }

  async function mount(rootEl) {
    if (!rootEl) return;
    const session = await Backend.studentSessionInfo();
    if (!session) {
      renderLogin(rootEl);
      return;
    }
    try {
      const ctx = await loadStudentResultContext(session.id);
      current = ctx;
      renderCard(rootEl, ctx);
    } catch (e) {
      rootEl.innerHTML =
        '<div class="empty-state">' +
        '<div class="es-title">Result unavailable</div>' +
        escapeHtml(e.message || 'Could not load your result.') +
        '</div>';
    }
  }

  function renderLogin(rootEl) {
    const demoFlag =
      Backend.isDemo
        ? '<div class="demo-note"><strong>Demo mode:</strong> ask your administrator to enable the portal PIN in the Admin Panel &gt; Students.</div>'
        : '';
    rootEl.innerHTML =
      '<div class="result-login">' +
        '<div class="rl-icon">' +
          '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>' +
        '</div>' +
        '<h3>View your result</h3>' +
        '<p class="muted">Enter the roll number and portal PIN provided by your college. Your result is shown only to you.</p>' +
        '<div class="panel-field"><label class="panel-label" for="sr-roll">Roll number</label>' +
          '<input class="panel-input" id="sr-roll" type="text" inputmode="numeric" autocomplete="off" /></div>' +
        '<div class="panel-field"><label class="panel-label" for="sr-pin">Portal PIN</label>' +
          '<input class="panel-input" id="sr-pin" type="password" autocomplete="off" /></div>' +
        '<button class="btn primary" id="sr-login-btn" type="button" style="width:100%">View My Result</button>' +
        demoFlag +
      '</div>';

    const doLogin = async () => {
      const roll = $('#sr-roll').value.trim();
      const pin = $('#sr-pin').value.trim();
      const btn = $('#sr-login-btn');
      if (!roll || !pin) {
        toast('Enter your roll number and PIN.', 'error');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Checking…';
      const res = await Backend.studentLogin(roll, pin);
      btn.disabled = false;
      btn.textContent = 'View My Result';
      if (!res.ok) {
        toast(res.error || 'Login failed.', 'error');
        return;
      }
      toast('Welcome, ' + res.student.name + '!', 'success');
      mount(rootEl);
    };
    $('#sr-login-btn').addEventListener('click', doLogin);
    $('#sr-pin').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
  }

  function renderCard(rootEl, ctx) {
    const { student, cls, calc } = ctx;
    const overallClass = calc.overall === 'Pass' ? 'pass' : 'fail';
    const rowsHtml = calc.rows
      .map((r) => {
        const statusClass = r.status === 'Pass' ? 'pass' : r.status === 'Fail' ? 'fail' : 'na';
        return (
          '<tr>' +
            '<td>' + escapeHtml(r.subjectName) + '</td>' +
            '<td class="num">' + r.totalMarks + '</td>' +
            '<td class="num">' + r.obtainedMarks + '</td>' +
            '<td class="num">' + r.percentage + '%</td>' +
            '<td class="num">' + escapeHtml(r.grade) + '</td>' +
            '<td class="' + statusClass + '">' + escapeHtml(r.status) + '</td>' +
          '</tr>'
        );
      })
      .join('');

    rootEl.innerHTML =
      '<div class="student-result-card">' +
        '<div class="sr-head">' +
          '<h3>MUSLIM COLLEGE</h3>' +
          '<p>Student Result Card · ' + escapeHtml(cls.classTypeName || '') + '</p>' +
        '</div>' +
        '<div class="sr-body">' +
          '<div class="info-grid">' +
            infoItem('Roll No', student.rollNumber) +
            infoItem('Student Name', student.name) +
            infoItem('Father Name', student.fatherName) +
            infoItem('Class', cls.name) +
            infoItem('Class Type', cls.classTypeName) +
            infoItem('Session', student.session || cls.session) +
            (student.gender ? infoItem('Gender', student.gender) : '') +
            (student.dob ? infoItem('Date of Birth', student.dob) : '') +
          '</div>' +
          '<div class="tbl-wrap">' +
            '<table class="subject-marks">' +
              '<thead><tr><th>Subject</th><th class="num">Total</th><th class="num">Obtained</th><th class="num">%</th><th class="num">Grade</th><th>Status</th></tr></thead>' +
              '<tbody>' + (rowsHtml || '<tr><td colspan="6" class="na">No marks entered yet.</td></tr>') + '</tbody>' +
            '</table>' +
          '</div>' +
          '<div class="sr-summary">' +
            summaryItem(calc.totalMarks, 'Total Marks') +
            summaryItem(calc.obtainedMarks, 'Obtained') +
            summaryItem(calc.percentage + '%', 'Percentage') +
            summaryItem(calc.grade, 'Grade') +
            summaryItem(calc.failSubjects, 'Failed Subjects') +
          '</div>' +
          '<div class="sr-overall ' + overallClass + '">Overall Result: ' + escapeHtml(calc.overall) + '</div>' +
        '</div>' +
        '<div class="sr-actionbar">' +
          '<button class="btn primary sm" id="sr-print-btn" type="button">Print</button>' +
          '<button class="btn outline sm" id="sr-pdf-btn" type="button">Download PDF</button>' +
          '<button class="btn outline sm" id="sr-copy-btn" type="button">Copy Info</button>' +
          '<button class="btn outline sm" id="sr-logout-btn" type="button">Logout</button>' +
        '</div>' +
      '</div>';

    $('#sr-print-btn').addEventListener('click', () => printSingleResult(ctx));
    $('#sr-pdf-btn').addEventListener('click', () => pdfSingleResult(ctx));
    $('#sr-copy-btn').addEventListener('click', () => copyResultText(ctx));
    $('#sr-logout-btn').addEventListener('click', async () => {
      await Backend.studentLogout();
      toast('Logged out of the result portal.', '');
      mount(rootEl);
    });
  }

  function infoItem(k, v) {
    return '<div class="ig"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v || '—') + '</div></div>';
  }
  function summaryItem(n, l) {
    return '<div class="ss"><div class="n">' + escapeHtml(String(n)) + '</div><div class="l">' + escapeHtml(l) + '</div></div>';
  }

  async function copyResultText(ctx) {
    const text = ResultCalc.resultText(ctx.student, ctx.cls, ctx.calc);
    try {
      await navigator.clipboard.writeText(text);
      toast('Result copied to clipboard!', 'success');
    } catch (e) {
      toast('Could not copy automatically. Select the text manually.', 'error');
    }
  }

  /* ---------- Print single result card ---------- */
  function printSingleResult(ctx) {
    const html = resultCardHtml(ctx, true);
    injectPrintArea(html);
    window.print();
  }

  /* ---------- PDF via jsPDF (fallback: print) ---------- */
  function pdfSingleResult(ctx) {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      toast('PDF engine not loaded — printing instead.', '');
      printSingleResult(ctx);
      return;
    }
    try {
      const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      let y = 40;
      const margin = 44;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.setTextColor(29, 78, 216);
      doc.text('MUSLIM COLLEGE', W / 2, y, { align: 'center' });
      y += 16;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('Student Result Card', W / 2, y, { align: 'center' });
      y += 26;

      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(1.4);
      doc.line(margin, y - 10, W - margin, y - 10);
      y += 6;

      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      const info = [
        ['Class', ctx.cls.name, 'Session', ctx.student.session || ctx.cls.session || ''],
        ['Roll No', ctx.student.rollNumber, 'Name', ctx.student.name],
        ['Father Name', ctx.student.fatherName, 'Class Type', ctx.cls.classTypeName || ''],
      ];
      info.forEach((row) => {
        doc.setFont('helvetica', 'bold');
        doc.text(row[0] + ':', margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(row[1]), margin + 70, y);
        doc.setFont('helvetica', 'bold');
        doc.text(row[2] + ':', W / 2 + 20, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(row[3]), W / 2 + 110, y);
        y += 18;
      });
      y += 10;

      // Marks table
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setFillColor(238, 242, 255);
      const colX = [margin, margin + 160, margin + 260, margin + 340, margin + 420, W - 90];
      const headers = ['Subject', 'Total', 'Obtained', '%', 'Grade', 'Status'];
      doc.rect(margin, y - 12, W - 2 * margin, 18, 'F');
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 10;
      doc.setFont('helvetica', 'normal');
      ctx.calc.rows.forEach((r) => {
        if (y > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          y = 50;
        }
        doc.text(r.subjectName, colX[0], y);
        doc.text(String(r.totalMarks), colX[1], y);
        doc.text(String(r.obtainedMarks), colX[2], y);
        doc.text(r.percentage + '%', colX[3], y);
        doc.text(r.grade, colX[4], y);
        doc.text(r.status, colX[5], y);
        y += 16;
      });
      y += 14;

      doc.setFont('helvetica', 'bold');
      doc.text('Total Marks: ' + ctx.calc.totalMarks, margin, y);
      y += 16;
      doc.text('Obtained Marks: ' + ctx.calc.obtainedMarks, margin, y);
      y += 16;
      doc.text('Percentage: ' + ctx.calc.percentage + '%', margin, y);
      y += 16;
      doc.setFontSize(13);
      doc.setTextColor(ctx.calc.overall === 'Pass' ? 21 : 185, ctx.calc.overall === 'Pass' ? 128 : 28, ctx.calc.overall === 'Pass' ? 61 : 28);
      doc.text('Overall Result: ' + ctx.calc.overall, margin, y);

      doc.save('Result-' + ctx.student.rollNumber + '-' + ctx.student.name.replace(/\s+/g, '_') + '.pdf');
      toast('PDF downloaded!', 'success');
    } catch (e) {
      toast('PDF export failed: ' + (e && e.message), 'error');
    }
  }

  /* ---------- Shared printable card ---------- */
  function resultCardHtml(ctx, printable) {
    const rows = ctx.calc.rows
      .map(
        (r) =>
          '<tr><td>' + escHTML(r.subjectName) + '</td><td class="num">' + r.totalMarks + '</td>' +
          '<td class="num">' + r.obtainedMarks + '</td><td class="num">' + r.percentage + '%</td>' +
          '<td class="num">' + escHTML(r.grade) + '</td><td>' + escHTML(r.status) + '</td></tr>'
      )
      .join('');
    const overallCls = ctx.calc.overall === 'Pass' ? 'pass' : 'fail';
    return (
      '<div class="print-card">' +
        '<div class="pc-head">' +
          '<h1>MUSLIM COLLEGE</h1>' +
          '<div class="pc-sub">Muslim College of Science &amp; Commerce, Multan</div>' +
          '<div class="pc-title">Student Result Card</div>' +
        '</div>' +
        '<div class="pc-info">' +
          '<span><span class="k">Class:</span> ' + escHTML(ctx.cls.name || '—') + '</span>' +
          '<span><span class="k">Class Type:</span> ' + escHTML(ctx.cls.classTypeName || '—') + '</span>' +
          '<span><span class="k">Session:</span> ' + escHTML(ctx.student.session || ctx.cls.session || '—') + '</span>' +
          '<span><span class="k">Roll Number:</span> ' + escHTML(ctx.student.rollNumber || '—') + '</span>' +
          '<span class="full"><span class="k">Student Name:</span> ' + escHTML(ctx.student.name || '—') + '</span>' +
          '<span class="full"><span class="k">Father Name:</span> ' + escHTML(ctx.student.fatherName || '—') + '</span>' +
        '</div>' +
        '<table class="pc-marks">' +
          '<thead><tr><th>Subject</th><th>Total Marks</th><th>Obtained Marks</th><th>Percentage</th><th>Grade</th><th>Status</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<div class="pc-total">' +
          '<strong>Total Marks:</strong> ' + ctx.calc.totalMarks +
          ' &nbsp;&nbsp; <strong>Obtained Marks:</strong> ' + ctx.calc.obtainedMarks +
          ' &nbsp;&nbsp; <strong>Percentage:</strong> ' + ctx.calc.percentage + '%' +
        '</div>' +
        '<div class="pc-overall">Overall Result: <span class="' + overallCls + '">' + escHTML(ctx.calc.overall) + '</span></div>' +
        '<div class="pc-foot"><span>Issued by Muslim College, Multan</span><span>Date: ' + fmtDate(new Date().toISOString()) + '</span></div>' +
      '</div>'
    );
  }

  function injectPrintArea(html) {
    let area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    area.innerHTML = html;
  }

  return { mount, resultCardHtml, printSingleResult, pdfSingleResult };
})();