export class AdoptionConflict extends Error {}

type Scope = { organizationId: string; artistId: string; twilioAccountId: string };
export function assertAdoptionOwnership(scope: Scope, resource: {
  organizationId: string; artistId: string; twilioAccountId: string | null;
}) {
  if (resource.organizationId !== scope.organizationId || resource.artistId !== scope.artistId ||
      (resource.twilioAccountId !== null && resource.twilioAccountId !== scope.twilioAccountId)) {
    throw new AdoptionConflict('This Twilio resource is already assigned to a different organization, artist, or account.');
  }
}

export function selectPrimarySender(senders: Array<{phoneNumber:string;isPrimary:boolean}>) {
  if (!senders.length) throw new AdoptionConflict('The Messaging Service has no valid senders.');
  // Preserve an existing primary when possible; deterministic even for legacy
  // multiple-primary data or different provider response ordering.
  const ordered=[...senders].sort((a,b)=>a.phoneNumber.localeCompare(b.phoneNumber));
  return (ordered.find(sender=>sender.isPrimary) || ordered[0]).phoneNumber;
}
