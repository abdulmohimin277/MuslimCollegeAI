// ============================================================
// EDGE FUNCTION — student-security
// ------------------------------------------------------------
//   POST { op: 'set_pin', student_id, pin }
//
// Sets / resets a student's portal PIN. The PIN is hashed with
// PBKDF2-SHA256 (unique salt, high iteration count) server-side —
// the raw PIN is never stored, never logged, and is returned once
// so the admin can hand it to the student.
// Admin JWT required.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

const ITERATIONS = 100000;
const MIN_PIN = 4;
const MAX_PIN = 32;

function makeSaltHex(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let hex = '';
  a.forEach((x) => (hex += x.toString(16).padStart(2, '0')));
  return hex;
}

function pbkdf2Hex(password: string, salt: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  return crypto.subtle
    .importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    .then((key) => crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
      key, 256
    ))
    .then((bits) => {
      const bytes = new Uint8Array(bits);
      let hex = '';
      bytes.forEach((x) => (hex += x.toString(16).padStart(2, '0')));
      return hex;
    });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = await requireAdmin(req);
    if (!admin) return json({ error: 'Admin session required.' }, 401);

    const supabase = adminClient();
    const body = await req.json();
    const op = String(body.op || '');

    if (op !== 'set_pin') return json({ error: 'Unknown operation.' }, 400);

    const studentId = String(body.student_id || '');
    const pin = String(body.pin || '');
    if (!studentId) return json({ error: 'student_id is required.' }, 400);
    if (pin.length < MIN_PIN || pin.length > MAX_PIN) {
      return json({ error: 'PIN must be between 4 and 32 characters.' }, 400);
    }

    const { data: student, error: findErr } = await supabase
      .from('students')
      .select('id, roll_number, name')
      .eq('id', studentId)
      .maybeSingle();
    if (findErr || !student) return json({ error: 'Student not found.' }, 404);

    const salt = makeSaltHex();
    const hash = await pbkdf2Hex(pin, salt, ITERATIONS);
    const { error } = await supabase
      .from('students')
      .update({ pin_hash: hash, pin_salt: salt, pin_iterations: ITERATIONS })
      .eq('id', studentId);
    if (error) throw error;

    await audit(supabase, {
      action: 'STUDENT_PIN_SET', entity: 'student', entityId: studentId, admin: String(admin.username || ''),
      details: 'Portal PIN set/reset for student (roll redacted)', success: true,
    });

    // Returned ONCE so the admin can share it with the student.
    return json({ ok: true, pin, student_id: studentId });
  } catch (e) {
    console.error('student-security error:', e);
    return json({ error: 'Request could not be completed.' }, 500);
  }
});