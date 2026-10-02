export const squareReadScopes = [
  'APPOINTMENTS_READ',
  'APPOINTMENTS_ALL_READ',
  'APPOINTMENTS_BUSINESS_SETTINGS_READ',
  'APPOINTMENTS_WRITE',
  'CUSTOMERS_READ',
  'CUSTOMERS_WRITE',
  'ORDERS_WRITE',
  'MERCHANT_PROFILE_READ',
  'ITEMS_READ',
  'EMPLOYEES_READ',
] as const;


export const squareBookingWriteScopes = [
  'APPOINTMENTS_WRITE',
  'CUSTOMERS_WRITE',
] as const;

export function squareEnvironment() {
  const value = (process.env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase();
  if (value !== 'sandbox' && value !== 'production') throw new Error('SQUARE_ENVIRONMENT must be sandbox or production.');
  return value;
}

export function squareBaseUrl() {
  return squareEnvironment() === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

export function squareOAuthSession() {
  return squareEnvironment() === 'production' ? 'false' : undefined;
}

export function squareRedirectUri(origin: string) {
  return process.env.SQUARE_REDIRECT_URI || `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '')}/api/integrations/square/callback`;
}

export function squareApiVersion() {
  return process.env.SQUARE_API_VERSION || '2026-09-16';
}