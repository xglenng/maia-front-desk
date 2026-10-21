// Loaded before Next and inherited by its Node child processes. This is a
// development containment layer, not an operating-system security sandbox.
const net = require('node:net');
const {syncBuiltinESMExports} = require('node:module');
const {HOST, PORT} = require('./staging-config.cjs');
function allowedSocket(host, port) {
  return (host === HOST && String(port) === PORT) ||
    (process.env.MAIA_STAGING_SQUARE_SANDBOX === '1' && host === 'connect.squareupsandbox.com' && String(port) === '443') ||
    (process.env.MAIA_STAGING_STRIPE_SANDBOX === '1' && /^sk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY||'') && host === 'api.stripe.com' && String(port) === '443') ||
    ['127.0.0.1', '::1', 'localhost'].includes(host);
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  const options = typeof first === 'object' ? first : {port:first,host:typeof args[1] === 'string' ? args[1] : 'localhost'};
  const host = options.host || options.hostname || 'localhost';
  if (options.path || !allowedSocket(host,options.port)) throw new Error('Staging blocked outbound socket.');
  return originalConnect.apply(this,args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, ...args) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const stripeSandbox=process.env.MAIA_STAGING_STRIPE_SANDBOX==='1' && /^sk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY||'') && url.protocol==='https:' && url.hostname==='api.stripe.com' && (!url.port||url.port==='443') && !url.username && !url.password;
  const sandbox = stripeSandbox || process.env.MAIA_STAGING_SQUARE_SANDBOX === '1' && url.protocol === 'https:' && url.hostname === 'connect.squareupsandbox.com' && (!url.port || url.port === '443') && !url.username && !url.password;
  if (!sandbox && (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname))) {
    throw new Error('Staging blocked outbound provider HTTP request.');
  }
  return originalFetch.call(this,input,...(sandbox ? [{...args[0],redirect:'error'}] : args));
};
syncBuiltinESMExports();
module.exports = {allowedSocket};
