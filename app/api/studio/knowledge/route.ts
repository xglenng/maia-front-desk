import { NextRequest, NextResponse } from 'next/server';
import { protectedRoute, identity } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { reusableKnowledgeCandidate } from '@/packages/studio/knowledge-policy';
import { z } from 'zod';

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const artistId=request.nextUrl.searchParams.get('artistId');
  if(!artistId)return NextResponse.json({error:'Select an artist.'},{status:400});
  const {rows}=await pool.query(`WITH candidates AS (
    SELECT m.id,c.id AS conversation_id,c.artist_id,m.content AS body,m.created_at,'MESSAGE' AS kind,
      CASE WHEN m.sender_type='AI' THEN 'AI_GENERATED' WHEN m.metadata->>'reviewedDraftId' IS NOT NULL THEN 'REVIEWED_AI_DRAFT' ELSE 'ARTIST_REPLY' END AS source
    FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE c.organization_id=$1 AND c.artist_id=$2 AND c.channel <> 'WEB_TEST' AND m.role='assistant'
      AND m.sender_type IN ('OWNER','ARTIST','AI')
      AND coalesce(m.metadata->>'status','') NOT IN ('failed','delivery_failed','generated','provider_send_started','submitting')
    UNION ALL
    SELECT e.id,c.id,c.artist_id,e.details->>'body',e.created_at,'DRAFT','UNSENT_AI_DRAFT'
    FROM conversation_events e JOIN conversations c ON c.id=e.conversation_id AND c.organization_id=e.organization_id
    WHERE e.organization_id=$1 AND c.artist_id=$2 AND c.channel <> 'WEB_TEST' AND e.action='AI_DRAFT_CREATED' AND e.details->>'status'='PENDING'
  ) SELECT v.* FROM candidates v WHERE NOT EXISTS (
    SELECT 1 FROM conversation_events review WHERE review.organization_id=$1 AND review.action IN ('KNOWLEDGE_APPROVED','KNOWLEDGE_DISMISSED')
    AND review.details->>'sourceId'=v.id::text AND review.details->>'kind'=v.kind
  ) ORDER BY v.created_at DESC LIMIT 60`,[user.organization_id,artistId]);
  return NextResponse.json({suggestions:rows.filter(row=>reusableKnowledgeCandidate(row.body || '')).slice(0,12)});
}
const schema=z.object({artistId:z.string().uuid(),sourceId:z.string().uuid(),kind:z.enum(['MESSAGE','DRAFT']),action:z.enum(['APPROVE','DISMISS']),text:z.string().trim().min(1).max(1200).optional(),confirmedGeneralKnowledge:z.boolean().optional()});
async function handlePOST(request:NextRequest){
  const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Invalid knowledge review.'},{status:400});
  const input=parsed.data;
  if(input.action==='APPROVE'&&(!input.text||!input.confirmedGeneralKnowledge||!reusableKnowledgeCandidate(input.text)))return NextResponse.json({error:'Use a general studio statement without client details, links, quoted prices, or booking times, and confirm it before approval.'},{status:400});
  const tx=await pool.connect();
  try{
    await tx.query('BEGIN');
    const artist=await tx.query('SELECT id FROM artists WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.artistId,user.organization_id]);
    if(!artist.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Artist not found.'},{status:404});}
    const source=input.kind==='MESSAGE'
      ?await tx.query(`SELECT c.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.organization_id=$2 AND c.artist_id=$3 AND m.role='assistant' AND m.sender_type IN ('OWNER','ARTIST','AI') AND c.channel <> 'WEB_TEST'`,[input.sourceId,user.organization_id,input.artistId])
      :await tx.query(`SELECT c.id FROM conversation_events e JOIN conversations c ON c.id=e.conversation_id AND c.organization_id=e.organization_id WHERE e.id=$1 AND e.organization_id=$2 AND c.artist_id=$3 AND e.action='AI_DRAFT_CREATED' AND c.channel <> 'WEB_TEST'`,[input.sourceId,user.organization_id,input.artistId]);
    if(!source.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Source not found.'},{status:404});}
    const prior=await tx.query("SELECT id FROM conversation_events WHERE organization_id=$1 AND action IN ('KNOWLEDGE_APPROVED','KNOWLEDGE_DISMISSED') AND details->>'sourceId'=$2 AND details->>'kind'=$3 LIMIT 1",[user.organization_id,input.sourceId,input.kind]);
    if(prior.rowCount){await tx.query('COMMIT');return NextResponse.json({alreadyReviewed:true});}
    let rule;
    if(input.action==='APPROVE'){
      const existing=await tx.query('SELECT id FROM business_rules WHERE organization_id=$1 AND artist_id=$2 AND active=true AND visibility=\'CLIENT_VISIBLE\' AND lower(trim(rule))=lower(trim($3)) LIMIT 1',[user.organization_id,input.artistId,input.text]);
      if(!existing.rowCount)rule=(await tx.query("INSERT INTO business_rules(organization_id,artist_id,category,rule,visibility,priority,active) VALUES($1,$2,'STUDIO_KNOWLEDGE',$3,'CLIENT_VISIBLE',100,true) RETURNING id,artist_id AS \"artistId\",category,rule,visibility,priority,active",[user.organization_id,input.artistId,input.text])).rows[0];
    }
    await tx.query('INSERT INTO conversation_events(organization_id,conversation_id,user_id,action,details) VALUES($1,$2,$3,$4,$5)',[user.organization_id,source.rows[0].id,user.id,input.action==='APPROVE'?'KNOWLEDGE_APPROVED':'KNOWLEDGE_DISMISSED',JSON.stringify({sourceId:input.sourceId,kind:input.kind,ruleId:rule?.id})]);
    await tx.query('COMMIT');return NextResponse.json({rule});
  }catch{await tx.query('ROLLBACK');return NextResponse.json({error:'Unable to review studio knowledge.'},{status:500});}finally{tx.release();}
}
export const GET=protectedRoute(handleGET,true);
export const POST=protectedRoute(handlePOST,true);
