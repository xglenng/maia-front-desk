import {NextRequest,NextResponse} from 'next/server';
import {protectedRoute,identity} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {checkoutSales} from '@/packages/db/src/schema';
import {and,eq} from 'drizzle-orm';
import {cartSchema,priceCart} from '@/packages/checkout/cart';
import {checkoutCatalog} from '@/packages/checkout/catalog.server';
async function post(request:NextRequest){
 const parsed=cartSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Review your cart, artist, quantities, and payment method.'},{status:400});
 const user=(await identity(request))!,input=parsed.data;
 const [previous]=await db.select().from(checkoutSales).where(and(eq(checkoutSales.organizationId,user.organization_id),eq(checkoutSales.requestId,input.requestId)));
 if(previous)return previous.artistId===input.artistId&&(user.role==='OWNER'||previous.createdByUserId===user.id)?NextResponse.json({sale:previous}):NextResponse.json({error:'Sale request unavailable.'},{status:409});
 try{
 const priced=priceCart(input,await checkoutCatalog(user.organization_id,input.artistId));
 const [sale]=await db.insert(checkoutSales).values({organizationId:user.organization_id,artistId:input.artistId,createdByUserId:user.id,requestId:input.requestId,...priced,tender:input.tender,note:input.note}).onConflictDoNothing().returning();
 if(!sale){const [existing]=await db.select().from(checkoutSales).where(and(eq(checkoutSales.organizationId,user.organization_id),eq(checkoutSales.requestId,input.requestId),eq(checkoutSales.artistId,input.artistId),eq(checkoutSales.createdByUserId,user.id)));return existing?NextResponse.json({sale:existing}):NextResponse.json({error:'Sale request unavailable.'},{status:409});}
 return NextResponse.json({sale},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error&&['An item is unavailable. Refresh the catalog.','Enter a price for variable-price items.','Add a name for the custom amount.','Sale total exceeds the allowed amount.'].includes(error.message)?error.message:'Unable to record sale. Refresh the catalog and try again.'},{status:409});}
}
export const POST=protectedRoute(post);
