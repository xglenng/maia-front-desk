import {NextRequest,NextResponse} from 'next/server';
import {protectedRoute,identity} from '@/packages/auth/server';
import {pool} from '@/packages/db/src';
import {z} from 'zod';
async function get(request:NextRequest){
 const artistId=z.string().uuid().safeParse(request.nextUrl.searchParams.get('artistId'));if(!artistId.success)return NextResponse.json({error:'Choose an artist.'},{status:400});
 const user=(await identity(request))!;
 const result=await pool.query(`SELECT c.id,c.first_name,c.last_name,c.email,c.phone,c.sms_opt_in,c.sms_consent_status FROM clients c WHERE c.organization_id=$1 AND
 (EXISTS(SELECT 1 FROM appointments a WHERE a.client_id=c.id AND a.organization_id=c.organization_id AND a.artist_id=$2) OR EXISTS(SELECT 1 FROM conversations v WHERE v.client_id=c.id AND v.organization_id=c.organization_id AND v.artist_id=$2 AND v.channel<>'WEB_TEST')) ORDER BY c.first_name,c.id LIMIT 500`,[user.organization_id,artistId.data]);
 return NextResponse.json({clients:result.rows},{headers:{'Cache-Control':'private, no-store'}});
}
export const GET=protectedRoute(get);
