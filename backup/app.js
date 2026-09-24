/* ============================================================
   Muslim College AI Study Agent — Pure JavaScript
   100% JS (HTML + CSS + JS). No Flutter. No Dart.
   ============================================================ */

'use strict';

// ============================================================
// ADMIN CREDENTIALS
// ============================================================
const ADMIN_USER = 'muslim college';
const ADMIN_PASS = 'muslim2004';

// ============================================================
// GLOBAL STATE
// ============================================================
let studentName = '';
let studentRoll = '';
let globalApiKey = '';

// Gemini chat models to try, newest → oldest.
// The app automatically rotates to the next model whenever the
// current model does NOT give a proper response (404 / no access /
// empty answer / timeout / quota / server error / network failure).
const geminiModels = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-omni-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
];

const PRIMARY_MODEL = geminiModels[0];
let activeGeminiModel = PRIMARY_MODEL;
let rotationIndex = 0; // position in the rotation list

// Rotation history for the Admin panel: last few model attempts.
let rotationHistory = [];

// Raw data of the LAST request (for the Debug tab).
const debug = {
  url: '',
  statusCode: 0,
  body: '',
  localError: '',
  model: '',
};

let chatMessages = []; // { sender: 'bot'|'user', text, model? }
let lastAnswer = null;
let isSending = false;
let adminUnlocked = false;

// Session persistence keys
const KEYS = {
  name: 'mc_name',
  roll: 'mc_roll',
  key: 'mc_key',
  chat: 'mc_chat',
  admin: 'mc_admin',
};

// ============================================================
// SMALL HELPERS
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(text, kind) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast show ' + (kind || '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.className = 'toast';
  }, 3200);
}

function safeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : String(text);
  return d.innerHTML;
}

function fixLogoFallback() {
  document.querySelectorAll('.logo-circle img, .agent-avatar img, .brand-logo img, .nav-logo img, .model-dot img, .home-logo img').forEach((img) => {
    img.onerror = () => {
      img.style.display = 'none';
    };
  });
}

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* storage unavailable — ignore */
  }
}

