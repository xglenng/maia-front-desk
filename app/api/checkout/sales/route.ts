import {NextRequest,NextResponse} from 'next/server';
import {protectedRoute,identity} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {checkoutSales,checkoutCardAttempts} from '@/packages/db/src/schema';
import {and,eq} from 'drizzle-orm';
import {cartSchema,priceCart} from '@/packages/checkout/cart';
import {lockCheckout} from '@/packages/checkout/lock.server';
import {checkoutCatalog} from '@/packages/checkout/catalog.server';
async function post(request:NextRequest){
 const parsed=cartSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Review your cart, artist, quantities, and payment method.'},{status:400});
 const user=(await identity(request))!,input=parsed.data;
 const [previous]=await db.select().from(checkoutSales).where(and(eq(checkoutSales.organizationId,user.organization_id),eq(checkoutSales.requestId,input.requestId)));
 if(previous)return previous.artistId===input.artistId&&(user.role==='OWNER'||previous.createdByUserId===user.id)?NextResponse.json({sale:previous}):NextResponse.json({error:'Sale request unavailable.'},{status:409});
 try{
 const priced=priceCart(input,await checkoutCatalog(user.organization_id,input.artistId));
 const result=await db.transaction(async tx=>{
  await lockCheckout(tx,user.organization_id,input.requestId);
  const [existing]=await tx.select().from(checkoutSales).where(and(eq(checkoutSales.organizationId,user.organization_id),eq(checkoutSales.requestId,input.requestId)));
  if(existing){
   if(existing.artistId!==input.artistId||(user.role!=='OWNER'&&existing.createdByUserId!==user.id))throw Error('Sale request unavailable.');
   return {sale:existing,created:false};
  }
  const [card]=await tx.select().from(checkoutCardAttempts).where(and(eq(checkoutCardAttempts.organizationId,user.organization_id),eq(checkoutCardAttempts.requestId,input.requestId)));
  if(card&&card.status!=='EXPIRED')throw Error('Resolve the card payment before recording another payment method.');
  const [sale]=await tx.insert(checkoutSales).values({organizationId:user.organization_id,artistId:input.artistId,createdByUserId:user.id,requestId:input.requestId,...priced,tender:input.tender,note:input.note}).returning();
  return {sale,created:true};
 });
 return NextResponse.json({sale:result.sale},{status:result.created?201:200});
 }catch(error){return NextResponse.json({error:error instanceof Error&&['Resolve the card payment before recording another payment method.','Sale request unavailable.','An item is unavailable. Refresh the catalog.','Enter a price for variable-price items.','Add a name for the custom amount.','Sale total exceeds the allowed amount.'].includes(error.message)?error.message:'Unable to record sale. Refresh the catalog and try again.'},{status:409});}
}
export const POST=protectedRoute(post);
