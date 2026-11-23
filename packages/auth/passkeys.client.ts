import { browserSupportsWebAuthn } from '@simplewebauthn/browser';

export async function passkeyRequest<T>(body: object): Promise<T> {
  const response = await fetch('/api/auth/passkeys', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Passkey request failed.');
  return result as T;
}

export function requirePasskeySupport() {
  if (!browserSupportsWebAuthn()) throw new Error('Passkeys are not supported in this browser. Use a current browser or sign in with your password.');
}

export function passkeyError(error: unknown) {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (cause instanceof Error && (cause.name === 'NotAllowedError' || cause.name === 'AbortError')) {
    return 'The passkey prompt was canceled or timed out. Please try again.';
  }
  if (cause instanceof Error && cause.name === 'InvalidStateError') return 'This passkey is already registered.';
  if (error instanceof TypeError && /fetch/i.test(error.message)) return 'Unable to connect. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Passkey request failed. Please try again.';
}
