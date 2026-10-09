// Generate current schema without loading database/provider configuration.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'maia-schema-generate-'));
const result=spawnSync(process.execPath,[path.join(root,'node_modules/drizzle-kit/bin.cjs'),'generate','--dialect','postgresql','--schema','./packages/db/src/schema.ts','--out',output],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8'});
if(result.status!==0)throw new Error('Staging schema generation failed.');
const file=fs.readdirSync(output).find(name=>name.endsWith('.sql'));
const parts=fs.readFileSync(path.join(output,file),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
// Drizzle emits FKs before indexes, but composite foreign keys require the
// referenced unique indexes to exist. All tables, then indexes, then FKs.
const tables=parts.filter(s=>s.startsWith('CREATE TABLE'));
const indexes=parts.filter(s=>/^CREATE (UNIQUE )?INDEX/.test(s));
const rest=parts.filter(s=>!tables.includes(s)&&!indexes.includes(s));
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'packages/db/src/schema.ts'))).digest('hex');
fs.writeFileSync(path.join(root,'packages/db/staging/schema.sql'),'-- Synthetic staging bootstrap only; not a production migration.\n-- schema-source-sha256: '+hash+'\n'+[...tables,...indexes,...rest].join('\n--> statement-breakpoint\n')+'\n');
console.log('Generated staging-only schema snapshot; review and test before initialization. No database connection.');
