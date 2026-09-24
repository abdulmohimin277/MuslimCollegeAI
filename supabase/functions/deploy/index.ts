// ============================================================
// EDGE FUNCTION — deploy  ("UPDATE WEBSITE")
// ------------------------------------------------------------
//   POST { summary? }                    → trigger a deployment
//   POST { op: 'rollback', deployment_id } → restore a snapshot
//
// TRIGGER FLOW (real, not mocked):
//   1. Validate the admin JWT.
//   2. Record a deployment row (status='sending') with a full
//      JSONB SNAPSHOT of all content so we can roll back later.
//   3. Call GitHub `repository_dispatch` with the deployment id.
//      The PAT lives ONLY in the Supabase secret GH_PAT — it is
//      never exposed to the browser.
//   4. GitHub Actions (deploy.yml) rebuilds GitHub Pages and POSTs
//      back to the `deploy-webhook` edge function, which updates
//      status → success/failed, commit ref, timestamps + site meta.
//
// ROLLBACK: restores the content snapshot (results, subjects,
// classes, students, marks, announcements, files) for the chosen
// deployment via the protected `mc_restore_data` SQL function.
// Static shell re-deploys are recorded in deploy history; content
// itself is served from the backend, so a content rollback does
// not need a full Pages rebuild.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

const SNAPSHOT_TABLES = [
  'class_types', 'classes', 'class_subjects',
  'students', 'marks', 'announcements', 'announcement_files',
];

async function snapshotAll(supabase: ReturnType<typeof adminClient>): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of SNAPSHOT_TABLES) {
    const { data } = await supabase.from(t).select('*');
    out[t] = data || [];
  }
  return out;
}

async function dispatchGitHub(deploymentId: string, summary: Record<string, unknown>) {
  const pat = Deno.env.get('GH_PAT');
  if (!pat) throw new Error('GH_PAT is not set on the server.');
  const repo = String(Deno.env.get('GH_REPO') || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//, '');
  if (!/^[^/]+\/[^/]+$/.test(repo)) {
    throw new Error('GH_REPO is not set on the server (format owner/repository).');
  }
  const res = await fetch('https://api.github.com/repos/' + encodeURIComponent(repo) + '/dispatches', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + pat,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'muslim-college-agent',
    },
    body: JSON.stringify({
      event_type: 'mc-deploy',
      client_payload: {
        deployment_id: deploymentId,
        summary: summary || {},
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('GitHub dispatch failed (' + res.status + ')' + (text ? ': ' + text.slice(0, 200) : ''));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = await requireAdmin(req);
    if (!admin) return json({ error: 'Admin session required.' }, 401);
    const supabase = adminClient();
    const body = await req.json();
    const op = String(body.op || 'trigger');
    const who = String(admin.username || '');

    /* ---------------- rollback ---------------- */
    if (op === 'rollback') {
      const deploymentId = String(body.deployment_id || '');
      if (!deploymentId) return json({ error: 'deployment_id is required.' }, 400);
      const { data: dep } = await supabase
        .from('deployments')
        .select('*')
        .eq('id', deploymentId)
        .maybeSingle();
      if (!dep) return json({ error: 'Deployment not found.' }, 404);
      if (!dep.snapshot || typeof dep.snapshot !== 'object') {
        return json({ error: 'This deployment has no rollback snapshot.' }, 400);
      }
      const { error: rpcErr } = await supabase.rpc('mc_restore_data', { data: dep.snapshot });
      if (rpcErr) throw rpcErr;
      await audit(supabase, {
        action: 'DEPLOYMENT_ROLLED_BACK', entity: 'deployment', entityId: dep.id, admin: who,
        details: 'Restored content snapshot from deployment ' + dep.id.slice(0, 8), success: true,
      });
      return json({ ok: true, deployment: { id: dep.id, status: 'rolled_back' } });
    }

    if (op !== 'trigger') return json({ error: 'Unknown operation.' }, 400);

    /* ---------------- trigger ---------------- */
    const summary = (body.summary && typeof body.summary === 'object') ? body.summary : {};
    const snapshot = await snapshotAll(supabase);

    const { data: dep, error: insErr } = await supabase
      .from('deployments')
      .insert({
        status: 'sending',
        simulated: false,
        summary,
        triggered_by: who,
        snapshot,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    try {
      await dispatchGitHub(dep.id, summary);
      await supabase.from('deployments').update({ status: 'running' }).eq('id', dep.id);
      await audit(supabase, {
        action: 'DEPLOYMENT_TRIGGERED', entity: 'deployment', entityId: dep.id, admin: who,
        details: 'Update Website triggered (GitHub repository_dispatch)', success: true,
      });
      return json({ ok: true, deployment: { id: dep.id, status: 'running' } });
    } catch (e) {
      await supabase.from('deployments').update({
        status: 'failed',
        error: String(e && e.message ? e.message : e).slice(0, 300),
        finished_at: new Date().toISOString(),
      }).eq('id', dep.id);
      await audit(supabase, {
        action: 'DEPLOYMENT_FAILED', entity: 'deployment', entityId: dep.id, admin: who,
        details: 'Could not dispatch to GitHub: ' + String(e && e.message ? e.message : 'unknown error').slice(0, 120),
        success: false,
      });
      return json({ error: 'Dispatch failed on the server. No data was changed.' }, 502);
    }
  } catch (e) {
    console.error('deploy error:', e);
    return json({ error: 'Request could not be completed.' }, 500);
  }
});