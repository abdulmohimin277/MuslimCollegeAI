// ============================================================
// EDGE FUNCTION — admin-login
// ------------------------------------------------------------
// Verifies username + password (bcrypt via pgcrypto RPC),
// enforces brute-force lockout, signs an admin JWT (role='admin')
// and writes an audit entry. Used by the Admin Dashboard lock page.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { signSession } from '../_shared/jwt.ts';

const LOCK_AFTER_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_HOURS = 8;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const username = String(body.username || '').trim().slice(0, 80);
    const password = String(body.password || '');
    if (!username || !password) {
      return json({ error: 'Enter your username and password.' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const key = 'adm:' + username.toLowerCase();

    // --- lockout guard ---
    const { data: rec } = await supabase
      .from('login_attempts')
      .select('fails, locked_until')
      .eq('key', key)
      .maybeSingle();
    if (rec?.locked_until && new Date(rec.locked_until).getTime() > Date.now()) {
      await audit(supabase, { action: 'LOGIN_LOCKED', entity: 'admin', details: 'Locked admin login attempt for username (redacted)', success: false });
      return json({ error: 'Too many failed attempts. Account locked for 15 minutes.' }, 429);
    }

    // --- find admin ---
    const { data: admin } = await supabase
      .from('admins')
      .select('id, username, password_hash, is_master')
      .eq('username', username)
      .maybeSingle();

    let ok = false;
    if (admin && admin.password_hash) {
      const { data: matches } = await supabase.rpc('mc_verify_password', {
        password,
        hash: admin.password_hash,
      });
      ok = matches === true;
    }

    const fail = async () => {
      // Re-read then upsert the attempt counter.
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
      await audit(supabase, { action: 'LOGIN_FAILED', entity: 'admin', details: 'Failed admin login attempt (username redacted)', success: false });
    };

    if (!ok) {
      await fail();
      return json({ error: 'Invalid username or password.' }, 401);
    }

    // --- success: clear attempts, sign token, audit ---
    await supabase.from('login_attempts').delete().eq('key', key);
    const access_token = await signSession(
      {
        role: 'admin',
        sub: admin.id,
        username: admin.username,
        is_master: !!admin.is_master,
      },
      SESSION_HOURS
    );
    await audit(supabase, { action: 'LOGIN_SUCCESS', entity: 'admin', entityId: admin.id, details: 'Admin logged in', success: true });

    return json({
      access_token,
      username: admin.username,
      is_master: !!admin.is_master,
    });
  } catch (e) {
    // Never leak internals.
    console.error('admin-login error:', e);
    return json({ error: 'Login could not be completed.' }, 500);
  }
});

async function audit(
  supabase: ReturnType<typeof createClient>,
  entry: { action: string; entity: string; entityId?: string | null; details: string; success: boolean }
) {
  try {
    await supabase.from('audit_logs').insert({
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId || null,
      admin_username: 'system',
      details: entry.details,
      success: entry.success,
    });
  } catch (e) {
    console.error('audit write failed:', e);
  }
}