import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/packages/db/src';
import { cookieName, identity, sameOrigin } from '@/packages/auth/server';
import { digest, hashPassword, token } from '@/packages/auth/crypto';
import { acceptStaffInviteSchema } from '@/packages/auth/staff-invitations';
import { isSignupRateLimited } from '@/packages/auth/signup-rate-limit';

const invalid = () => NextResponse.json({ error: 'Invitation is invalid, expired, or no longer available. Ask your studio owner for a new link.' }, { status: 400 });
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let tx;
  try {
    if (await identity(request)) return NextResponse.json({ error: 'Sign out before accepting a staff invitation.' }, { status: 409 });
    if (await isSignupRateLimited(request, 'staff-invite')) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    const parsed = acceptStaffInviteSchema.safeParse(await request.json());
    if (!parsed.success) return invalid();
    const input = parsed.data;
    const hashedToken = digest(input.token);
    // Lookup reveals nothing to the caller; lock order matches owner reissue/revoke.
    const candidate = (await pool.query('SELECT artist_id,organization_id FROM staff_invitations WHERE token_hash=$1', [hashedToken])).rows[0];
    if (!candidate) return invalid();
    tx = await pool.connect();
    await tx.query('BEGIN');
    const artist = (await tx.query('SELECT id,user_id,display_name FROM artists WHERE id=$1 AND organization_id=$2 FOR UPDATE', [candidate.artist_id,candidate.organization_id])).rows[0];
    const invitation = (await tx.query(`SELECT id FROM staff_invitations WHERE token_hash=$1 AND organization_id=$2 AND artist_id=$3
      AND email=$4 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE`, [hashedToken,candidate.organization_id,candidate.artist_id,input.email])).rows[0];
    if (!artist || artist.user_id || !invitation) { await tx.query('ROLLBACK'); return invalid(); }
    // Same lock key as signup so concurrent account creation cannot claim this email twice.
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`signup-email:${input.email}`]);
    if ((await tx.query('SELECT id FROM users WHERE lower(btrim(email))=$1', [input.email])).rowCount) { await tx.query('ROLLBACK'); return invalid(); }
    const user = (await tx.query("INSERT INTO users(organization_id,email,name,role) VALUES($1,$2,$3,'ARTIST') RETURNING id", [candidate.organization_id,input.email,artist.display_name])).rows[0];
    await tx.query('INSERT INTO auth_credentials(user_id,password_hash,active) VALUES($1,$2,true)', [user.id,hashPassword(input.password)]);
    await tx.query('UPDATE artists SET user_id=$1 WHERE id=$2 AND organization_id=$3', [user.id,artist.id,candidate.organization_id]);
    await tx.query('UPDATE staff_invitations SET accepted_at=now() WHERE id=$1', [invitation.id]);
    await tx.query('UPDATE staff_invitations SET revoked_at=now() WHERE artist_id=$1 AND organization_id=$2 AND id<>$3 AND accepted_at IS NULL AND revoked_at IS NULL', [artist.id,candidate.organization_id,invitation.id]);
    const rawSession = token();
    await tx.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [digest(rawSession),user.id]);
    await tx.query('COMMIT');
    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(cookieName, rawSession, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 604800 });
    return response;
  } catch (error) {
    if (tx) await tx.query('ROLLBACK');
    return NextResponse.json({ error: 'Unable to accept invitation.' }, { status: error instanceof SyntaxError ? 400 : 500 });
  } finally { tx?.release(); }
}
