// ============================================================
// EDGE FUNCTION — upload
// ------------------------------------------------------------
// Handles announcement file attachments. Admin JWT required.
//
//   POST { op?: 'upload', announcement_id?, name, mime, size, base64 }
//   POST { op: 'delete', file_id }
//
// SECURITY (all enforced server-side, never trusted from client):
//   • Max 8 MB per file (actual decoded byte length is checked).
//   • MIME allowlist: images (jpeg/png/webp/gif), documents
//     (pdf/office/txt), videos (mp4/webm). Executables rejected.
//   • Magic-byte (signature) validation — a spoofed extension or
//     MIME is rejected even if the payload is a valid script.
//   • Randomized storage path — the client cannot choose paths
//     (no traversal / overwrite attacks).
//   • The stored row references the object; deleting a file removes
//     both the object and the row.
// ============================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/jwt.ts';
import { audit, adminClient } from '../_shared/audit.ts';

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED: Record<string, { kind: string; ext: string; sig: (b: Uint8Array) => boolean }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg', sig: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { kind: 'image', ext: 'png', sig: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': {
    kind: 'image', ext: 'webp',
    sig: (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  'image/gif': { kind: 'image', ext: 'gif', sig: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  'application/pdf': { kind: 'document', ext: 'pdf', sig: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  'application/msword': { kind: 'document', ext: 'doc', sig: isZip },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'document', ext: 'docx', sig: isZip },
  'application/vnd.ms-excel': { kind: 'document', ext: 'xls', sig: isZip },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'document', ext: 'xlsx', sig: isZip },
  'application/vnd.ms-powerpoint': { kind: 'document', ext: 'ppt', sig: isZip },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'document', ext: 'pptx', sig: isZip },
  'text/plain': { kind: 'document', ext: 'txt', sig: isPlainText },
  'video/mp4': {
    kind: 'video', ext: 'mp4',
    sig: (b) => b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
  'video/webm': { kind: 'video', ext: 'webm', sig: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
};

function isZip(b: Uint8Array): boolean {
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
}
function isPlainText(b: Uint8Array): boolean {
  // Reject binaries / NUL bytes for .txt safety.
  const n = Math.min(b.length, 512);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sanitizeName(name: string): string {
  return String(name || 'file')
    .replace(/[\/\\\0<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = await requireAdmin(req);
    if (!admin) return json({ error: 'Admin session required.' }, 401);

    const supabase = adminClient();
    const body = await req.json();
    const op = String(body.op || 'upload');

    /* ---------------- delete ---------------- */
    if (op === 'delete') {
      const fileId = String(body.file_id || '');
      if (!fileId) return json({ error: 'file_id is required.' }, 400);
      const { data: row } = await supabase
        .from('announcement_files')
        .select('*')
        .eq('id', fileId)
        .maybeSingle();
      if (!row) return json({ error: 'File not found.' }, 404);
      if (row.storage_path) {
        await supabase.storage.from('announcements').remove([row.storage_path]);
      }
      await supabase.from('announcement_files').delete().eq('id', fileId);
      await audit(supabase, {
        action: 'FILE_DELETED', entity: 'announcement_file', entityId: fileId, admin: String(admin.username || ''),
        details: 'Deleted announcement file "' + row.name + '"', success: true,
      });
      return json({ ok: true });
    }

    if (op !== 'upload') return json({ error: 'Unknown operation.' }, 400);

    /* ---------------- upload ---------------- */
    const name = sanitizeName(String(body.name || ''));
    const mime = String(body.mime || '').toLowerCase();
    const declaredSize = Number(body.size || 0);
    const bytes = base64ToBytes(String(body.base64 || ''));

    if (!ALLOWED[mime]) {
      return json({ error: 'File type not allowed. Use images (jpg/png/webp/gif), documents (pdf/office/txt) or videos (mp4/webm).' }, 400);
    }
    if (bytes.length === 0) return json({ error: 'Empty file.' }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: 'File is larger than the 8 MB limit.' }, 400);
    if (declaredSize > 0 && Math.abs(declaredSize - bytes.length) > 1024) {
      // Client and actual sizes disagree wildly — bad data.
      return json({ error: 'File size mismatch.' }, 400);
    }
    const rule = ALLOWED[mime];
    if (!rule.sig(bytes)) {
      return json({ error: 'File contents do not match its declared type.' }, 400);
    }
    // Extension safety: only accept known-bad patterns explicitly blocked.
    const lower = name.toLowerCase();
    if (/\.(exe|bat|cmd|com|msi|ps1|vbs|js|sh|scr|dll|apk|jar|html?|php|py|so|dylib)$/.test(lower)) {
      return json({ error: 'That file type is not allowed.' }, 400);
    }

    const path = 'announcements/' + crypto.randomUUID() + '.' + rule.ext;
    const { error: upErr } = await supabase.storage
      .from('announcements')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const { data: row, error: insErr } = await supabase
      .from('announcement_files')
      .insert({
        announcement_id: body.announcement_id ? String(body.announcement_id) : null,
        kind: rule.kind,
        name,
        mime,
        size: bytes.length,
        storage_path: path,
      })
      .select()
      .single();
    if (insErr) {
      await supabase.storage.from('announcements').remove([path]);
      throw insErr;
    }

    await audit(supabase, {
      action: 'FILE_UPLOADED', entity: 'announcement_file', entityId: row.id, admin: String(admin.username || ''),
      details: 'Uploaded "' + name + '" (' + rule.kind + ')', success: true,
    });
    return json({ ok: true, file: row });
  } catch (e) {
    console.error('upload error:', e);
    return json({ error: 'Upload could not be completed.' }, 500);
  }
});