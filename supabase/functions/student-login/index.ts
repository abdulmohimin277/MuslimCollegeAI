// ============================================================
// EDGE FUNCTION — student-login
// ------------------------------------------------------------
// Verifies roll number + PIN (PBKDF2-SHA256, stored salt+iterations),
// enforces brute-force lockout, signs a STUDENT JWT
// (role='student', sub=student.id) and audits the attempt.
//
// A student NEVER authenticates with the roll number alone —
// the PIN is required and is verified only against the salted
// hash stored server-side. RLS then limits the token to that
// single student's own row / class / marks.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { signSession } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

const LOCK_AFTER_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_HOURS = 12;

function normalizeRoll(roll: string): string {
  return String(roll || '').replace(/[^\d]/g, '').replace(/^0+/, '') || '0';
}

function pbkdf2Hex(password: string, salt: string, iterations: number): Promise<{ hex: string; ok: boolean }> {
  const enc = new TextEncoder();
  const it = iterations > 0 ? iterations : 60000;
  return crypto.subtle
    .importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    .then((key) => crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: it, hash: 'SHA-256' },
      key, 256
    ))
    .then((bits) => {
      const bytes = new Uint8Array(bits);
      let hex = '';
      bytes.forEach((x) => (hex += x.toString(16).padStart(2, '0')));
      return { hex, ok: true };
    })
    .catch(() => ({ hex: '', ok: false }));
}

function safeEqual(a: string, b: string): boolean {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const roll = normalizeRoll(body.roll_number);
    const pin = String(body.pin || '').slice(0, 64);
    if (!roll || roll === '0' || !pin) {
      return json({ error: 'Enter your roll number and PIN.' }, 400);
    }

    const supabase = adminClient();
    const key = 'stu:' + normalizeRoll(roll);

    // --- lockout guard ---
    const { data: rec } = await supabase
      .from('login_attempts')
      .select('fails, locked_until')
      .eq('key', key)
      .maybeSingle();
    if (rec?.locked_until && new Date(rec.locked_until).getTime() > Date.now()) {
      await audit(supabase, { action: 'LOGIN_LOCKED', entity: 'student', details: 'Locked student portal login attempt (roll redacted)', success: false });
      return json({ error: 'Too many failed attempts. Try again after 15 minutes.' }, 429);
    }

    // --- find student by roll number (fall back to zero-stripped form) ---
    let student = null;
    const attempts = [normalizeRoll(roll), roll];
    for (const r of [...new Set(attempts)]) {
      const { data } = await supabase
        .from('students')
        .select('id, roll_number, name, pin_hash, pin_salt, pin_iterations')
        .eq('roll_number', r)
        .maybeSingle();
      if (data) { student = data; break; }
    }

    let ok = false;
    if (student && student.pin_hash && student.pin_salt) {
      const h = await pbkdf2Hex(pin, student.pin_salt, Number(student.pin_iterations || 60000));
      ok = h.ok && safeEqual(h.hex, student.pin_hash);
    }

    const fail = async () => {
      const { data: cur } = await supabase
        .from('login_attempts')
        .select('fails, locked_until')
        .eq('key', key)
        .maybeSingle();
      const fails = (cur?.fails || 0) + 1;
      const locked = fails >= LOCK_AFTER_FAILS;
      await supabase.from('login_attempts').upsert({
        key,
        fails: locked ? 0 : fails,
        locked_until: locked ? new Date(Date.now() + LOCK_MS).toISOString() : null,
      }, { onConflict: 'key' });
      await audit(supabase, { action: 'LOGIN_FAILED', entity: 'student', details: 'Failed student portal login attempt (roll redacted)', success: false });
    };

    if (!ok) {
      await fail();
      return json({ error: 'Roll number or PIN is incorrect, or this student has no portal access.' }, 401);
    }

    // --- success ---
    await supabase.from('login_attempts').delete().eq('key', key);
    const access_token = await signSession(
      {
        role: 'student',
        sub: student.id,
        roll_number: student.roll_number,
        name: student.name,
      },
      SESSION_HOURS
    );
    await audit(supabase, {
      action: 'LOGIN_SUCCESS', entity: 'student', entityId: student.id,
      details: 'Student portal login succeeded (roll redacted)', success: true,
    });

    return json({
      access_token,
      student: { id: student.id, rollNumber: student.roll_number, name: student.name },
    });
  } catch (e) {
    console.error('student-login error:', e);
    return json({ error: 'Login could not be completed.' }, 500);
  }
});