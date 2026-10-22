import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/packages/auth/server';
import { completePasswordReset, requestPasswordReset } from '@/packages/auth/password-reset';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    const body = await request.json();
    if (body?.action === 'request') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      await requestPasswordReset(email);
      return NextResponse.json({ message: 'If an active account matches that email, you will receive a reset link.' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body?.action === 'complete') {
      if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token) || typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) {
        return NextResponse.json({ error: 'Use a valid reset link and a password of 10–128 characters.' }, { status: 400 });
      }
      if (!await completePasswordReset(body.token, body.password)) return NextResponse.json({ error: 'This link is invalid or expired. Request a new reset link.' }, { status: 400 });
      return NextResponse.json({ message: 'Password changed. Sign in with your new password.' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Password reset is temporarily unavailable. Please try again later.' }, { status: 503 });
  }
}
