// ============================================================
// EDGE FUNCTION — deploy-webhook
// ------------------------------------------------------------
// Receives status callbacks from the GitHub Actions workflow
// (.github/workflows/deploy.yml) after an "Update Website" run.
//
// AUTH: header `x-deploy-secret` must equal DEPLOY_WEBHOOK_SECRET.
// The workflow reads that secret from GitHub repository secrets, so
// nobody else can forge deployment status updates.
//
// The workflow sends:
//   { deployment_id, status: 'success'|'failed',
//     build_status?, deploy_status?, error?, commit_ref? }
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { audit, adminClient } from '../_shared/audit.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const secret = Deno.env.get('DEPLOY_WEBHOOK_SECRET');
    const given = req.headers.get('x-deploy-secret') || '';
    if (!secret || given !== secret) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    const supabase = adminClient();
    const body = await req.json();
    const deploymentId = String(body.deployment_id || '');
    if (!deploymentId) return json({ error: 'deployment_id is required.' }, 400);

    const status = body.status === 'failed' ? 'failed' : 'success';
    const patch: Record<string, unknown> = {
      status,
      build_status: String(body.build_status || (status === 'success' ? 'success' : 'failed')),
      deploy_status: String(body.deploy_status || (status === 'success' ? 'success' : 'failed')),
      finished_at: new Date().toISOString(),
    };
    if (body.commit_ref) patch.commit_ref = String(body.commit_ref).slice(0, 60);
    if (body.error) patch.error = String(body.error).slice(0, 300);

    await supabase.from('deployments').update(patch).eq('id', deploymentId);

    // Reflect in public site meta.
    const { data: meta } = await supabase.from('site_meta').select('value').eq('key', 'site').maybeSingle();
    const value = (meta && meta.value && typeof meta.value === 'object') ? meta.value : {};
    await supabase.from('site_meta').upsert({
      key: 'site',
      value: {
        ...value,
        version: value.version || '4.0',
        lastUpdate: new Date().toISOString(),
        lastStatus: status === 'success' ? 'success' : 'failed',
        lastDeployAt: new Date().toISOString(),
        lastDeployStatus: status,
      },
    }, { onConflict: 'key' });

    await audit(supabase, {
      action: 'DEPLOYMENT_FINISHED', entity: 'deployment', entityId: deploymentId, admin: 'github-actions',
      details: 'Deployment finished with status ' + status, success: status === 'success',
    });

    return json({ ok: true });
  } catch (e) {
    console.error('deploy-webhook error:', e);
    return json({ error: 'Webhook could not be processed.' }, 500);
  }
});