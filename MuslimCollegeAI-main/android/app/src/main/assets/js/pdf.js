/* ============================================================
   PDF — save the last AI answer as a PDF.
   Primary method: a print-ready window (full fidelity).
   Fallback: jsPDF when print is unavailable (popup blocked).
   ============================================================ */
'use strict';

async function savePdf() {
  if (!lastAnswer || !String(lastAnswer).trim()) {
    toast('Abhi koi AI answer available nahi hai.', 'error');
    return;
  }

  const answer = lastAnswer;

  // Primary: print window (full emoji + Markdown fidelity)
  try {
    const w = window.open('', '_blank');
    if (w) {
      const html =
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<title>Muslim College AI Notes</title>' +
        '<style>' +
        'body{font-family:Segoe UI,system-ui,sans-serif;padding:36px;color:#111;max-width:760px;margin:0 auto}' +
        'h1{color:#1E88E5;font-size:22px;border-bottom:2px solid #1E88E5;padding-bottom:8px}' +
        'p.meta{color:#555;font-size:13px}' +
        'pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.65;margin-top:20px}' +
        'code{background:#f1f5f9;padding:1px 5px;border-radius:4px}' +
        '</style>' +
        '</head><body>' +
        '<h1>Muslim College AI Agent — Study Notes</h1>' +
        '<p class="meta">Student: ' + safeHtml(studentName + ' (' + studentRoll + ')') +
        ' &nbsp;·&nbsp; Model: ' + safeHtml(activeGeminiModel) + '</p><hr>' +
        '<pre>' + safeHtml(answer) + '</pre>' +
        '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>' +
        '</body></html>';
      w.document.write(html);
      w.document.close();
      w.focus();
      return;
    }
  } catch (e) {
    console.warn('print-pdf failed', e);
  }

  // Fallback: jsPDF from CDN
  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Muslim College AI Agent', 10, 12);
      doc.setFontSize(12);
      const plain = answer.replace(/[^\x20-\x7E\n]/g, '');
      const lines = doc.splitTextToSize(plain, 190);
      let y = 24;
      for (const line of lines) {
        if (y > 282) {
          doc.addPage();
          y = 14;
        }
        doc.text(line, 10, y);
        y += 6;
      }
      doc.save('Muslim_College_AI_Notes_' + Date.now() + '.pdf');
      toast('PDF Notes successfully save ho gaye!', 'success');
      return;
    } catch (e) {
      console.error('jsPDF error', e);
    }
  }

  toast('Popup blocked. Allow popups to save the PDF.', 'error');
}