function removeLS(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

function recordDebug(url, statusCode, body, localError, model) {
  debug.url = url || '';
  debug.statusCode = statusCode || 0;
  debug.body = (body || '').trim();
  debug.localError = localError || '';
  debug.model = model || activeGeminiModel;
}

function debugSummary() {
  const lines = [];
  lines.push('Model: ' + (debug.model || '(none)'));
  lines.push('URL: ' + (debug.url || '(none)'));
  lines.push(
    'HTTP STATUS: ' +
      (debug.statusCode === 0 ? 'N/A (no response)' : debug.statusCode)
  );
  lines.push('RAW RESPONSE BODY:');
  lines.push(debug.body ? debug.body : '(empty response body)');
  if (debug.localError) {
    lines.push('');
    lines.push('LOCAL ERROR: ' + debug.localError);
  }
  return lines.join('\n');
}

// ============================================================
// CHAT PERSISTENCE
// ============================================================
function saveChat() {
  try {
    localStorage.setItem(KEYS.chat, JSON.stringify(chatMessages.slice(-200)));
  } catch (e) {
    /* ignore */
  }
}

function loadChat() {
  try {
    const raw = localStorage.getItem(KEYS.chat);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================
function login() {
  const name = $('#name-input').value.trim();
  const roll = $('#roll-input').value.trim();
  const key = $('#api-input').value.trim();

  if (!name || !roll || !key) {
    toast('Please fill all fields (Name, Roll No, API Key) properly!', 'error');
    return;
  }

  studentName = name;
  studentRoll = roll;
  globalApiKey = key;

  writeLS(KEYS.name, name);
  writeLS(KEYS.roll, roll);
  writeLS(KEYS.key, key);

  enterDashboard();
}

function logout() {
  $('#dashboard').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');

  // Keep the fields filled so switching users is quick.
  $('#name-input').value = studentName;
  $('#roll-input').value = studentRoll;
  $('#api-input').value = globalApiKey;
}

function clearData() {
  removeLS(KEYS.name);
  removeLS(KEYS.roll);
  removeLS(KEYS.key);
  removeLS(KEYS.chat);
  studentName = '';
  studentRoll = '';
  globalApiKey = '';
  chatMessages = [];
  lastAnswer = null;
  renderChat();
  toast('App data cleared successfully!', 'success');
}

function enterDashboard() {
  $('#login-screen').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  const nameEl = $('#student-name');
  const rollEl = $('#student-roll');
  if (nameEl) nameEl.textContent = studentName;
  if (rollEl) rollEl.textContent = 'Roll: ' + studentRoll;
  document.title = 'Muslim College AI Agent — ' + studentName;

  // Restore chat history, else show the ChatGPT-style welcome screen.
  const saved = loadChat();
  chatMessages = saved && saved.length ? saved : [];

  lastAnswer = null;
  updateHome(chatMessages.length === 0);
  renderChat();
  updateAgentModelLabel();
  switchTab('agent');
  $('#debug-key').value = globalApiKey;
}

// Personalize the empty-state welcome screen with the student's name.
function updateHome(show) {
  const home = $('#home');
  const title = $('#home-title');
  const sub = $('#home-sub');
  if (!home) return;

  if (title) {
    title.textContent = 'How can I help you today?';
  }
  if (sub) {
    sub.textContent = studentName
      ? 'Welcome, ' + studentName + ' · Muslim College AI Study Agent'
      : 'Muslim College AI Study Agent';
  }
  home.classList.toggle('hidden', !show);
  setWelcome(show);
}

// ============================================================
// TABS
// ============================================================
function switchTab(name) {
  $$('.tab-panel').forEach((p) => p.classList.add('hidden'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.remove('hidden');

  $$('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name);
  });

  if (name === 'tools') updateToolsStatus();
  if (name === 'admin') {
    renderAdmin();
    if (adminUnlocked) refreshLogs();
  }
  if (name === 'debug') {
    $('#debug-key').value = globalApiKey;
  }
}

// ============================================================
// MODEL LABEL / STATUS HELPERS
// ============================================================
function updateAgentModelLabel() {
  const el = $('#agent-model-label');
  if (el) {
    el.textContent = activeGeminiModel;
  }
  const statusModel = $('#status-model');
  if (statusModel) statusModel.textContent = activeGeminiModel;
  const adminModel = $('#admin-active-model');
  if (adminModel) adminModel.textContent = activeGeminiModel;
}

function updateToolsStatus() {
  const questions = chatMessages.filter((m) => m.sender === 'user').length;
  const sm = $('#status-model');
  const sq = $('#status-questions');
  const ss = $('#status-student');
  if (sm) sm.textContent = activeGeminiModel;
  if (sq) sq.textContent = String(questions);
  if (ss) ss.textContent = studentName ? studentName + ' (' + studentRoll + ')' : '—';
}

// ============================================================
// AI AGENT — CHAT
// ============================================================
function scrollChatToBottom() {
  requestAnimationFrame(() => {
    const wrap = $('.chat-scroll');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
    // Only auto-focus the input when there is an active conversation.
    if (chatMessages.length > 0 && $('#chat-input')) $('#chat-input').focus();
  });
}

// Toggles "welcome mode": centers the welcome text + composer together
// on the empty screen, exactly like ChatGPT's initial state.
function setWelcome(active) {
  const panel = $('#tab-agent');
  if (panel) panel.classList.toggle('welcome', !!active);
}

function renderMarkdownLite(text) {
  const lines = safeHtml(text).split('\n');
  const out = [];

  for (let raw of lines) {
    const line = raw.trim();

    if (!line) {
      out.push('<div class="md-line">&nbsp;</div>');
      continue;
    }

    // Headings: ##, ###, ####
    let m = line.match(/^(#{1,4})\s+(.*)$/);
    if (m) {
      const level = Math.min(m[1].length + 1, 6);
      out.push(
        '<div class="md-heading h' + level + '">' + inlineFormat(m[2]) + '</div>'
      );
      continue;
    }

    // Bullet lists
    m = line.match(/^[-*•]\s+(.*)$/);
    if (m) {
      out.push('<div class="md-bullet">' + inlineFormat(m[1]) + '</div>');
      continue;
    }

    // Numbered lists
    m = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (m) {
      out.push(
        '<div class="md-num"><span class="md-n">' +
          m[1] +
          '.</span><span>' +
          inlineFormat(m[2]) +
          '</span></div>'
      );
      continue;
    }

    out.push('<div class="md-line">' + inlineFormat(line) + '</div>');
  }

  return out.join('');
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function renderChat() {
  const list = $('#chat-list');
  if (!list) return;
  list.innerHTML = '';

  for (const msg of chatMessages) {
    const isUser = msg.sender === 'user';

    const row = document.createElement('div');
    row.className = 'msg ' + (isUser ? 'user' : 'bot');

    if (!isUser) {
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      const img = document.createElement('img');
      img.src = 'assets/logo.png';
      img.alt = 'Muslim College agent';
      img.onerror = () => {
        avatar.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12.5V17c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5"/></svg>';
      };
      avatar.appendChild(img);
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (isUser) {
      bubble.textContent = msg.text;
    } else {
      bubble.innerHTML = renderMarkdownLite(msg.text);
    }

    // Model tag when a rotated (non-primary) model answered
    if (!isUser && msg.model && msg.model !== PRIMARY_MODEL) {
      const tag = document.createElement('div');
      tag.className = 'model-tag';
      tag.textContent = msg.model;
      bubble.appendChild(tag);
    }

    // Copy / PDF actions on bot messages
    if (!isUser) {
      const actions = document.createElement('div');
      actions.className = 'bubble-actions';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'mini-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => copyText(msg.text, copyBtn));
      actions.appendChild(copyBtn);

      const pdfBtn = document.createElement('button');
      pdfBtn.type = 'button';
      pdfBtn.className = 'mini-btn';
      pdfBtn.textContent = 'PDF';
      pdfBtn.addEventListener('click', () => {
        lastAnswer = msg.text;
        updatePdfBar();
        savePdf();
      });
      actions.appendChild(pdfBtn);

      bubble.appendChild(actions);
    }

    row.appendChild(bubble);

    list.appendChild(row);
  }

  // Toggle between the empty-state welcome screen and the conversation.
  const home = $('#home');
  const hasChat = chatMessages.length > 0;
  list.classList.toggle('hidden', !hasChat);
  if (home) home.classList.toggle('hidden', hasChat);
  setWelcome(!hasChat);

  if (hasChat) {
    scrollChatToBottom();
  } else {
    const wrap = $('.chat-scroll');
    if (wrap) wrap.scrollTop = 0;
  }
}

// ============================================================
// VOICE INPUT (Web Speech API — Chrome / Edge)
// ============================================================
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceActive = false;
let voiceRecognition = null;

function toggleVoice() {
  const mic = $('#mic-btn');
  if (voiceActive) {
    stopVoice();
    return;
  }
  if (!SpeechRecognitionImpl) {
    toast('Voice input is not supported in this browser. Please use Chrome or Edge.', 'error');
    return;
  }
  if (!globalApiKey.trim()) {
    toast('Login with an API key first, then use voice input.', 'error');
    return;
  }

  const rec = new SpeechRecognitionImpl();
  rec.lang = 'en-US';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    voiceActive = true;
    if (mic) mic.classList.add('listening');
    toast('Listening… speak now!', 'success');
  };

  rec.onresult = (e) => {
    const transcript = (e.results[0][0].transcript || '').trim();
    if (transcript) {
      const input = $('#chat-input');
      input.value = transcript;
      autoResizeInput();
      input.focus();
      toast('"' + transcript.slice(0, 42) + (transcript.length > 42 ? '…' : '') + '"', 'success');
    }
  };

  rec.onerror = (e) => {
    toast('Voice error: ' + (e.error || 'unknown'), 'error');
  };

  rec.onend = () => {
    stopVoice();
  };

  try {
    rec.start();
    voiceRecognition = rec;
  } catch (err) {
    toast('Could not start voice input.', 'error');
  }
}

function stopVoice() {
  voiceActive = false;
  const mic = $('#mic-btn');
  if (mic) mic.classList.remove('listening');
  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch (e) {
      /* already stopped */
    }
    voiceRecognition = null;
  }
}

function setLoading(loading) {
  isSending = loading;
  $('#thinking-bar').classList.toggle('hidden', !loading);
  $('#send-btn').disabled = loading;
  $('#chat-input').disabled = loading;
  const mic = $('#mic-btn');
  if (mic) mic.disabled = loading;
  updatePdfBar();
}

function updatePdfBar() {
  const hasAnswer = !!(lastAnswer && lastAnswer.trim());
  $('#pdf-bar').classList.toggle('hidden', !hasAnswer || isSending);
}

function addUserMessage(text) {
  chatMessages.push({ sender: 'user', text });
  saveChat();
  renderChat();
}

function addBotMessage(text, model) {
  chatMessages.push({ sender: 'bot', text, model: model || undefined });
  saveChat();
  renderChat();
}

function clearChat() {
  chatMessages = [];
  lastAnswer = null;
  removeLS(KEYS.chat);
  saveChat();
  updateHome(true);
  renderChat();
  toast('Chat cleared!', 'success');
}

async function sendMessage() {
  const input = $('#chat-input');
  const text = input.value.trim();

  if (!text || isSending) return;

  if (!globalApiKey.trim()) {
    addBotMessage(
      'No API key found. Please go to the Login screen and enter a valid Gemini API key (AIza...).'
    );
    return;
  }

  addUserMessage(text);
  input.value = '';
  autoResizeInput();
  lastAnswer = null;

  setLoading(true);

  const result = await askGemini(text);

  setLoading(false);

  if (result.success && result.reply) {
    lastAnswer = result.reply;
    activeGeminiModel = result.model || activeGeminiModel;
    updateAgentModelLabel();
    addBotMessage(result.reply, result.model);
  } else {
    addBotMessage(result.message || 'Something went wrong. Please try again.');
  }

  updatePdfBar();
}

// ============================================================
// GEMINI API — SMART MODEL ROTATION
// ============================================================
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

async function askGemini(question) {
  const systemPrompt = buildSystemPrompt(question);
  let lastFallbackReason = null;
  let lastError = null;
  const attempts = [];

  // Rotate through models starting from the last working position.
  for (let i = 0; i < geminiModels.length; i++) {
    const model = geminiModels[i];
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      model +
      ':generateContent';

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

// ============================================================
// COPY TEXT
// ============================================================
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = 'Copy'), 1600);
    }
    toast('Copied to clipboard!', 'success');
  } catch (e) {
    toast('Could not copy automatically. Select the text manually.', 'error');
  }
}

// ============================================================
// SAVE LAST ANSWER AS PDF
// ============================================================
async function savePdf() {
  if (!lastAnswer || !lastAnswer.trim()) {
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

// ============================================================
// INSTALL AS APP (PWA)
// ============================================================
let deferredInstallPrompt = null;
let appInstalled = false;

function showInstallButton(show) {
  const btn = $('#install-btn');
  if (btn) btn.classList.toggle('hidden', !show);
}

async function installApp() {
  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    promptEvent.prompt();
    try {
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        toast('Installing Muslim College Study Agent...', 'success');
      } else {
        toast('Install cancelled.', '');
      }
    } catch (e) {
      toast('Could not start the install. Use the browser install icon in the address bar.', 'error');
    }
    return;
  }

  if (appInstalled || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) {
    toast('Muslim College Study Agent is already installed.', 'success');
    return;
  }

  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    toast('On iPhone / iPad: tap the Share button, then "Add to Home Screen".', '');
    return;
  }

  toast('Tap the install icon in the browser address bar, or Chrome menu → "Install app", to download it.', '');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallButton(true);
});

window.addEventListener('appinstalled', () => {
  appInstalled = true;
  deferredInstallPrompt = null;
  showInstallButton(false);
  toast('App installed successfully! You can now open it from your desktop or home screen.', 'success');
});

// ============================================================
// ABOUT / PRIVACY / TERMS (modal)
// ============================================================
function openLegal(section) {
  const modal = $('#about-modal');
  const body = $('#about-modal-body');
  if (!modal || !body) return;

  const source = document.querySelector('#tab-about .legal-content');
  if (source) {
    body.innerHTML = '';
    body.appendChild(source.cloneNode(true));
  }

  const titles = { about: 'About', privacy: 'Privacy Policy', terms: 'Terms & Conditions' };
  const mt = $('#modal-title');
  if (mt) mt.textContent = (section && titles[section]) || 'About';

  modal.classList.remove('hidden');

  if (section) {
    requestAnimationFrame(() => {
      const el = body.querySelector('[data-sec="' + section + '"]');
      if (el) body.scrollTop = el.offsetTop - 16;
    });
  }
}

function closeLegal() {
  const modal = $('#about-modal');
  if (modal) modal.classList.add('hidden');
}

// ============================================================
// ADMIN PANEL
// ============================================================
function renderAdmin() {
  const lock = $('#admin-lock');
  const panel = $('#admin-panel');
  if (!lock || !panel) return;

  lock.classList.toggle('hidden', adminUnlocked);
  panel.classList.toggle('hidden', !adminUnlocked);

  if (adminUnlocked) {
    updateAgentModelLabel();
    refreshLogs();
  }
}

function loginAdmin() {
  const user = $('#admin-user').value.trim().toLowerCase();
  const pass = $('#admin-pass').value;

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    adminUnlocked = true;
    writeLS(KEYS.admin, 'yes');
    toast('Admin unlocked successfully!', 'success');
    renderAdmin();
  } else {
    toast('Incorrect admin username or password!', 'error');
  }
}

