const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {stagingConfig} = require('./staging-config.cjs');
const root = path.resolve(__dirname,'..');
try {
  const config = stagingConfig(fs.readFileSync(path.join(root,'.env.staging.local'),'utf8'));
  if (process.argv[2] === 'check') {
    console.log('PASS: clean staging endpoint validated. No network connection made.');
    process.exit(0);
  }
  if(['artist-check','consent-check'].includes(process.argv[2])) {
    const child=spawn(process.execPath,['--import','tsx',path.join(root,process.argv[2]==='artist-check'?'scripts/staging-artist-check.ts':'scripts/staging-consent-check.ts')],{cwd:root,stdio:'inherit',env:{PATH:process.env.PATH,...config,NODE_OPTIONS:`--require ${JSON.stringify(path.join(root,'scripts/staging-network-guard.cjs'))}`}});
    child.on('exit',code=>{process.exitCode=code||0;});
    child.on('error',()=>{console.error('Unable to run staging authorization checks.');process.exitCode=1;});
    return;
  }
  if (process.argv[2] !== 'dev') throw new Error('Use staging:check or staging:dev.');
  // Next receives a separate project directory with no production env files or
  // old .next cache. Next route discovery requires real source directories;
  // copying also prevents development-generated files from touching the checkout.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(),'maia-staging-app-'));
  for (const entry of ['app','packages','components','public','node_modules','package.json','next-env.d.ts','middleware.ts']) {
    const source=path.join(root,entry);
    if (!fs.existsSync(source)) continue;
    const destination=path.join(workspace,entry);
    if(entry==='node_modules')fs.symlinkSync(source,destination);
    else fs.cpSync(source,destination,{recursive:true,filter:(file)=>{
      const name=path.basename(file);
      return !name.startsWith('.env') && !['.next','node_modules','.git'].includes(name);
    }});
  }
  for(const entry of fs.readdirSync(root).filter(name=>/^(next|postcss|tailwind)\.config\./.test(name)||name==='tsconfig.json')) {
    fs.copyFileSync(path.join(root,entry),path.join(workspace,entry));
  }
  const env={PATH:process.env.PATH,...config,NODE_OPTIONS:`--require ${JSON.stringify(path.join(root,'scripts/staging-network-guard.cjs'))}`};
  const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev',workspace,'--hostname','127.0.0.1','--port','3100'],{env,stdio:'inherit',cwd:workspace});
  child.on('error',()=>{console.error('Unable to start isolated staging app.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code||0;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
} catch {
  // Never serialize URL parsing errors or configuration contents.
  console.error('Staging configuration rejected. Check the clean service URL and file format; no credentials were printed.');
  process.exitCode=1;
}
