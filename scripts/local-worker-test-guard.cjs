// Only for the opt-in server-side worker test outside Next's module compiler.
const Module = require('node:module');
const net = require('node:net');
const { syncBuiltinESMExports } = Module;
const socket = process.env.MAIA_WORKER_TEST_SOCKET;
if (!/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/.test(socket || '')) throw new Error('Disposable worker socket required');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name === 'server-only') return require.resolve('next/dist/compiled/server-only/empty.js');
  return resolve.call(this, name, ...args);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  const path = typeof options === 'string' ? options : options?.path;
  if (path !== `${socket}/.s.PGSQL.55439`) throw new Error('Worker test blocked network');
  return connect.apply(this, args);
};
globalThis.fetch = async () => { throw new Error('Worker test blocked provider fetch'); };
syncBuiltinESMExports();
