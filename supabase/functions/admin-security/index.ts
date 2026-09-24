// ============================================================
// EDGE FUNCTION — admin-security
// ------------------------------------------------------------
// Changeable-administrator credential management.
//
//   POST { op: 'change_credentials',
//          current_password, new_username, new_password }
//
// Rules enforced server-side:
//   • Caller must hold a VALID admin JWT (role='admin').
//   • The MASTER account can NEVER be changed through the panel —
//     only via protected server configuration (secrets → setup).
//   • The current password must be verified (bcrypt via pgcrypto).
//   • New password is hashed server-side; raw passwords never
//     appear in logs or API responses.
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
      const currentPassword = String(body.current_password || '');
      const newUsername = String(body.new_username || '').trim().slice(0, 60);
      const newPassword = String(body.new_password || '');

      if (!currentPassword) return json({ error: 'Current password is required.' }, 400);
      if (newUsername && newUsername.length < 3) return json({ error: 'New username must be at least 3 characters.' }, 400);
      if (newPassword && newPassword.length < 4) return json({ error: 'New password must be at least 4 characters.' }, 400);
      if (!newUsername && !newPassword) return json({ error: 'Enter a new username and/or password.' }, 400);

      const { data: me } = await supabase
        .from('admins')
        .select('id, username, password_hash, is_master')
        .eq('id', admin.sub)
        .maybeSingle();
      if (!me) return json({ error: 'Administrator record not found.' }, 404);
      if (me.is_master) {
        await audit(supabase, {
          action: 'ADMIN_CHANGE_DENIED', entity: 'admin', entityId: me.id, admin: me.username,
          details: 'Attempt to change MASTER credentials via panel (blocked)', success: false,
        });
        return json({ error: 'The master administrator account cannot be changed from the panel.' }, 403);
      }

      // Verify current password (constant-time bcrypt check server-side).
      const { data: matches } = await supabase.rpc('mc_verify_password', {
        password: currentPassword,
        hash: me.password_hash,
      });
      if (matches !== true) {
        await audit(supabase, {
          action: 'ADMIN_CHANGE_FAILED', entity: 'admin', entityId: me.id, admin: me.username,
          details: 'Credential change failed: wrong current password', success: false,
        });
        return json({ error: 'Current password is incorrect.' }, 401);
      }

      // Username uniqueness (case-insensitive) among all admins — only
      // when a new username was provided.
      const finalUsername = newUsername || me.username;
      const { data: clash } = await supabase
        .from('admins')
        .select('id, username')
        .ilike('username', finalUsername)
        .limit(5);
      const taken = (clash || []).some((a) => a.username.toLowerCase() === finalUsername.toLowerCase() && a.id !== me.id);
      if (taken) return json({ error: 'That username is already in use.' }, 409);

      // Hash only when a NEW password was actually provided — otherwise
      // the current hash is kept unchanged.
      let hash = me.password_hash;
      if (newPassword) {
        const { data: newHash } = await supabase.rpc('mc_hash_password', { password: newPassword });
        if (!newHash) return json({ error: 'Could not secure the new password.' }, 500);
        hash = newHash;
      }

      const { error } = await supabase
        .from('admins')
        .update({ username: finalUsername, password_hash: hash })
        .eq('id', me.id);
      if (error) throw error;

      await audit(supabase, {
        action: 'ADMIN_CREDENTIALS_CHANGED', entity: 'admin', entityId: me.id, admin: finalUsername,
        details: 'Changeable admin credentials updated', success: true,
      });
      return json({ ok: true, username: finalUsername });
    }

    return json({ error: 'Unknown operation.' }, 400);
  } catch (e) {
    console.error('admin-security error:', e);
    return json({ error: 'Request could not be completed.' }, 500);
  }
});