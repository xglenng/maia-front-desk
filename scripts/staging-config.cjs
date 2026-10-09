const HOST = 'switchyard.proxy.rlwy.net';
const PORT = '50219';
function stagingConfig(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (!match || values.DATABASE_URL !== undefined) throw new Error('Staging file must contain exactly one DATABASE_URL and no other variables.');
    values.DATABASE_URL = match[1].replace(/^(['"])(.*)\1$/, '$2');
  }
  let url;
  try { url = new URL(values.DATABASE_URL); } catch { throw new Error('Staging DATABASE_URL is missing or invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== HOST || url.port !== PORT ||
      !url.username || !url.password || url.pathname !== '/railway' || url.search || url.hash) {
    throw new Error('Database URL must target only the verified clean staging endpoint and railway database, without query options.');
  }
  return {DATABASE_URL: values.DATABASE_URL, MAIA_STAGING_ISOLATED: '1', AI_PROVIDER: 'mock',
    TWILIO_PROVISION_MODE: 'mock', TWILIO_PORT_MODE: 'mock', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
    NEXT_TELEMETRY_DISABLED: '1', __NEXT_PROCESSED_ENV: 'true'};
}
module.exports = {stagingConfig, HOST, PORT};
