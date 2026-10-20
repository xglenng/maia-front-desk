// Next normally aliases this compile-time marker. Only the isolated server test
// needs the same alias outside Next; the staging network guard remains active.
if(process.env.MAIA_STAGING_ISOLATED !== '1')throw new Error('Isolated staging required');
const Module=require('node:module');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){
  if(name==='server-only')return require.resolve('next/dist/compiled/server-only/empty.js');
  return resolve.call(this,name,...args);
};
