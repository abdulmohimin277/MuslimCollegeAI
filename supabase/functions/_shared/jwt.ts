// ============================================================
// SHARED — JWT helpers + session verification
// ------------------------------------------------------------
// We sign our OWN admin/student JWTs with HS256 using the same
// secret as the Supabase project (Project Settings → API →
// JWT Secret). That way Row-Level Security's auth.jwt() decodes
// our tokens and the RLS functions in policies.sql work.
//
// Set the secret BEFORE deploying:
//   supabase secrets set MC_JWT_SECRET "<your project JWT secret>"
// ============================================================
import { create, verify, getNumericDate } from 'https://deno.land/x/djwt@v2.8/mod.ts';

export function jwtSecret(): string {
  const s = Deno.env.get('MC_JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET');
  if (!s) throw new Error('MC_JWT_SECRET is not set on the server.');
  return s;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Signs a custom token with a given role+subject claim. */
export async function signSession(payload: Record<string, unknown>, hours: number): Promise<string> {
  return create(
    { alg: 'HS256', typ: 'JWT' },
    { ...payload, iat: getNumericDate(0), exp: getNumericDate(hours * 3600) },
    jwtSecret()
  );
}

/** Verifies a bearer token and returns its payload, or null. */
export async function verifySession(token: string | null): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const payload = await verify(token, jwtSecret());
    return (payload && typeof payload === 'object') ? payload as Record<string, unknown> : null;
  } catch (e) {
    return null;
  }
}

/** Verifies the caller is an admin (role claim). */
export async function requireAdmin(req: Request): Promise<Record<string, unknown> | null> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = await verifySession(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}