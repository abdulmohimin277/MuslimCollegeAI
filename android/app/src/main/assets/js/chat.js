/* ============================================================
   CHAT — messages, rendering, voice input, send flow
   (used by the AI Agent page)
   ============================================================ */
'use strict';

function genChatId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function chatTitle(messages) {
  const first = messages.find((m) => m.sender === 'user');
  let title = first ? String(first.text).replace(/\s+/g, ' ').trim() : '';
  if (title.length > 44) title = title.slice(0, 44) + '…';
  return title || 'New chat';
}

// Persists chatMessages under the current chat id and keeps the index list.
function saveChat() {
  try {
    if (!chatMessages.length) return;
    if (!currentChatId) currentChatId = genChatId();
    localStorage.setItem(chatsKey(currentChatId), JSON.stringify(chatMessages.slice(-200)));
    const list = getChats().filter((c) => c.id !== currentChatId);
    list.unshift({ id: currentChatId, title: chatTitle(chatMessages), ts: Date.now() });
    saveChats(list);
    writeLS(KEYS.current, currentChatId);
    renderChatHistory();
  } catch (e) {
    /* ignore storage errors */
  }
}

// Restores the chat identified by `requestId` (from ?chat=...), else the last
// open chat, else migrates the old single-chat value.
function loadChat(requestId) {
  try {
    let id = requestId || readLS(KEYS.current, '');
    let msgs = id ? readChatMessages(id) : null;
    if (msgs) {
      currentChatId = id;
      return msgs;
    }
    // fall back to the most recent conversation in the index
    const list = getChats();
    if (list.length) {
      const last = list[0].id;
      const saved = readChatMessages(last);
      if (saved) {
        currentChatId = last;
        writeLS(KEYS.current, last);
        return saved;
      }
    }
    // migrate the legacy single-chat payload
    const raw = localStorage.getItem(KEYS.chat);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const legacyId = genChatId();
        localStorage.setItem(chatsKey(legacyId), JSON.stringify(parsed));
        saveChats([{ id: legacyId, title: chatTitle(parsed), ts: Date.now() }]);
        currentChatId = legacyId;
        writeLS(KEYS.current, legacyId);
        return parsed;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

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
        persistLastAnswer();
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

/* ---------- Voice input (Web Speech API — Chrome / Edge) ---------- */

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

/* ---------- Loading / UI state ---------- */

function setLoading(loading) {
  isSending = loading;
  const thinkingBar = $('#thinking-bar');
  const sendBtn = $('#send-btn');
  const chatInput = $('#chat-input');
  const mic = $('#mic-btn');
  if (thinkingBar) thinkingBar.classList.toggle('hidden', !loading);
  if (sendBtn) sendBtn.disabled = loading;
  if (chatInput) chatInput.disabled = loading;
  if (mic) mic.disabled = loading;
  updatePdfBar();
}

function updatePdfBar() {
  const bar = $('#pdf-bar');
  if (!bar) return;
  const hasAnswer = !!(lastAnswer && String(lastAnswer).trim());
  bar.classList.toggle('hidden', !hasAnswer || isSending);
}

/* ---------- Message helpers ---------- */

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
  currentChatId = null;
  removeLS(KEYS.current);
  persistLastAnswer();
  updateHome(true);
  renderChat();
  renderChatHistory();
  toast('Started a new chat!', 'success');
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
    persistModel();
    updateAgentModelLabel();
    addBotMessage(result.reply, result.model);
  } else {
    addBotMessage(result.message || 'Something went wrong. Please try again.');
  }

  persistLastAnswer();
  updatePdfBar();
}