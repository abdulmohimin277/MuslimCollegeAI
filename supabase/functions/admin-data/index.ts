// ============================================================
// EDGE FUNCTION — admin-data  (export / backup / restore)
// ------------------------------------------------------------
//   POST { op: 'export' }              → full JSON backup
//   POST { op: 'restore', data }       → restore a validated backup
//
// Admin JWT required. Restore runs inside a single SQL transaction
// via the protected `mc_restore_data` function (revoked from anon/
// authenticated — service role only). This keeps export/restore a
// single atomic operation and never exposes table write access to
// the REST layer.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

const TABLES = [
  'class_types', 'classes', 'class_subjects',
  'students', 'marks', 'announcements', 'announcement_files',
];

async function exportAll(supabase: ReturnType<typeof adminClient>) {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const { data } = await supabase.from(t).select('*');
    out[t] = data || [];
  }
  return { exported_at: new Date().toISOString(), version: '1.0', tables: out };
}

function validateRestoreShape(data: unknown): data is { tables: Record<string, unknown[]> } {
  if (!data || typeof data !== 'object') return false;
  const d = data as { tables?: unknown };
  if (!d.tables || typeof d.tables !== 'object') return false;
  const keys = Object.keys(d.tables as Record<string, unknown>);
  if (!keys.length) return false;
  // Every value must be a plain array (rows).
  for (const k of keys) {
    const v = (d.tables as Record<string, unknown>)[k];
    if (!Array.isArray(v)) return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = await requireAdmin(req);
    if (!admin) return json({ error: 'Admin session required.' }, 401);
    const supabase = adminClient();
    const body = await req.json();
    const op = String(body.op || '');

    if (op === 'export') {
      const data = await exportAll(supabase);
      await audit(supabase, {
        action: 'DATA_EXPORTED', entity: 'system', admin: String(admin.username || ''),
        details: 'Full data export downloaded', success: true,
      });
      return json({ ok: true, data });
    }

    if (op === 'restore') {
      if (!validateRestoreShape(body.data)) {
        return json({ error: 'Backup file is not in the expected format.' }, 400);
      }
      // Strip system/audit metadata so we restore content only.
      const payload = (body.data as { tables: Record<string, unknown[]> }).tables;
      const pending = { ...payload };
      const keep = TABLES.filter((t) => Array.isArray(pending[t]));
      const clean: Record<string, unknown[]> = {};
      keep.forEach((t) => (clean[t] = pending[t]));

      const { error } = await supabase.rpc('mc_restore_data', { data: clean });
      if (error) throw error;

      await audit(supabase, {
        action: 'DATA_RESTORED', entity: 'system', admin: String(admin.username || ''),
        details: 'Full data restore from backup (' + keep.length + ' tables)', success: true,
      });
      return json({ ok: true, restored_tables: keep });
    }

    return json({ error: 'Unknown operation.' }, 400);
  } catch (e) {
    console.error('admin-data error:', e);
    return json({ error: 'Request could not be completed.' }, 500);
  }
});