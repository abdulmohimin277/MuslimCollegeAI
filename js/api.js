/* ============================================================
   API — Gemini requests + smart model rotation
   ============================================================ */
'use strict';

function buildSystemPrompt(question) {
  return (
    'You are MUSLIM COLLEGE STUDY AGENT, an AI study assistant made exclusively for Muslim College students.\n\n' +
    'IMPORTANT RULES:\n' +
    '1. Answer ONLY study and education-related questions.\n' +
    '2. Do not answer unrelated entertainment, gossip, personal, political, or other non-study questions.\n' +
    '3. If the question is not study-related, politely explain that you only help with study and educational questions.\n' +
    '4. Answer in the SAME LANGUAGE used by the student in the question (Urdu → Urdu, Roman Urdu → Roman Urdu, English → English, etc.).\n' +
    '5. Explain clearly and accurately at a student-friendly level.\n' +
    '6. Format the answer like beautiful, easy-to-revise study notes using Markdown:\n' +
    '   - Use **bold** for important terms.\n' +
    '   - Use headings like ## Definition, ## Explanation, ## Types, ## Examples, ## Important Points when relevant.\n' +
    '   - Use "- " bullets and "1. " numbering for lists.\n' +
    '7. Do NOT use any emojis or decorative symbols in the answer. Keep the notes clean, professional and text-only.\n' +
    '8. Only include sections that are relevant to the question. Do not force sections.\n' +
    '9. Do not invent facts. If uncertain, say so clearly.\n' +
    '10. Keep the answer educational, clear, organized, and easy to revise.\n\n' +
    'Student Question:\n' + question
  );
}

function extractReply(raw) {
  try {
    const data = JSON.parse(raw);
    const candidates = data && data.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const content = candidates[0] && candidates[0].content;
    if (!content) return null;

    const parts = content.parts;
    if (!Array.isArray(parts)) return null;

    let reply = '';
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      // Skip the hidden "thinking / reasoning" parts (Gemini 3.x).
      if (part.thought === true) continue;
      if (typeof part.text === 'string' && part.text.trim()) {
        reply += part.text + '\n';
      }
    }

    return reply.trim() || null;
  } catch (e) {
    return null;
  }
}

function parseApiError(raw) {
  try {
    const data = JSON.parse(raw);
    if (data && data.error) {
      return {
        code: Number(data.error.code) || 0,
        status: data.error.status || '',
        message: data.error.message || '',
      };
    }
  } catch (e) {
    /* not JSON */
  }
  return null;
}

function friendlyError(code, apiError, bodyLower) {
  const status = (apiError && apiError.status ? apiError.status : '').toUpperCase();
  const message = (apiError && apiError.message ? apiError.message : '').trim();

  if (code === 400 && bodyLower.includes('api key')) {
    return 'API key not valid. Please check your Gemini API key (AIza...) and try again.';
  }
  if (code === 401 || status === 'UNAUTHENTICATED') {
    return 'API key is invalid or expired. Please create a new key at https://aistudio.google.com/apikey';
  }
  if (code === 403 || status === 'PERMISSION_DENIED') {
    if (
      bodyLower.includes('location') ||
      bodyLower.includes('region') ||
      bodyLower.includes('country')
    ) {
      return 'Gemini API is not available in your current location/region. Use a VPN in a supported country or a proxy server.';
    }
    if (
      bodyLower.includes('api key') ||
      bodyLower.includes('restricted') ||
      bodyLower.includes('permission')
    ) {
      return 'This API key does not have permission to use the Gemini API. Check key restrictions or create a new key.';
    }
    return 'Access denied by Gemini. ' + (message || 'HTTP ' + code);
  }
  if (code === 404 || status === 'NOT_FOUND') {
    return 'Model not found. Please update the app or use a different API key.';
  }
  if (code === 429 || status === 'RESOURCE_EXHAUSTED' || status === 'RATE_LIMIT_EXCEEDED') {
    return 'Gemini rate limit / quota reached for this API key. Wait a moment and try again, or check billing.';
  }
  if (code === 500 || status === 'INTERNAL') {
    return 'Gemini service is temporarily unavailable (internal server error).';
  }
  if (code === 503 || status === 'UNAVAILABLE') {
    return 'Gemini service is temporarily unavailable.';
  }
  return 'Something went wrong: ' + (message || 'HTTP ' + code) + ' (' + status + ')';
}

function logRotation(entry) {
  rotationHistory.unshift(entry); // newest first
  rotationHistory = rotationHistory.slice(0, 30);
  persistRotation();
}

