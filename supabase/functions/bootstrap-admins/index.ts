// ============================================================
// EDGE FUNCTION — bootstrap-admins
// ------------------------------------------------------------
// Creates (or updates) the MASTER admin and the changeable admin
// from PROTECTED Supabase secrets:
//
//   MASTER_ADMIN_USER / MASTER_ADMIN_PASS
//   ADMIN_USER        / ADMIN_PASS
//   MC_BOOTSTRAP_KEY  (key required to call this endpoint)
//
// Access control:
//   • Header `x-bootstrap-key` must equal MC_BOOTSTRAP_KEY, OR
//   • a valid admin JWT whose `is_master` claim is true.
//
// The credentials NEVER appear in any committed file, in the
// frontend, or in API responses — only usernames and booleans are
// returned. Raw passwords are hashed via pgcrypto bcrypt server-side.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { verifySession } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

function maskUser(u: string): string {
  return String(u || '').replace(/./g, '*');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // ---- access gate ----
    const bootKey = Deno.env.get('MC_BOOTSTRAP_KEY');
    const headerKey = req.headers.get('x-bootstrap-key') || '';
    const auth = req.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = await verifySession(token);

    const byKey = bootKey && headerKey === bootKey;
    const byMasterJwt = !!payload && payload.role === 'admin' && payload.is_master === true;
    if (!byKey && !byMasterJwt) {
      return json({ error: 'Bootstrap key required (or master admin JWT).' }, 401);
    }

    const supabase = adminClient();

    const masterUser = String(Deno.env.get('MASTER_ADMIN_USER') || '').trim();
    const masterPass = String(Deno.env.get('MASTER_ADMIN_PASS') || '');
    const adminUser = String(Deno.env.get('ADMIN_USER') || '').trim();
    const adminPass = String(Deno.env.get('ADMIN_PASS') || '');

    if (!masterUser || !masterPass || !adminUser || !adminPass) {
      return json({
        error: 'Missing secrets. Configure MASTER_ADMIN_USER / MASTER_ADMIN_PASS / ADMIN_USER / ADMIN_PASS, then run: supabase secrets set ... (see SETUP.md).',
      }, 400);
    }
    if (masterPass.length < 8) return json({ error: 'MASTER_ADMIN_PASS must be at least 8 characters.' }, 400);
    if (adminPass.length < 4) return json({ error: 'ADMIN_PASS must be at least 4 characters.' }, 400);
    if (masterUser.toLowerCase() === adminUser.toLowerCase()) {
      return json({ error: 'MASTER_ADMIN_USER and ADMIN_USER must differ.' }, 400);
    }

    const hashFor = async (p: string) => {
      const { data } = await supabase.rpc('mc_hash_password', { password: p });
      return data;
    };

    const results: { role: string; user: string; is_master: boolean; status: string }[] = [];

    for (const cfg of [
      { role: 'master', user: masterUser, pass: masterPass, isMaster: true },
      { role: 'admin', user: adminUser, pass: adminPass, isMaster: false },
    ]) {
      if (!cfg.user || !cfg.pass) continue;
      const hash = await hashFor(cfg.pass);
      if (!hash) {
        results.push({ role: cfg.role, user: cfg.user, is_master: cfg.isMaster, status: 'error:hashing unavailable' });
        continue;
      }
      const { data: existing } = await supabase
        .from('admins')
        .select('id')
        .ilike('username', cfg.user)
        .maybeSingle();
      const row = {
        username: cfg.user,
        password_hash: hash,
        is_master: cfg.isMaster,
      };
      if (existing) {
        await supabase.from('admins').update(row).eq('id', existing.id);
      } else {
        await supabase.from('admins').insert(row);
      }
      results.push({ role: cfg.role, user: cfg.user, is_master: cfg.isMaster, status: existing ? 'updated' : 'created' });
    }

    await audit(supabase, {
      action: 'BOOTSTRAP_ADMINS', entity: 'admin', admin: 'system',
      details: 'Bootstrap ran for master + changeable admin (usernames redacted)', success: true,
    });

    return json({
      ok: true,
      // Usernames only — raw passwords never returned, and usernames
      // are also masked by default; set showUsernames=1 to reveal.
      results: results.map((r) => ({
        role: r.role, is_master: r.is_master, status: r.status,
        user: bodyShowUsernames(req) ? r.user : maskUser(r.user),
      })),
      hint: 'Raw credentials are never returned. See SETUP.md.',
    });
  } catch (e) {
    console.error('bootstrap-admins error:', e);
    return json({ error: 'Bootstrap could not be completed.' }, 500);
  }
});

function bodyShowUsernames(req: Request): boolean {
  // Parsing again is wasteful; we only read the header instead.
  return req.headers.get('x-show-usernames') === '1';
}