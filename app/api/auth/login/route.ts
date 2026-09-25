import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/packages/db/src';
import { cookieName, sameOrigin } from '@/packages/auth/server';
import { digest, token, verifyPassword, hashPassword } from '@/packages/auth/crypto';

const dummy = hashPassword('dummy-credential-never-used');

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const { email, password } = await req.json();

    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      typeof password !== 'string' ||
      password.length > 128
    ) {
      return NextResponse.json(
        { error: 'Invalid sign-in details' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const key = digest(normalizedEmail);

    const count = await pool.query(
      `INSERT INTO auth_login_attempts(key, attempts, reset_at)
       VALUES($1, 1, now() + interval '15 minutes')
       ON CONFLICT(key) DO UPDATE SET
         attempts = CASE
           WHEN auth_login_attempts.reset_at < now() THEN 1
           ELSE auth_login_attempts.attempts + 1
         END,
         reset_at = CASE
           WHEN auth_login_attempts.reset_at < now()
             THEN now() + interval '15 minutes'
           ELSE auth_login_attempts.reset_at
         END
       RETURNING attempts`,
      [key]
    );

    if (count.rows[0].attempts > 10) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 }
      );
    }

    const found = await pool.query(
      `SELECT u.id, c.password_hash
       FROM users u
       JOIN auth_credentials c ON c.user_id = u.id
       WHERE lower(u.email) = $1
         AND c.active = true`,
      [normalizedEmail]
    );

    // Require exactly one account for this email.
    // This prevents silently choosing the wrong studio if duplicate
    // email addresses ever exist.
    const user = found.rows.length === 1 ? found.rows[0] : null;

    const valid = verifyPassword(
      password,
      user?.password_hash || dummy
    );

    if (!valid || !user) {
      return NextResponse.json(
        { error: 'Invalid sign-in details' },
        { status: 401 }
      );
    }

    const raw = token();

    await pool.query(
      `INSERT INTO auth_sessions(token_hash, user_id, expires_at)
       VALUES($1, $2, now() + interval '7 days')`,
      [digest(raw), user.id]
    );

    await pool.query(
      'DELETE FROM auth_login_attempts WHERE key = $1',
      [key]
    );

    const response = NextResponse.json({ ok: true });

    response.cookies.set(cookieName, raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 604800
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Unable to sign in' },
      { status: 400 }
    );
  }
}