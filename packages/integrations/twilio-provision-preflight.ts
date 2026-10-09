import { assertPublicHttpsUrl } from '@/packages/consent';
import { decryptSecret, encryptSecret } from './twilio';

export class TwilioProvisionConfigurationError extends Error {}

type ExistingResources = {
  account?: { id: string; accountSid: string; authTokenEncrypted: string; status: string };
  service?: { twilioAccountId: string; serviceSid: string; status: string };
  number?: { twilioAccountId: string | null; twilioPhoneNumberSid: string | null; twilioMessagingServiceSid: string | null };
};
/** Local-only validation. No inventory calls or provider mutations. */
export function twilioProvisionPreflight(existing: ExistingResources) {
  try {
    const rawBase = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!rawBase) throw new Error('Webhook URL missing');
    const base = new URL(assertPublicHttpsUrl(rawBase, 'Twilio webhook URL'));
    if (base.search || base.hash || base.pathname !== '/' || (base.port && base.port !== '443')) throw new Error('Webhook base must be an HTTPS origin');
    // Ensure encryption works before creating a resource whose token must be stored.
    decryptSecret(encryptSecret('provisioning-preflight'));
    const account = existing.account;
    if (account) {
      if (!/^AC[0-9a-f]{32}$/i.test(account.accountSid) || account.status !== 'ACTIVE' || !decryptSecret(account.authTokenEncrypted).trim()) throw new Error('Existing account is not live-ready');
    } else if (!/^AC[0-9a-f]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || '') || !process.env.TWILIO_AUTH_TOKEN?.trim()) {
      throw new Error('Parent credentials missing');
    }
    if (existing.service && (!account || existing.service.twilioAccountId !== account.id || !/^MG[0-9a-f]{32}$/i.test(existing.service.serviceSid) || existing.service.status !== 'ACTIVE')) throw new Error('Existing service is not live-ready');
    if (existing.number && (!account || existing.number.twilioAccountId !== account.id || !/^PN[0-9a-f]{32}$/i.test(existing.number.twilioPhoneNumberSid || '') ||
        (existing.service && existing.number.twilioMessagingServiceSid && existing.number.twilioMessagingServiceSid !== existing.service.serviceSid))) throw new Error('Existing number is not live-ready');
    return { inboundUrl: new URL('/api/twilio/inbound', base).toString() };
  } catch {
    throw new TwilioProvisionConfigurationError('Live Twilio setup is incomplete or contains incompatible resources. Verify public HTTPS webhook origin, encryption, credentials, and account/service/number ownership before provisioning.');
  }
}
