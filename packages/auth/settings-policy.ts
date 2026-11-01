// Shared studio configuration is editable by staff. Financial accounts and
// invitations deliberately retain their separate owner-only authorization.
export function canManageStudioSettings(role:string){return role==='OWNER'||role==='ARTIST';}
const sharedSettingsPaths=new Set([
 '/api/services','/api/services/import','/api/services/square','/api/services/square/connect','/api/items','/api/waiver-integrations','/api/channels','/api/channels/meta-candidates','/api/integrations/meta/connect','/api/integrations/meta/callback','/api/integrations/square/callback',
 '/api/studio/config','/api/studio/locations','/api/studio/knowledge','/api/studio/artists',
 '/api/ai/settings','/api/automations/settings','/api/consent-forms','/api/scheduling',
 '/api/scheduling/square/connect','/api/scheduling/square/catalog','/api/scheduling/square/import',
 '/api/integrations/status','/api/integrations/google/connect','/api/integrations/google/callback',
 '/api/onboarding','/api/onboarding/readiness','/api/onboarding/test-session',
 '/api/compliance/status','/api/compliance/setup','/api/compliance/publish','/api/compliance/documents',
 '/api/compliance/legal-customer','/api/compliance/legal-customer/account','/api/compliance/legal-customer/setup',
 '/api/compliance/registration','/api/compliance/registration/status','/api/compliance/registration/adopt',
 '/api/twilio/status','/api/twilio/provision','/api/twilio/provision/review','/api/twilio/provision/recovery',
 '/api/twilio/port','/api/twilio/port/status','/api/twilio/portability',
]);
export function sharedStudioSettingsPath(path:string){return sharedSettingsPaths.has(path)||/^\/api\/services\/[a-f0-9-]{36}$/i.test(path);}
export function ownerSettingsPage(path:string){return path==='/settings/team'||path==='/banking'||path==='/settings/payments'||path.startsWith('/settings/payments/');}
