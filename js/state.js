/* ============================================================
   STATE — runtime globals shared across pages.
   Cross-page values (active model, debug info, rotation log,
   last answer) are mirrored to localStorage so every page starts
   from the same state.
   ============================================================ */
'use strict';

let studentName = '';
let studentRoll = '';
let globalApiKey = '';

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
let currentChatId = null; // id of the chat currently open in the agent
let lastAnswer = null;
let isSending = false;
let adminUnlocked = false;

// PWA install state.
let deferredInstallPrompt = null;
let appInstalled = false;

// Voice input (Web Speech API).
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceActive = false;
let voiceRecognition = null;

/* ---------- Cross-page persistence helpers ---------- */

function persistModel() {
  writeLS(KEYS.model, activeGeminiModel);
}

function persistDebug() {
  writeLS(KEYS.debug, JSON.stringify(debug));
}

function persistRotation() {
  writeLS(KEYS.rotation, JSON.stringify(rotationHistory));
}

function persistLastAnswer() {
  if (lastAnswer && String(lastAnswer).trim()) {
    writeLS(KEYS.last, String(lastAnswer));
  } else {
    removeLS(KEYS.last);
  }
}

// Pull shared values back from localStorage (call on every page init).
function restoreSharedState() {
  const savedModel = readLS(KEYS.model, '');
  if (savedModel && geminiModels.indexOf(savedModel) !== -1) {
    activeGeminiModel = savedModel;
  }

  const rawDebug = readLS(KEYS.debug, '');
  if (rawDebug) {
    try {
      const p = JSON.parse(rawDebug);
      debug.url = p.url || '';
      debug.statusCode = p.statusCode || 0;
      debug.body = p.body || '';
      debug.localError = p.localError || '';
      debug.model = p.model || '';
    } catch (e) {
      /* ignore corrupted debug dump */
    }
  }

  const rawRotation = readLS(KEYS.rotation, '');
  if (rawRotation) {
    try {
      const arr = JSON.parse(rawRotation);
      if (Array.isArray(arr)) rotationHistory = arr;
    } catch (e) {
      /* ignore */
    }
  }

  const savedLast = readLS(KEYS.last, null);
  lastAnswer = savedLast !== null ? savedLast : null;
}