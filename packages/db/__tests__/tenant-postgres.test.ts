import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { pool } from '@db';
import { accessibleConversation } from '../../inbox/server';

const manifest=JSON.parse(readFileSync('packages/db/tenant-relations.json','utf8')) as {
  parents: Array<{ table:string;index:string }>;
  relations: Array<{ child:string;column:string;parent:string;name:string }>;
};
const migration=readFileSync('packages/db/drizzle/0005_tenant_relationship_boundaries.sql','utf8');
const report=readFileSync('packages/db/tenant-integrity.sql','utf8');
const socket=process.env.MAIA_TENANT_TEST_SOCKET;

test('tenant migration and schema snapshot cover the recorded relationship boundaries',()=>{
  const snapshot=readFileSync('packages/db/staging/schema.sql','utf8');
  assert.equal(manifest.relations.length,65);assert.equal(manifest.parents.length,16);
  for(const relation of manifest.relations){assert.ok(migration.includes(`ADD CONSTRAINT "${relation.name}"`));assert.ok(snapshot.includes(`ADD CONSTRAINT "${relation.name}"`));assert.ok(report.includes(relation.name));}
  assert.ok(!/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i.test(report.replace(/^--.*$/gm,'')));
});

test('real PostgreSQL refuses dirty tenant migration and rejects all 65 cross-tenant references',{skip:!socket},async t=>{
  assert.match(socket!,/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const fixture='tenant_fixture_'+randomUUID().replaceAll('-','');
  const local=new Pool({host:socket,port:55439,database:'maia_tenant_test',user:process.env.USER,max:1,options:`-c search_path=${fixture}`});
  const quote=(name:string)=>{assert.match(name,/^[a-z_][a-z0-9_]*$/);return `"${name}"`;};
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
    await local.query(`CREATE SCHEMA ${fixture}`);
    // Legacy fixture: current snapshot minus exactly this migration's additions.
    const additions=[...manifest.parents.map(p=>p.index),...manifest.relations.map(r=>r.name)];
    const baseline=readFileSync('packages/db/staging/schema.sql','utf8').split('--> statement-breakpoint')
      .filter(part=>!additions.some(name=>part.includes(`"${name}"`)) && !part.includes('"legal_customers"') && !part.includes('"legal_customer_accounts"') && !part.includes('"twilio_provision_operations"') && !part.includes('"twilio_account_creation_intents"')).join(';\n').replaceAll('"public".',`"${fixture}".`);
    await local.query(baseline);
    const orgA=randomUUID(),orgB=randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Tenant A','synthetic-tenant-a'),($2,'Synthetic Tenant B','synthetic-tenant-b')",[orgA,orgB]);
    type Row={pk:string;id:string};
    const cache=new Map<string,Row>();
    // Build valid synthetic rows from required columns and original single-column
    // FKs; no application/provider seed code or environment DATABASE_URL is used.
    async function row(table:string,org:string):Promise<Row> {
      if(table==='organizations')return {pk:'id',id:org};
      const key=table+':'+org;const cached=cache.get(key);if(cached)return cached;
      const columns=(await local.query(`SELECT column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[fixture,table])).rows;
      const fks=(await local.query(`SELECT a.attname AS column_name,p.relname AS parent FROM pg_constraint c JOIN pg_class p ON p.oid=c.confrelid JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] WHERE c.conrelid=$1::regclass AND c.contype='f' AND cardinality(c.conkey)=1`,[table])).rows;
      const parentFor=new Map<string,string>(fks.map(r=>[r.column_name,r.parent]));
      const pk=columns.some(c=>c.column_name==='id')?'id':'token_hash';
      const values:Record<string,unknown>={organization_id:org};
      for(const col of columns){
        if(col.column_name==='organization_id'||col.column_default!==null||col.is_nullable==='YES')continue;
        const parent=parentFor.get(col.column_name);
        if(parent){values[col.column_name]=(await row(parent,org)).id;continue;}
        const type=col.data_type;
        values[col.column_name]=type==='uuid'?randomUUID():type==='integer'||type==='bigint'?1:type==='boolean'?false:type==='jsonb'?{}:type==='date'?'2026-10-08':type.startsWith('timestamp')?new Date():'synthetic-'+randomUUID();
      }
      const names=Object.keys(values);
      const result=await local.query(`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES(${names.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING ${quote(pk)}`,Object.values(values));
      const resultRow={pk,id:result.rows[0][pk]};cache.set(key,resultRow);return resultRow;
    }
    const appointment=await row('appointments',orgA),clientA=await row('clients',orgA),clientB=await row('clients',orgB);
    const conversation=await row('conversations',orgA),artistA=await row('artists',orgA),artistB=await row('artists',orgB);
    t.mock.method(pool,'query',(async (query: string | {text:string}, args: unknown[]) => (typeof query==='string'?query:query.text).includes('FROM auth_sessions')
      ? {rows:[{id:randomUUID(),organization_id:orgA,role:'OWNER'}],rowCount:1} : local.query(query as string,args)) as never);
    const request=new NextRequest('http://localhost/api/inbox',{headers:{cookie:`inkflow_session=${'a'.repeat(64)}`}});
    await t.test('inbox rejects corrupt client and artist references before migration',async()=>{
      await local.query('UPDATE conversations SET client_id=$1 WHERE id=$2',[clientB.id,conversation.id]);
      const clientLeak=await accessibleConversation(request,conversation.id);
      assert.equal(clientLeak.ok,false);if(!clientLeak.ok)assert.equal(clientLeak.error.status,404);
      await local.query('UPDATE conversations SET client_id=$1,artist_id=$2 WHERE id=$3',[clientA.id,artistB.id,conversation.id]);
      const artistLeak=await accessibleConversation(request,conversation.id);
      assert.equal(artistLeak.ok,false);if(!artistLeak.ok)assert.equal(artistLeak.error.status,404);
      await local.query('UPDATE conversations SET artist_id=$1 WHERE id=$2',[artistA.id,conversation.id]);
      assert.equal((await accessibleConversation(request,conversation.id)).ok,true);
    });
    await local.query('UPDATE appointments SET client_id=$1 WHERE id=$2',[clientB.id,appointment.id]);
    await t.test('dirty upgrade refuses without mutation or partial indexes',async()=>{
      const before=await local.query(report);assert.ok(before.rows.some(r=>r.relationship==='appointments_client_id_tenant_fk'&&Number(r.violations)===1));
      await local.query('BEGIN');
      try {await assert.rejects(local.query(migration),{code:'23503'});}finally{await local.query('ROLLBACK');}
      assert.equal((await local.query('SELECT client_id FROM appointments WHERE id=$1',[appointment.id])).rows[0].client_id,clientB.id);
      assert.equal((await local.query('SELECT count(*)::int n FROM pg_indexes WHERE schemaname=$1 AND indexname=ANY($2::text[])',[fixture,manifest.parents.map(p=>p.index)])).rows[0].n,0);
    });
    // Repair this deliberately corrupted synthetic fixture only.
    await local.query('UPDATE appointments SET client_id=$1 WHERE id=$2',[clientA.id,appointment.id]);
    await local.query('BEGIN');try{await local.query(migration);await local.query('COMMIT');}catch(error){await local.query('ROLLBACK');throw error;}
    for(const relation of manifest.relations){
      await t.test(relation.name,async()=>{
        const child=await row(relation.child,orgA),foreign=await row(relation.parent,orgB);
        await assert.rejects(local.query(`UPDATE ${quote(relation.child)} SET ${quote(relation.column)}=$1 WHERE ${quote(child.pk)}=$2`,[foreign.id,child.id]),{code:'23503'});
      });
    }
    assert.equal((await local.query(report)).rows.length,0);
    const names=manifest.relations.map(r=>r.name);
    assert.equal((await local.query('SELECT count(*)::int n FROM pg_constraint WHERE connamespace=$1::regnamespace AND conname=ANY($2::text[]) AND convalidated',[fixture,names])).rows[0].n,65);
  } finally {await local.end();}
});