function lockAdmin() {
  adminUnlocked = false;
  removeLS(KEYS.admin);
  $('#admin-user').value = '';
  $('#admin-pass').value = '';
  toast('Admin panel locked.', '');
  renderAdmin();
}

function refreshLogs() {
  const logs = $('#logs-text');
  if (!logs) return;

  const fallbackNote =
    activeGeminiModel !== PRIMARY_MODEL
      ? ' (auto-rotated from ' + PRIMARY_MODEL + ')'
      : '';
  const questions = chatMessages.filter((m) => m.sender === 'user').length;

  let historyText = '';
  if (rotationHistory.length) {
    historyText = '\n\n--- Recent model rotation log ---\n';
    rotationHistory.slice(0, 8).forEach((h) => {
      const mark = h.ok ? '[OK]' : '[FAIL]';
      historyText += mark + ' ' + h.model + ' → ' + (h.reason || ('HTTP ' + h.status)) + '\n';
    });
  } else {
    historyText = '\n\n(No rotations happened yet.)';
  }

  logs.textContent =
    'Logged User: ' + (studentName || 'N/A') + ' | Roll: ' + (studentRoll || 'N/A') + '\n' +
    'Status: Connected to ' + activeGeminiModel + fallbackNote + '\n' +
    'Total Questions: ' + questions + '\n' +
    'Models tried (newest → oldest): ' + geminiModels.join(', ') +
    historyText;
}

