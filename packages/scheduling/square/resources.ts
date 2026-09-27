import { SquareApiClient } from './client';
import { squareAccessToken } from './credentials';
import type { schedulingConnections } from '@db/schema';

export async function squareClientForConnection(connection: typeof schedulingConnections.$inferSelect) {
  return new SquareApiClient(await squareAccessToken(connection));
}

export async function getSquareSetupResources(connection: typeof schedulingConnections.$inferSelect) {
  const client = await squareClientForConnection(connection);
  const [locations, teamMembers, services] = await Promise.all([
    client.listLocations(),
    client.searchTeamMembers(),
    client.listServiceVariations(),
  ]);
  return { locations, teamMembers, services };
}