/* ============================================================
   DEBUG — connection tests, model list, raw response viewer
   ============================================================ */
'use strict';

function debugKey() {
  const manual = $('#debug-key').value.trim();
  return manual || globalApiKey;
}

function headersText(headers) {
  const parts = [];
  headers.forEach((value, key) => {
    parts.push('  ' + key + ': ' + value);
  });
  return parts.join('\n');
}

function setDebugOutput(text, cls) {
  const out = $('#debug-output');
  if (!out) return;
  out.className = cls || '';
  out.textContent = text;
  out.scrollTop = 0;
}

function setDebugButtons(disabled) {
  const ids = ['test-conn-btn', 'list-models-btn', 'test-all-models-btn'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

async function testConnection() {
  const key = debugKey();
  if (!key) {
    setDebugOutput('No API key found.\nEnter one above, or on the Login screen.', 'err');
    return;
  }

  const model = $('#debug-model').value;
  setDebugOutput('... Testing model "' + model + '" ...');
  setDebugButtons(true);

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: 'Reply with exactly: OK' }] },
        ],
        generationConfig: { responseModalities: ['TEXT'] },
      }),
      signal: AbortSignal.timeout(65000),
    });

    const raw = await res.text();
    recordDebug(url, res.status, raw, '', model);

    const reply = extractReply(raw);
    const ok = res.status === 200 && !!reply;

    setDebugOutput(
      '=== DIRECT TEST: ' + model + ' ===\n' +
        (ok ? ' MODEL RESPONDED OK! Reply: ' + reply + '\n' : '') +
        'URL: ' + url + '\n' +
        'HTTP STATUS: ' + res.status + '\n' +
        'RESPONSE HEADERS:\n' +
        headersText(res.headers) + '\n' +
        'RAW RESPONSE BODY:\n' +
        raw,
      ok ? 'ok' : 'err'
    );
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      setDebugOutput(
        '... REQUEST TIMED OUT after 65 seconds.\nThe Gemini server did not respond in time — usually network / firewall / VPN issues.',
        'err'
      );
    } else {
      setDebugOutput(
        ' LOCAL EXCEPTION (before or while calling the API):\n' +
          (e && e.message ? e.message : e) +
          '\n\nThis means the app could not even reach the Gemini servers. Check internet / firewall / VPN.',
        'err'
      );
    }
  } finally {
    setDebugButtons(false);
  }
}

async function listModels() {
  const key = debugKey();
  if (!key) {
    setDebugOutput('No API key found.\nEnter one above, or on the Login screen.', 'err');
    return;
  }

  setDebugOutput('... Fetching model list ...');
  setDebugButtons(true);

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(40000),
    });

    const raw = await res.text();
    recordDebug(url, res.status, raw, '', 'list-models');

    if (res.status === 200) {
      const names = extractModelNames(raw);
      setDebugOutput(
        ' SUCCESS — this API key is VALID.\n' +
          'HTTP STATUS: 200\n' +
          'Total models available to this key: ' + names.length + '\n' +
          'Models:\n' +
          names.slice(0, 100).join('\n') +
          (names.length > 100 ? '\n… and ' + (names.length - 100) + ' more' : ''),
        'ok'
      );
    } else {
      setDebugOutput('HTTP STATUS: ' + res.status + '\nRAW RESPONSE BODY:\n' + raw, 'err');
    }
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      setDebugOutput('... REQUEST TIMED OUT. No response received from Gemini.', 'err');
    } else {
      setDebugOutput(' LOCAL EXCEPTION:\n' + (e && e.message ? e.message : e), 'err');
    }
  } finally {
    setDebugButtons(false);
  }
}

async function testAllModels() {
  const key = debugKey();
  if (!key) {
    setDebugOutput('No API key found.\nEnter one above, or on the Login screen.', 'err');
    return;
  }

  setDebugOutput('... Rotation test started — trying ' + geminiModels.length + ' models...\n');
  setDebugButtons(true);

  const results = [];
  for (const model of geminiModels) {
    setDebugOutput(
      ' Rotation test — model ' + (results.length + 1) + '/' + geminiModels.length +
        ': ' + model + ' …\n(working…)\n\nTested so far:\n' +
        results.map((r) => r.model + (r.ok ? ' OK' : ' — ' + r.reason)).join('\n')
    );

    const r = await pingOneModel(model);
    results.push(r);
  }

  const okCount = results.filter((r) => r.ok).length;
  const summary =
    results
      .map((r) => r.model + (r.ok ? ' → OK' : ' → ' + r.reason))
      .join('\n');

  setDebugOutput(
    '=== MODEL ROTATION TEST ===\n' +
      'Models tested: ' + geminiModels.length + '\n' +
      'Working: ' + okCount + ' | Failed: ' + (geminiModels.length - okCount) + '\n\n' +
      summary,
    okCount > 0 ? 'ok' : 'err'
  );

  setDebugButtons(false);
}

function extractModelNames(raw) {
  try {
    const data = JSON.parse(raw);
    const models = data && data.models;
    if (!Array.isArray(models)) return [];
    return models
      .filter((m) => m && typeof m.name === 'string')
      .map((m) => m.name.replace(/^models\//, ''));
  } catch (e) {
    return [];
  }
}

function showLastChatRaw() {
  setDebugOutput(
    '=== LAST CHAT ATTEMPT (AI Agent tab) ===\n' + debugSummary(),
    debug.statusCode === 200 ? 'ok' : debug.statusCode === 0 && !debug.body ? '' : 'err'
  );
}

async function copyResult() {
  const out = $('#debug-output');
  if (!out) return;
  await copyText(out.textContent);
}