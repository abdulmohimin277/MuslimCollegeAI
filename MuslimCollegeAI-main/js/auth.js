/* ============================================================
   AUTH — session / login / logout / data management
   ============================================================ */
'use strict';

// Reads the saved session from localStorage into the runtime globals.
// Returns true when a full (name + roll + key) session exists.
function loadSession() {
  studentName = readLS(KEYS.name, '');
  studentRoll = readLS(KEYS.roll, '');
  globalApiKey = readLS(KEYS.key, '');
  return !!(studentName && studentRoll && globalApiKey);
}

// Guard for the app pages: the router already redirects to #/login
// when there is no session, so this only reports whether we are in.
function ensureLogin() {
  return loadSession();
}

// Fills the sidebar user chip + document title on the current page.
function populateStudent() {
  const nameEl = $('#student-name');
  const rollEl = $('#student-roll');
  if (nameEl) nameEl.textContent = studentName || 'Student';
  if (rollEl) rollEl.textContent = studentRoll ? 'Roll: ' + studentRoll : '—';
  document.title = 'Muslim College AI Agent' + (studentName ? ' — ' + studentName : '');
}

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

  SPA.go('agent');
}

function logout() {
  // Keep the stored values so switching users on the login page is quick.
  SPA.go('login');
}

function clearData() {
  removeLS(KEYS.name);
  removeLS(KEYS.roll);
  removeLS(KEYS.key);
  removeLS(KEYS.chat);
  removeLS(KEYS.chats);
  removeLS(KEYS.current);
  getChats().forEach((c) => removeLS(chatsKey(c.id)));
  removeLS(KEYS.admin);
  removeLS(KEYS.model);
  removeLS(KEYS.debug);
  removeLS(KEYS.rotation);
  removeLS(KEYS.last);
  studentName = '';
  studentRoll = '';
  globalApiKey = '';
  chatMessages = [];
  lastAnswer = null;
  currentChatId = null;
  SPA.go('login');
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
      ? 'Welcome, ' + studentName
      : 'Muslim College AI Study Agent';
  }
  home.classList.toggle('hidden', !show);
  setWelcome(show);
}