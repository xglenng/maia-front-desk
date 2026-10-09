// Loaded before Next and inherited by its Node child processes. This is a
// development containment layer, not an operating-system security sandbox.
const net = require('node:net');
const {syncBuiltinESMExports} = require('node:module');
const {HOST, PORT} = require('./staging-config.cjs');
function allowedSocket(host, port) {
  return (host === HOST && String(port) === PORT) ||
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
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) {
    throw new Error('Staging blocked outbound provider HTTP request.');
  }
  return originalFetch.call(this,input,...args);
};
syncBuiltinESMExports();
module.exports = {allowedSocket};
