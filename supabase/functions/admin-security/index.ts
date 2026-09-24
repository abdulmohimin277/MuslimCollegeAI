// ============================================================
// EDGE FUNCTION — admin-security
// ------------------------------------------------------------
// Administrator security operations.
//
//   POST { op: 'change_credentials' }  → ALWAYS DENIED.
//
// Rules enforced server-side:
//   • Caller must hold a VALID admin JWT (role='admin').
//   • There is ONE fixed administrator account (username +
//     password configured by FIXED_ADMIN_USER / FIXED_ADMIN_PASS
//     secrets → bootstrap-admins). It can NEVER be changed from
//     this panel — that is only done by editing the backend
//     configuration/code and re-running bootstrap-admins.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = await requireAdmin(req);
    if (!admin) return json({ error: 'Admin session required.' }, 401);

    const supabase = adminClient();
    const body = await req.json();
    const op = String(body.op || '');

    if (op === 'change_credentials') {
      // By design the single fixed account is NOT changeable from the panel.
      await audit(supabase, {
        action: 'ADMIN_CHANGE_DENIED', entity: 'admin', entityId: admin.sub,
        admin: 'system',
        details: 'Attempt to change fixed admin credentials via panel (blocked by design)', success: false,
      });
      return json({
        error: 'This administrator account is fixed and can only be changed by editing the backend code/configuration, never from this panel.',
      }, 403);
    }

    return json({ error: 'Unknown operation.' }, 400);
  } catch (e) {
    console.error('admin-security error:', e);
    return json({ error: 'Request could not be completed.' }, 500);
  }
});