function isFatalKeyError(status, apiError, bodyLower) {
  // These errors mean the API key itself is broken — rotating models
  // will not help, so stop immediately.
  if (status === 400 && bodyLower.includes('api key')) return true;
  if (status === 401) return true;
  if (status === 403) {
    const s = (apiError && apiError.status || '').toUpperCase();
    if (s === 'UNAUTHENTICATED') return true;
    if (s === 'PERMISSION_DENIED' && !bodyLower.includes('billing')) {
      // Permission denied is key-level unless it specifically mentions billing
      return true;
    }
    return false;
  }
  if (status === 429 && bodyLower.includes('billing')) return true;
  return false;
}

function modelUrl(model) {
  return (
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent'
  );
}

async function askGemini(question) {
  const systemPrompt = buildSystemPrompt(question);
  let lastFallbackReason = null;
  let lastError = null;
  const attempts = [];

  // Rotate through models starting from the last working position.
  for (let i = 0; i < geminiModels.length; i++) {
    const model = geminiModels[i];
    const url = modelUrl(model);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': globalApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt }],
            },
          ],
          generationConfig: {
            responseModalities: ['TEXT'],
          },
        }),
        signal: AbortSignal.timeout(65000),
      });

      const raw = await res.text();
      recordDebug(url, res.status, raw, '', model);

      if (res.status === 200) {
        const reply = extractReply(raw);
        if (reply && reply.trim()) {
          activeGeminiModel = model;
          rotationIndex = i;
          persistModel();
          updateAgentModelLabel();
          return { success: true, reply: reply.trim(), model };
        }
        // 200 but empty answer — model did not respond properly → rotate.
        const reason = 'Model gave an empty answer (200, no text).';
        lastFallbackReason = reason;
        lastError = reason;
        attempts.push({ model, ok: false, reason });
        logRotation({ model, ok: false, status: 200, reason: 'empty reply' });
        continue;
      }

      const apiError = parseApiError(raw);
      const bodyLower = raw.toLowerCase();
      const status = (apiError && apiError.status ? apiError.status : '').toUpperCase();

      if (isFatalKeyError(res.status, apiError, bodyLower)) {
        return {
          success: false,
          message: friendlyError(res.status, apiError, bodyLower),
        };
      }

      // All other failures → rotate to the next model.
      const reason =
        status === 'NOT_FOUND' || res.status === 404
          ? 'Model not available for this key'
          : bodyLower.includes('quota') || res.status === 429
            ? 'Quota / rate limit'
            : res.status >= 500
              ? 'Server error (HTTP ' + res.status + ')'
              : 'HTTP ' + res.status + ' ' + status;

      lastFallbackReason = 'Model "' + model + '" failed → ' + reason + '.';
      lastError = reason;
      attempts.push({ model, ok: false, reason });
      logRotation({ model, ok: false, status: res.status, reason });
      continue;
    } catch (e) {
      if (e && e.name === 'TimeoutError') {
        const reason = 'Timeout after 65 seconds (no response from ' + model + ').';
        recordDebug(url, 0, '', reason, model);
        lastFallbackReason = 'Model "' + model + '" timed out.';
        lastError = reason;
        attempts.push({ model, ok: false, reason: 'timeout' });
        logRotation({ model, ok: false, status: 0, reason: 'timeout' });
        continue;
      }

      const reason = 'Network/request error: ' + (e && e.message ? e.message : e);
      recordDebug(url, 0, '', reason, model);
      lastFallbackReason = 'Model "' + model + '" network failure.';
      lastError = reason;
      attempts.push({ model, ok: false, reason: 'network' });
      logRotation({ model, ok: false, status: 0, reason: 'network' });
      // Network failure — try next model.
      continue;
    }
  }

  // Every model failed without a fatal key error.
  return {
    success: false,
    message:
      'All ' +
      geminiModels.length +
      ' Gemini models were tried but none gave a proper response.\n' +
      (lastFallbackReason || '') +
      '\n\nPlease check your internet connection, then try again, or use an API key with access to Gemini models.',
  };
}

async function pingOneModel(model) {
  const url = modelUrl(model);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': globalApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
        generationConfig: { responseModalities: ['TEXT'] },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const raw = await res.text();
    const ms = Date.now() - start;

    if (res.status === 200 && extractReply(raw)) {
      return { ok: true, model, ms, reason: 'OK' };
    }
    const apiError = parseApiError(raw);
    return {
      ok: false,
      model,
      ms,
      reason: (apiError && apiError.status) || 'HTTP ' + res.status,
    };
  } catch (e) {
    return {
      ok: false,
      model,
      ms: Date.now() - start,
      reason: e && e.name === 'TimeoutError' ? 'Timeout (30s)' : 'Network error',
    };
  }
}