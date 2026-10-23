import { z } from 'zod';
import { sendInvitationEmail } from '@/packages/auth/invitation-email';
import { artistColor, availableArtistColor, validArtistColor } from '@/packages/studio/artist-colors';
import { NextRequest, NextResponse } from 'next/server';
import { identity, protectedRoute } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { digest, token } from '@/packages/auth/crypto';
import { STAFF_INVITE_HOURS, staffInviteSchema } from '@/packages/auth/staff-invitations';

async function get(request: NextRequest) {
  const user = (await identity(request))!;
  const { rows } = await pool.query(`SELECT a.id,a.display_name,a.requires_supervisor_approval,a.calendar_color,
    u.email AS login_email, i.id AS invitation_id,i.email AS invitation_email,i.expires_at,
    CASE WHEN i.id IS NULL THEN NULL WHEN i.revoked_at IS NOT NULL THEN 'REVOKED' WHEN i.accepted_at IS NOT NULL THEN 'ACCEPTED'
      WHEN i.expires_at <= now() THEN 'EXPIRED' ELSE 'PENDING' END AS invitation_status
    FROM artists a LEFT JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
    LEFT JOIN LATERAL (SELECT id,email,expires_at,revoked_at,accepted_at FROM staff_invitations
      WHERE organization_id=a.organization_id AND artist_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) i ON true
    WHERE a.organization_id=$1 ORDER BY a.display_name,a.id`, [user.organization_id]);
  return NextResponse.json({ artists: rows.map(row => ({...row, calendar_color:artistColor(row.id,row.calendar_color)})) });
}
async function post(request: NextRequest) {
  const user = (await identity(request))!;
  const parsed = staffInviteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Enter a name, valid email, and Artist or Apprentice, or invite an existing profile.' }, { status: 400 });
  const { email } = parsed.data;
  let artistId = parsed.data.artistId;
  const url = new URL('/join', process.env.NEXT_PUBLIC_APP_URL || request.url);
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    // Serialize add/reissue within this studio, including duplicate submissions.
    await tx.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [user.organization_id]);
    // Do not overwrite credentials or move an existing account between studios.
    if ((await tx.query('SELECT id FROM users WHERE lower(btrim(email))=$1', [email])).rowCount) {
      await tx.query('ROLLBACK'); return NextResponse.json({ error: 'This email cannot be invited. Use a separate staff email.' }, { status: 409 });
    }
    if ((await tx.query(`SELECT id FROM staff_invitations WHERE organization_id=$1 AND email=$2
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND ($3::uuid IS NULL OR artist_id<>$3)`, [user.organization_id,email,artistId || null])).rowCount) {
      await tx.query('ROLLBACK'); return NextResponse.json({ error: 'This email already has a pending invitation. Use the existing team member below.' }, { status: 409 });
    }
    if (!artistId) {
      const input = parsed.data;
      if ((await tx.query('SELECT id FROM artists WHERE organization_id=$1 AND lower(btrim(display_name))=lower(btrim($2))', [user.organization_id,input.name])).rowCount) {
        await tx.query('ROLLBACK'); return NextResponse.json({ error: 'A profile with this name already exists. Use its Invite button below.' }, { status: 409 });
      }
      const used = await tx.query('SELECT id,calendar_color FROM artists WHERE organization_id=$1', [user.organization_id]);
      const color = availableArtistColor(used.rows.map(row => artistColor(row.id,row.calendar_color)));
      const supervised = input.memberType === 'APPRENTICE';
      artistId = (await tx.query(`INSERT INTO artists(organization_id,display_name,requires_supervisor_approval,booking_enabled,calendar_color)
        VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.organization_id,input.name,supervised,!supervised,color])).rows[0].id;
    }
    const artist = (await tx.query('SELECT id,user_id FROM artists WHERE id=$1 AND organization_id=$2 FOR UPDATE', [artistId,user.organization_id])).rows[0];
    if (!artist) { await tx.query('ROLLBACK'); return NextResponse.json({ error: 'Artist not found.' }, { status: 404 }); }
    if (artist.user_id) { await tx.query('ROLLBACK'); return NextResponse.json({ error: 'This artist already has a linked login.' }, { status: 409 }); }
    await tx.query('UPDATE staff_invitations SET revoked_at=now() WHERE artist_id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL', [artistId,user.organization_id]);
    const raw = token();
    const invite = (await tx.query(`INSERT INTO staff_invitations(organization_id,artist_id,invited_by_user_id,email,token_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+make_interval(hours => $6)) RETURNING id,expires_at`, [user.organization_id,artistId,user.id,email,digest(raw),STAFF_INVITE_HOURS])).rows[0];
    await tx.query('COMMIT');
    // Fragment keeps the invitation secret out of server request URLs/referrers.
    url.hash = raw;
    const inviteUrl = url.toString();
    const emailDelivery = await sendInvitationEmail({ email, inviteUrl, invitationId: invite.id });
    return NextResponse.json({ artistId, invitation: invite, inviteUrl, emailDelivery }, { status: 201 });
  } catch { await tx.query('ROLLBACK'); return NextResponse.json({ error: 'Unable to create invitation.' }, { status: 500 }); }
  finally { tx.release(); }
}
async function revoke(request: NextRequest) {
  const user = (await identity(request))!;
  const body = await request.json();
  const parsed = z.object({ artistId:z.string().uuid(), action:z.enum(['REVOKE','SET_COLOR']).default('REVOKE'), color:z.string().optional() }).safeParse(body);
  if (!parsed.success || (parsed.data.action === 'SET_COLOR' && !validArtistColor(parsed.data.color))) return NextResponse.json({error:'Choose a valid team color.'},{status:400});
  const { artistId, action, color } = parsed.data;
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const artist = await tx.query('SELECT id FROM artists WHERE id=$1 AND organization_id=$2 FOR UPDATE', [artistId,user.organization_id]);
    if (!artist.rowCount) { await tx.query('ROLLBACK'); return NextResponse.json({ error: 'Artist not found.' }, { status: 404 }); }
    if (action === 'SET_COLOR') await tx.query('UPDATE artists SET calendar_color=$1 WHERE id=$2 AND organization_id=$3', [color,artistId,user.organization_id]);
    else await tx.query('UPDATE staff_invitations SET revoked_at=now() WHERE artist_id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL', [artistId,user.organization_id]);
    await tx.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch { await tx.query('ROLLBACK'); return NextResponse.json({ error: 'Unable to update team member.' }, { status: 500 }); }
  finally { tx.release(); }
}
export const GET = protectedRoute(get, true);
export const POST = protectedRoute(post, true);
export const PATCH = protectedRoute(revoke, true);