async function adminTestRotation() {
  const box = $('#admin-rotation-result');
  if (!box) return;
  const btn = $('#admin-test-rotation-btn');
  if (!globalApiKey.trim()) {
    box.innerHTML = '<div class="rot-item err">No API key found. Login with an API key first.</div>';
    return;
  }

  btn.disabled = true;
  box.innerHTML = '<div class="rot-item"> Testing ' + geminiModels.length + ' models…</div>';

  const results = [];
  for (const model of geminiModels) {
    box.innerHTML =
      '<div class="rot-item"> Testing <b>' + safeHtml(model) + '</b> …</div>';

    const r = await pingOneModel(model);
    results.push(r);

    const item = document.createElement('div');
    item.className = 'rot-item ' + (r.ok ? 'ok' : 'err');
    item.innerHTML =
      '<b>' + safeHtml(model) + '</b>' +
      '<span class="rot-ms">' + (r.ok && r.ms ? r.ms + 'ms' : '') + '</span>' +
      '<span class="rot-status">' + safeHtml(r.reason || 'OK') + '</span>';
    box.appendChild(item);
  }

  const okCount = results.filter((r) => r.ok).length;
  if (okCount === results.length) {
    toast('All ' + results.length + ' models responded OK!', 'success');
  } else if (okCount > 0) {
    toast(okCount + ' of ' + results.length + ' models OK — rotation works.', '');
  } else {
    toast('No model responded. Check your API key / network.', 'error');
  }

  btn.disabled = false;
}

