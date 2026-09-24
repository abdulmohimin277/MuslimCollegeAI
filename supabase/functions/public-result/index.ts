// ============================================================
// EDGE FUNCTION — public-result
// ------------------------------------------------------------
// Public (anonymous) result-card lookup by BATCH + ROLL NUMBER.
//
//   POST  { batch: '1st Year' | 'Second Year', roll: '1042' }
//
// Flow (owner-approved design):
//   • Result tab → pick 1st Year / Second Year → enter roll number
//   • Every class of that batch is searched for the roll number
//   • The matching student's result card is shown (print/PDF/copy)
//   • NO login and NO PIN — the roll number alone returns the card
//
// Security notes:
//   • Returns ONLY the fields needed to render a card — never
//     pin_hash / pin_salt / contact / admission / notes / photo.
//   • Rate-limited per IP (best-effort, in-memory) to slow bulk
//     scraping; deploy with `--no-verify-jwt` so students can call
//     it without a session (see SETUP.md).
//   • By design this endpoint does NOT write audit rows for
//     lookups (no roll-number/PII retention) — raw tables stay
//     locked behind RLS; only this computed card is exposed.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/audit.ts';

const BATCHES = new Set(['1st Year', 'Second Year']);
const RATE_LIMIT_PER_MIN = 20;

// Best-effort per-isolate limiter: ip -> { count, windowStart }.
// Isolates may recycle, so treat this as a mitigation, not a hard
// guarantee (the raw tables remain RLS-locked regardless).
const bucket = new Map<string, { count: number; windowStart: number }>();

function ipOf(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  return (fwd.split(',')[0] || 'unknown').trim().slice(0, 64);
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = bucket.get(ip);
  if (!rec || now - rec.windowStart > 60_000) {
    bucket.set(ip, { count: 1, windowStart: now });
    if (bucket.size > 5000) {
      for (const [k, v] of bucket) {
        if (now - v.windowStart > 60_000) bucket.delete(k);
      }
    }
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_PER_MIN;
}

function normalizeRoll(roll: string): string {
  return String(roll || '').replace(/[^\d]/g, '').replace(/^0+/, '') || '0';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const ip = ipOf(req);
  if (rateLimited(ip)) {
    return json({ error: 'Too many lookups from this address. Please wait a minute and try again.' }, 429);
  }

  try {
    const body = await req.json().catch(() => null);
    const batch = String((body && body.batch) || '').slice(0, 30);
    const rawRoll = String((body && body.roll) || '').slice(0, 20).replace(/[^\d]/g, '');
    if (!BATCHES.has(batch) || !rawRoll) {
      return json({ error: 'Choose a batch (1st Year or Second Year) and enter a roll number.' }, 400);
    }
    const norm = normalizeRoll(rawRoll);

    const supabase = adminClient();

    // All classes in this batch (+ their class type name).
    const { data: classes, error: clsErr } = await supabase
      .from('classes')
      .select('id,name,class_type_id,session,batch,class_types(name)')
      .eq('batch', batch);
    if (clsErr) {
      console.error('public-result classes error:', clsErr.message);
      return json({ error: 'Lookup could not be completed.' }, 500);
    }
    const classList = classes || [];
    if (!classList.length) return json({ ok: true, matches: [] });

    const classIds = classList.map((c: any) => c.id);
    // Try the typed roll first, then the zero-stripped form (deduped).
    const rollForms = [...new Set([rawRoll, norm])];

    const { data: studentRows, error: stuErr } = await supabase
      .from('students')
      .select('id,serial_number,roll_number,name,father_name,class_id,session,gender,dob')
      .in('class_id', classIds)
      .or(rollForms.map((r) => 'roll_number.eq.' + r).join(','));
    if (stuErr) {
      console.error('public-result students error:', stuErr.message);
      return json({ error: 'Lookup could not be completed.' }, 500);
    }

    const students = studentRows || [];
    if (!students.length) return json({ ok: true, matches: [] });

    const classById = new Map(classList.map((c: any) => [c.id, c]));
    const subjectPromises = students.map((s: any) =>
      supabase
        .from('class_subjects')
        .select('id,name,total_marks,passing_marks,sort_order')
        .eq('class_id', s.class_id)
        .order('sort_order', { ascending: true, nullsFirst: false })
    );
    const markPromises = students.map((s: any) =>
      supabase
        .from('marks')
        .select('class_subject_id,total_marks,obtained_marks')
        .eq('student_id', s.id)
    );
    const [subjectSets, markSets] = await Promise.all([
      Promise.all(subjectPromises),
      Promise.all(markPromises),
    ]);

    const matches = students
      .map((s: any, i: number) => {
        const cls = classById.get(s.class_id) || null;
        if (!cls) return null;
        return {
          student: {
            id: s.id,
            rollNumber: s.roll_number,
            name: s.name,
            fatherName: s.father_name || '',
            classId: s.class_id,
            session: s.session || '',
            gender: s.gender || '',
            dob: s.dob || '',
          },
          cls: {
            id: cls.id,
            name: cls.name,
            classTypeId: cls.class_type_id,
            classTypeName: (cls.class_types && cls.class_types.name) || '—',
            batch: cls.batch || '1st Year',
            session: cls.session || '',
          },
          subjects: (subjectSets[i].data || []).map((x: any) => ({
            id: x.id,
            name: x.name,
            totalMarks: Number(x.total_marks || 0),
            passingMarks: Number(x.passing_marks || 0),
            sortOrder: x.sort_order == null ? 0 : x.sort_order,
          })),
          marks: (markSets[i].data || []).map((m: any) => ({
            classSubjectId: m.class_subject_id,
            totalMarks: Number(m.total_marks || 0),
            obtainedMarks: Number(m.obtained_marks || 0),
          })),
        };
      })
      .filter(Boolean);

    return json({ ok: true, matches });
  } catch (e) {
    console.error('public-result error:', e);
    return json({ error: 'Lookup could not be completed.' }, 500);
  }
});