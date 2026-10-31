import {NextRequest,NextResponse} from 'next/server';
import {identity,protectedRoute} from '@/packages/auth/server';
import {pool} from '@/packages/db/src';
import {z} from 'zod';
async function get(request:NextRequest){
 const user=(await identity(request))!;
 const input=z.object({page:z.coerce.number().int().min(0).max(10000).default(0)}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!input.success)return NextResponse.json({error:'Invalid page.'},{status:400});
 const result=await pool.query(`WITH activity AS (
 SELECT s.id::text,'Checkout sale' AS source,s.artist_id,s.created_at,s.total_cents AS amount_cents,s.tip_cents,0 AS refunded_cents,s.tender AS method,'PAID' AS status,s.lines,s.note
 FROM checkout_sales s WHERE s.organization_id=$1
 UNION ALL
 SELECT c.id::text,'Card checkout',c.artist_id,c.created_at,c.total_cents,c.tip_cents,0,'CARD',c.status,c.lines,c.note
 FROM checkout_card_attempts c WHERE c.organization_id=$1 AND c.status<>'PAID'
 UNION ALL
 SELECT p.id::text,CASE WHEN p.purpose='DEPOSIT' THEN 'Appointment deposit' ELSE 'Appointment balance' END,a.artist_id,p.created_at,p.amount_cents,p.tip_cents,p.refunded_cents,upper(p.provider),p.status,'[]'::jsonb,''
 FROM payments p JOIN appointments a ON a.id=p.appointment_id AND a.organization_id=p.organization_id WHERE p.organization_id=$1 AND p.currency='usd'
 UNION ALL
 SELECT i.id::text,'Invoice payment',i.artist_id,i.updated_at,i.total_cents,0,0,'CARD',i.status,'[]'::jsonb,''
 FROM studio_invoices i WHERE i.organization_id=$1 AND i.status='PAID'
 ) SELECT activity.*,ar.display_name AS artist_name FROM activity JOIN artists ar ON ar.id=activity.artist_id AND ar.organization_id=$1
 WHERE ($2::boolean OR ar.user_id=$3) ORDER BY activity.created_at DESC,activity.id DESC LIMIT 51 OFFSET $4`,[user.organization_id,user.role==='OWNER',user.id,input.data.page*50]);
 return NextResponse.json({rows:result.rows.slice(0,50),hasMore:result.rows.length>50,page:input.data.page},{headers:{'Cache-Control':'private, no-store'}});
}
export const GET=protectedRoute(get);
