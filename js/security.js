/* ============================================================
   SECURITY — client-side helpers (used by the local demo adapter
   and the UI). In production (Supabase) the REAL password hashing,
   session signing, rate limiting and audit live server-side; these
   helpers are used for the offline sandbox and for input hygiene
   everywhere.
   ============================================================ */
'use strict';

/* ---------- IDs ---------- */
function uid(prefix) {
  const rand =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return (prefix || '') + rand;
}

/* ---------- Constant-time string compare ---------- */
function safeEqual(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- PBKDF2-SHA256 password hashing (Web Crypto) ----------
   Used by the LOCAL demo sandbox only. Real deployments use the
   server-side hash (pgcrypto bcrypt via Supabase Auth / Edge).     */
function hashPassword(password, salt, iterations) {
  const enc = new TextEncoder();
  const it = iterations || 60000;
  const passData = enc.encode(String(password || ''));
  const saltData = enc.encode(String(salt || ''));
  return crypto.subtle.importKey('raw', passData, 'PBKDF2', false, ['deriveBits']).then(
    (key) =>
      crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltData, iterations: it, hash: 'SHA-256' },
        key,
        256
      ),
    (b) => {
      // Fallback (non-secure-context) — SHA-256 via a tiny sync digest
      // is NOT used; we simply refuse to create accounts without WebCrypto.
      throw new Error('WebCrypto unavailable: ' + (b && b.message));
    }
  ).then((bits) => {
    const bytes = new Uint8Array(bits);
    let hex = '';
    bytes.forEach((x) => (hex += x.toString(16).padStart(2, '0')));
    return { hash: hex, salt: String(salt), iterations: it };
  });
}

function makeSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let hex = '';
  a.forEach((x) => (hex += x.toString(16).padStart(2, '0')));
  return hex;
}

/* ---------- Input validation ---------- */
function str(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 500);
}

function isNonEmpty(v) {
  return str(v).length > 0;
}

function onlyDigits(v, maxLen) {
  const s = String(v == null ? '' : v).replace(/[^\d]/g, '');
  return s.slice(0, maxLen || 20);
}

/** Allowed announcement upload kinds. Executables / scripts forbidden. */
const ALLOWED_ANNOUNCEMENT_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
  video: ['video/mp4', 'video/webm'],
};
const ALLOWED_ANNOUNCEMENT_MIME = Object.values(ALLOWED_ANNOUNCEMENT_TYPES).flat();
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB per file

function classifyFileType(mime) {
  if (!mime || !ALLOWED_ANNOUNCEMENT_MIME.includes(mime)) return null;
  if (ALLOWED_ANNOUNCEMENT_TYPES.image.includes(mime)) return 'image';
  if (ALLOWED_ANNOUNCEMENT_TYPES.video.includes(mime)) return 'video';
  return 'document';
}

function validateUpload(file, existingSize) {
  if (!file) return { ok: false, error: 'No file provided.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'File is larger than the 8 MB limit.' };
  }
  const kind = classifyFileType(file.type);
  if (!kind) {
    return {
      ok: false,
      error: 'File type not allowed. Use images (jpg/png/webp/gif), documents (pdf/office/txt) or videos (mp4/webm).',
    };
  }
  const name = String(file.name || '').replace(/[^\w.\- ]+/g, '_');
  if (!name) return { ok: false, error: 'Invalid file name.' };
  return { ok: true, kind, name, size: file.size };
}

/* ---------- Audit helper (writes through the backend) ---------- */
function audit(action, entity, entityId, details, success, adminName) {
  const b = window.Backend;
  if (b && typeof b.logAudit === 'function') {
    b.logAudit({ action, entity, entityId, details, success: success !== false, admin: adminName || '' }).catch(() => {});
  }
}

/* ---------- Escape / sanitize for safe DOM insertion ---------- */
function escapeHtml(v) {
  const d = document.createElement('div');
  d.textContent = v == null ? '' : String(v);
  return d.innerHTML;
}

/* ---------- Exhibits ---------- */
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    pad(d.getDate()) + ' ' +
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] +
    ' ' + d.getFullYear() + ' — ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes())
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + ' ' +
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] +
    ' ' + d.getFullYear();
}