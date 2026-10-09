export class RegistrationAccountBoundaryError extends Error {}
type AccountResource = {
  account: { id: string; organizationId: string; accountSid: string; status: string };
  service: { id: string; organizationId: string; twilioAccountId: string; serviceSid: string; status: string };
};
/** Interim guard for the current one-profile-per-organization schema. */
export function registrationAccountResources<T extends AccountResource>(organizationId: string, rows: T[]): T[] {
  if (!rows.length) throw new RegistrationAccountBoundaryError('Provision a studio sender before carrier registration.');
  for (const row of rows) {
    if (row.account.organizationId !== organizationId || row.service.organizationId !== organizationId ||
        row.service.twilioAccountId !== row.account.id || row.account.status !== 'ACTIVE' || row.service.status !== 'ACTIVE' ||
        !/^AC[0-9a-f]{32}$/i.test(row.account.accountSid) || !/^MG[0-9a-f]{32}$/i.test(row.service.serviceSid)) {
      throw new RegistrationAccountBoundaryError('Registration resource ownership is not verified. Review the legal customer and owning account before proceeding.');
    }
  }
  if (new Set(rows.map(row => row.account.id)).size !== 1 || new Set(rows.map(row => row.account.accountSid)).size !== 1) {
    throw new RegistrationAccountBoundaryError('This studio has services under multiple Twilio accounts. Explicit legal-customer mapping is required; existing registrations will not be transferred automatically.');
  }
  return [...rows].sort((a, b) => a.service.id.localeCompare(b.service.id));
}
