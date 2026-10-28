// Render cron entry point. The secret stays in the service environment, never logs or URLs.
async function run({env=process.env,fetchImpl=fetch}={}) {
  if(!env.AUTOMATION_CRON_SECRET)throw Error('AUTOMATION_CRON_SECRET is required');
  const response=await fetchImpl('https://maia-production-preview.onrender.com/api/automations/run',{
    method:'POST',headers:{authorization:`Bearer ${env.AUTOMATION_CRON_SECRET}`},signal:AbortSignal.timeout(240000),redirect:'error',
  });
  if(!response.ok)throw Error(`Automation endpoint returned HTTP ${response.status}`);
  const result=await response.json();
  if(!Number.isInteger(result.processed)||!Array.isArray(result.results))throw Error('Invalid automation response');
  const statuses={};
  for(const item of result.results){const status=String(item.status||'UNKNOWN');statuses[status]=(statuses[status]||0)+1;}
  return {processed:result.processed,statuses};
}
module.exports={run};
if(require.main===module)run().then(result=>console.log(JSON.stringify(result))).catch(error=>{
  // Never print request headers, provider payloads, or client details.
  console.error(error.message?.startsWith('Automation endpoint returned HTTP')?error.message:'Automation runner failed; inspect Maia automation status.');
  process.exitCode=1;
});
