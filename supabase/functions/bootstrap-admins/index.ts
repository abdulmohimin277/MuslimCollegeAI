// ============================================================
// EDGE FUNCTION — bootstrap-admins
// ------------------------------------------------------------
// Creates (or updates) THE single FIXED administrator account
// from PROTECTED Supabase secrets:
//
//   FIXED_ADMIN_USER  (defaults to "Muslim College Multan")
//   FIXED_ADMIN_PASS  (required; e.g. "2004" — set via secrets)
//   MC_BOOTSTRAP_KEY  (key required to call this endpoint)
//
// Access control:
//   • Header `x-bootstrap-key` must equal MC_BOOTSTRAP_KEY, OR
//   • a valid admin JWT whose `is_master` claim is true.
//
// Design (owner-approved):
//   • There is exactly ONE administrator account.
//   • It is FIXED — the panel can NEVER change it (admin-security
//     denies change_credentials). Changing the credentials means
//     editing the secrets/code here and re-running bootstrap.
//   • Other admin rows (from previous setups) are removed so only
//     the fixed account can log in.
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
      return json({ error: 'Bootstrap key required (or fixed admin JWT).' }, 401);
    }

    const supabase = adminClient();

    const fixedUser = String(Deno.env.get('FIXED_ADMIN_USER') || 'Muslim College Multan').trim();
    const fixedPass = String(Deno.env.get('FIXED_ADMIN_PASS') || '');

    if (!fixedUser) {
      return json({ error: 'FIXED_ADMIN_USER secret is empty.' }, 400);
    }
    if (!fixedPass || fixedPass.length < 4) {
      return json({
        error: 'FIXED_ADMIN_PASS missing or too short. Run: supabase secrets set FIXED_ADMIN_USER="Muslim College Multan" FIXED_ADMIN_PASS="<password>" then re-run bootstrap (see SETUP.md).',
      }, 400);
    }

    const { data: hash } = await supabase.rpc('mc_hash_password', { password: fixedPass });
    if (!hash) {
      return json({ error: 'Could not hash the password (pgcrypto unavailable?).' }, 500);
    }

    // Upsert the single fixed account (is_master so it is recognised
    // as the root account; there are no changeable sub-accounts).
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .ilike('username', fixedUser)
      .maybeSingle();

    if (existing) {
      await supabase.from('admins').update({ username: fixedUser, password_hash: hash, is_master: true }).eq('id', existing.id);
    } else {
      await supabase.from('admins').insert({ username: fixedUser, password_hash: hash, is_master: true });
    }

    // Remove any other admin rows so ONLY the fixed account can log in.
    await supabase.from('admins').delete().neq('username', fixedUser);

    await audit(supabase, {
      action: 'BOOTSTRAP_ADMINS', entity: 'admin', admin: 'system',
      details: 'Bootstrap ran for the single fixed admin account (username redacted)', success: true,
    });

    return json({
      ok: true,
      results: [{ role: 'admin', is_master: true, status: existing ? 'updated' : 'created', user: maskUser(fixedUser) }],
      hint: 'Raw credentials are never returned. See SETUP.md.',
    });
  } catch (e) {
    console.error('bootstrap-admins error:', e);
    return json({ error: 'Bootstrap could not be completed.' }, 500);
  }
});