export type SquareOAuthState = { organizationId: string; artistId: string };
type CallbackResult =
  | { kind: 'INVALID_STATE' }
  | { kind: 'DENIED' }
  | { kind: 'AUTHORIZED'; state: SquareOAuthState };

export async function resolveSquareOAuthCallbackState(
  rawState: string | null,
  userId: string,
  organizationId: string,
  providerError: string | null,
  consume: (state: string, userId: string, organizationId: string) => Promise<SquareOAuthState | null>,
): Promise<CallbackResult> {
  if (!rawState || !/^[a-f0-9]{64}$/.test(rawState)) return { kind: 'INVALID_STATE' };
  const state = await consume(rawState, userId, organizationId);
  if (!state) return { kind: 'INVALID_STATE' };
  if (providerError !== null) return { kind: 'DENIED' };
  return { kind: 'AUTHORIZED', state };
}