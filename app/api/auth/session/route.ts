import { NextRequest, NextResponse } from 'next/server';
import { identity, cookieName, sameOrigin } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { digest } from '@/packages/auth/crypto';
export async function GET(req: NextRequest) {
  const user=await identity(req);
  if (!user) return NextResponse.json({user:null},{status:401,headers:{'Cache-Control':'no-store'}});
  const result=await pool.query('SELECT public_email FROM organizations WHERE id=$1',[user.organization_id]);
  return NextResponse.json({user:{...user,studioEmail:result.rows[0]?.public_email ?? null}},{headers:{'Cache-Control':'no-store'}});
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({error:'Invalid request origin'},{status:403});
  const raw=req.cookies.get(cookieName)?.value;
  if(raw) await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[digest(raw)]);
  const response=NextResponse.json({ok:true});response.cookies.set(cookieName,'',{path:'/',maxAge:0});return response;
}
