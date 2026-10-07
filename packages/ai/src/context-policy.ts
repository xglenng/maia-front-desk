import { z } from 'zod';
import { canAccessArtist } from '@/packages/inbox/state';

export const agentContextSelectionSchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  clientId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
});

export type AgentContextSelection = z.infer<typeof agentContextSelectionSchema>;
export type AgentPrincipal = { id: string; organization_id: string; role: string };
export type MaiaAgentContext = Readonly<{
  organizationId: string;
  artistId: string;
  clientId: string;
  conversationId: string;
  channel: string;
}>;

export function mayResolveArtistContext(input: {
  principal: AgentPrincipal;
  organizationId: string;
  artistOrganizationId: string;
  artistUserId: string | null;
}) {
  return input.principal.organization_id === input.organizationId &&
    input.artistOrganizationId === input.organizationId &&
    canAccessArtist(input.principal.role, input.principal.id, input.artistUserId);
}

export function agentContextRecordsMatch(input: {
  organizationId: string;
  artistId: string;
  clientId: string;
  artist: { id: string; organizationId: string };
  client: { id: string; organizationId: string };
  conversation: { id: string; organizationId: string; artistId: string; clientId: string };
}) {
  return input.artist.id === input.artistId && input.artist.organizationId === input.organizationId &&
    input.client.id === input.clientId && input.client.organizationId === input.organizationId &&
    input.conversation.organizationId === input.organizationId && input.conversation.artistId === input.artistId &&
    input.conversation.clientId === input.clientId;
}