async function pingOneModel(model) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent';
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

// ============================================================
// DEBUG TAB
// ============================================================
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
  out.className = cls || '';
  out.textContent = text;
  out.scrollTop = 0;
}

async function testConnection() {
  const key = debugKey();
  if (!key) {
    setDebugOutput('No API key found.\nEnter one above, or on the Login screen.', 'err');
    return;
  }

  const model = $('#debug-model').value;
  setDebugOutput('... Testing model "' + model + '" ...');
  $('#test-conn-btn').disabled = true;
  $('#list-models-btn').disabled = true;
  $('#test-all-models-btn').disabled = true;

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
    $('#test-conn-btn').disabled = false;
    $('#list-models-btn').disabled = false;
    $('#test-all-models-btn').disabled = false;
  }
}

async function listModels() {
  const key = debugKey();
  if (!key) {
    setDebugOutput('No API key found.\nEnter one above, or on the Login screen.', 'err');
    return;
  }

  setDebugOutput('... Fetching model list ...');
  $('#test-conn-btn').disabled = true;
  $('#list-models-btn').disabled = true;
  $('#test-all-models-btn').disabled = true;

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
    $('#test-conn-btn').disabled = false;
    $('#list-models-btn').disabled = false;
    $('#test-all-models-btn').disabled = false;
  }
}

