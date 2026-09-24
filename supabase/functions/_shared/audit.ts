// ============================================================
// SHARED — audit logger for Edge Functions (best-effort writes)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function audit(
  supabase: ReturnType<typeof createClient>,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    admin?: string;
    details: string;
    success?: boolean;
  }
) {
  try {
    await supabase.from('audit_logs').insert({
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId || null,
      admin_username: entry.admin || 'system',
      details: entry.details,
      success: entry.success === undefined ? true : entry.success,
    });
  } catch (e) {
    console.error('audit write failed:', e);
  }
}

/** Builds the service-role client used by all functions. */
export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}