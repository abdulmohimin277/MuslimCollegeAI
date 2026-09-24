/* ============================================================
   VIEW — student Result portal (read-only, NO login required).
   ------------------------------------------------------------
   Flow (see ADMIN_GUIDE §3.8):
     1. Pick a batch  →  "1st Year"  or  "Second Year"
     2. Enter a ROLL NUMBER
     3. Every class of that batch is searched; the matching
        student's result card is shown (print / PDF / copy).
   Roll number alone is enough — no PIN, no session. The lookup
   goes through Backend.publicResultLookup() which returns only
   result-card data (never PIN material or contact details).
   ============================================================ */
'use strict';

const StudentResultView = (() => {
  const BATCHES = [
    { id: '1st Year', label: '1st Year', desc: 'First year students — every class of this batch' },
    { id: 'Second Year', label: 'Second Year', desc: 'Second year students — every class of this batch' },
  ];

  /* ---------------- step 1: pick a batch ---------------- */
  async function mount(rootEl) {
    if (!rootEl) return;
    renderPicker(rootEl);
  }

  function renderPicker(rootEl) {
    rootEl.innerHTML =
      '<div class="sr-portal">' +
        '<div class="sr-hero">' +
          '<div class="rl-icon">' +
            '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
          '</div>' +
          '<h3>Student Result</h3>' +
          '<p class="muted">Choose your batch, enter your roll number — your result card appears instantly. No login needed.</p>' +
        '</div>' +
        '<div class="sr-batch-grid">' +
          BATCHES.map(
            (b) =>
              '<button class="sr-batch-card" type="button" data-batch="' + escAttr(b.id) + '">' +
                '<div class="sr-batch-title">' + escapeHtml(b.label) + '</div>' +
                '<div class="sr-batch-desc">' + escapeHtml(b.desc) + '</div>' +
                '<div class="sr-batch-arrow">View results →</div>' +
              '</button>'
          ).join('') +
        '</div>' +
        '<p class="muted sr-note">Roll numbers are shared across every class of the batch — enter only the roll number.</p>' +
      '</div>';
    rootEl.querySelectorAll('.sr-batch-card').forEach((el) => {
      el.addEventListener('click', () => renderRollForm(rootEl, el.getAttribute('data-batch')));
    });
  }

  /* ---------------- step 2: ask for the roll number ---------------- */
  function renderRollForm(rootEl, batch) {
    rootEl.innerHTML =
      '<div class="sr-portal">' +
        '<div class="sr-back"><button class="btn outline sm" id="sr-back-batch" type="button">← Change batch</button></div>' +
        '<div class="sr-roll-form">' +
          '<div class="rl-icon">' +
            '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
          '</div>' +
          '<h3>' + escapeHtml(batch) + '</h3>' +
          '<p class="muted">Enter the roll number — we will search every ' + escapeHtml(batch) + ' class.</p>' +
          '<div class="panel-field"><label class="panel-label" for="sr-roll">Roll number</label>' +
            '<input class="panel-input" id="sr-roll" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 1042" /></div>' +
          '<button class="btn primary" id="sr-view-btn" type="button" style="width:100%">View Result Card</button>' +
        '</div>' +
      '</div>';

    $('#sr-back-batch').addEventListener('click', () => renderPicker(rootEl));
    const doLookup = () => lookupRoll(rootEl, batch);
    $('#sr-view-btn').addEventListener('click', doLookup);
    $('#sr-roll').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLookup();
    });
    $('#sr-roll').focus();
  }

  /* ---------------- step 3: lookup + show card(s) ---------------- */
  async function lookupRoll(rootEl, batch) {
    const roll = $('#sr-roll').value.trim();
    if (!roll) {
      toast('Enter a roll number.', 'error');
      return;
    }
    const btn = $('#sr-view-btn');
    btn.disabled = true;
    btn.textContent = 'Searching…';
    let res;
    try {
      res = await Backend.publicResultLookup(batch, roll);
    } catch (e) {
      res = { ok: false, error: (e && e.message) || 'Lookup failed.' };
    }
    btn.disabled = false;
    btn.textContent = 'View Result Card';
    if (!res || !res.ok) {
      toast(res && res.error ? res.error : 'Could not load the result.', 'error');
      return;
    }
    renderResults(rootEl, batch, roll, res.matches || []);
  }

  function renderResults(rootEl, batch, roll, matches) {
    if (!matches.length) {
      rootEl.innerHTML =
        '<div class="sr-portal">' +
          '<div class="empty-state">' +
            '<div class="es-title">No result found</div>' +
            '<p class="muted">No student with roll number <strong>' + escapeHtml(roll) + '</strong> was found in <strong>' + escapeHtml(batch) + '</strong>.</p>' +
            '<p class="muted">Check the number and try again, or choose the other batch.</p>' +
          '</div>' +
          '<div class="sr-actions-top">' +
            '<button class="btn primary sm" id="sr-retry-btn" type="button">Try another roll number</button>' +
            '<button class="btn outline sm" id="sr-pick-batch-btn" type="button">Change batch</button>' +
          '</div>' +
        '</div>';
      $('#sr-retry-btn').addEventListener('click', () => renderRollForm(rootEl, batch));
      $('#sr-pick-batch-btn').addEventListener('click', () => renderPicker(rootEl));
      return;
    }

    const ctxs = matches.map((m) => {
      const student = m.student || {};
      const cls = m.cls || { name: '—', classTypeName: '—', session: '' };
      const calc = ResultCalc.computeStudent(m.subjects || [], m.marks || []);
      return { student, cls, calc, subjects: m.subjects || [] };
    });
    const multiple = ctxs.length > 1;

    const blocks = ctxs
      .map((ctx, i) => {
        const label = multiple
          ? '<div class="sr-match-label">Match ' + (i + 1) + ' — Class ' + escapeHtml(ctx.cls.name || '—') + (ctx.cls.classTypeName ? ' · ' + escapeHtml(ctx.cls.classTypeName) : '') + (ctx.cls.session ? ' · ' + escapeHtml(ctx.cls.session) : '') + '</div>'
          : '';
        return '<div class="sr-result-block">' + label + cardHtml(ctx, i) + '</div>';
      })
      .join('');

    rootEl.innerHTML =
      '<div class="sr-portal">' +
        '<div class="sr-actions-top">' +
          '<button class="btn outline sm" id="sr-again-btn" type="button">Search another student</button>' +
          '<button class="btn outline sm" id="sr-pick-batch2-btn" type="button">Change batch</button>' +
        '</div>' +
        blocks +
      '</div>';

    // Bind each card's action bar.
    rootEl.querySelectorAll('.sr-result-block').forEach((block, i) => {
      const ctx = ctxs[i];
      const printBtn = block.querySelector('#sr-print-' + i);
      const pdfBtn = block.querySelector('#sr-pdf-' + i);
      const copyBtn = block.querySelector('#sr-copy-' + i);
      if (printBtn) printBtn.addEventListener('click', () => printSingleResult(ctx));
      if (pdfBtn) pdfBtn.addEventListener('click', () => pdfSingleResult(ctx));
      if (copyBtn) copyBtn.addEventListener('click', () => copyResultText(ctx));
    });
    $('#sr-again-btn').addEventListener('click', () => renderRollForm(rootEl, batch));
    $('#sr-pick-batch2-btn').addEventListener('click', () => renderPicker(rootEl));
  }

  /* ---------------- result card ---------------- */
  function cardHtml(ctx, idx) {
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

    return (
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
            infoItem('Batch', cls.batch) +
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
          '<button class="btn primary sm" id="sr-print-' + idx + '" type="button">Print</button>' +
          '<button class="btn outline sm" id="sr-pdf-' + idx + '" type="button">Download PDF</button>' +
          '<button class="btn outline sm" id="sr-copy-' + idx + '" type="button">Copy Info</button>' +
        '</div>' +
      '</div>'
    );
  }

  function infoItem(k, v) {
    return '<div class="ig"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v || '—') + '</div></div>';
  }
  function summaryItem(n, l) {
    return '<div class="ss"><div class="n">' + escapeHtml(String(n)) + '</div><div class="l">' + escapeHtml(l) + '</div></div>';
  }
  function escAttr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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