async function testAllModels() {
  const key = debugKey();
  if (!key) {
    setDebugOutput('No API key found.\nEnter one above, or on the Login screen.', 'err');
    return;
  }

  setDebugOutput('... Rotation test started — trying ' + geminiModels.length + ' models...\n');
  $('#test-conn-btn').disabled = true;
  $('#list-models-btn').disabled = true;
  $('#test-all-models-btn').disabled = true;

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

  $('#test-conn-btn').disabled = false;
  $('#list-models-btn').disabled = false;
  $('#test-all-models-btn').disabled = false;
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
  const text = $('#debug-output').textContent;
  await copyText(text);
}

// ============================================================
// EVENT WIRING + INIT
// ============================================================
function autoResizeInput() {
  const ta = $('#chat-input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

function wireEvents() {
  // Login form
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    login();
  });
  $('#toggle-key').addEventListener('click', () => {
    const input = $('#api-input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Dashboard header
  $('#logout-btn').addEventListener('click', logout);

  // New chat (sidebar)
  $('#new-chat-btn').addEventListener('click', () => {
    clearChat();
    switchTab('agent');
  });

  // Sidebar toggle (mobile overlay)
  $('#sidebar-toggle-btn').addEventListener('click', (e) => {
    const shell = $('#app-shell');
    const open = shell.classList.toggle('sidebar-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  // Tap the dimmed backdrop to close the mobile drawer
  const backdrop = $('#sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      $('#app-shell').classList.remove('sidebar-open');
      $('#sidebar-toggle-btn').setAttribute('aria-expanded', 'false');
    });
  }

  // Sidebar navigation
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      $('#app-shell').classList.remove('sidebar-open');
      $('#sidebar-toggle-btn').setAttribute('aria-expanded', 'false');
    });
  });

  // Chat
  $('#send-btn').addEventListener('click', sendMessage);
  $('#mic-btn').addEventListener('click', toggleVoice);
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $('#chat-input').addEventListener('input', autoResizeInput);
  $('#save-pdf-btn').addEventListener('click', savePdf);
  $('#clear-chat-btn').addEventListener('click', clearChat);

  // Tools
  $('#shortcut-btn').addEventListener('click', installApp);
  $('#clear-btn').addEventListener('click', clearData);

  // Install as app
  $('#install-btn').addEventListener('click', installApp);

  // About / legal modal
  $('#open-about').addEventListener('click', () => openLegal('about'));
  $('#open-privacy').addEventListener('click', () => openLegal('privacy'));
  $('#open-terms').addEventListener('click', () => openLegal('terms'));
  $('#close-about-btn').addEventListener('click', closeLegal);
  $('#about-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLegal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLegal();
  });

  // Admin
  $('#admin-unlock-btn').addEventListener('click', loginAdmin);
  $('#admin-lock-btn').addEventListener('click', lockAdmin);
  $('#toggle-admin-pass').addEventListener('click', () => {
    const input = $('#admin-pass');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('#admin-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      loginAdmin();
    }
  });
  $('#admin-user').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      loginAdmin();
    }
  });
  $('#refresh-logs-btn').addEventListener('click', refreshLogs);
  $('#admin-clear-logs-btn').addEventListener('click', () => {
    clearChat();
    refreshLogs();
  });
  $('#admin-test-rotation-btn').addEventListener('click', adminTestRotation);

  // Debug
  const modelSelect = $('#debug-model');
  geminiModels.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  });
  modelSelect.value = geminiModels[0];

  $('#test-conn-btn').addEventListener('click', testConnection);
  $('#list-models-btn').addEventListener('click', listModels);
  $('#test-all-models-btn').addEventListener('click', testAllModels);
  $('#copy-result-btn').addEventListener('click', copyResult);
  $('#last-chat-btn').addEventListener('click', showLastChatRaw);
}

function init() {
  fixLogoFallback();
  wireEvents();
  autoResizeInput();
  registerServiceWorker();

  // Already installed? Hide the install button when running as an app.
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (standalone) {
    appInstalled = true;
    showInstallButton(false);
  }

  // Restore admin session
  adminUnlocked = readLS(KEYS.admin, '') === 'yes';

  // Restore saved student session.
  const savedName = readLS(KEYS.name, '');
  const savedRoll = readLS(KEYS.roll, '');
  const savedKey = readLS(KEYS.key, '');

  if (savedName && savedRoll && savedKey) {
    studentName = savedName;
    studentRoll = savedRoll;
    globalApiKey = savedKey;
    enterDashboard();
  } else {
    $('#name-input').focus();
  }
}

document.addEventListener('DOMContentLoaded', init);