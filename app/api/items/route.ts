import {NextRequest,NextResponse} from 'next/server';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {retailItems} from '@/packages/db/src/schema';
import {and,eq,asc} from 'drizzle-orm';
import {z} from 'zod';
const schema=z.object({artistId:z.string().uuid(),id:z.string().uuid().optional(),name:z.string().trim().min(1).max(120),category:z.string().trim().max(80).nullable().default(null),sku:z.string().trim().max(80).nullable().default(null),priceCents:z.number().int().min(1).max(100_000_000).nullable(),taxBasisPoints:z.number().int().min(0).max(10000).default(0),active:z.boolean().default(true)});
async function get(request:NextRequest){const user=(await identity(request))!;const artistId=z.string().uuid().safeParse(request.nextUrl.searchParams.get('artistId'));if(!artistId.success)return NextResponse.json({error:'Choose an artist.'},{status:400});return NextResponse.json({items:await db.select().from(retailItems).where(and(eq(retailItems.organizationId,user.organization_id),eq(retailItems.artistId,artistId.data))).orderBy(asc(retailItems.name))});}
async function post(request:NextRequest){const user=(await identity(request))!;const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Enter a name, valid price, and tax rate.'},{status:400});const {id,...values}=parsed.data;
 const [item]=id?await db.update(retailItems).set({...values,updatedAt:new Date()}).where(and(eq(retailItems.id,id),eq(retailItems.organizationId,user.organization_id),eq(retailItems.artistId,values.artistId))).returning():await db.insert(retailItems).values({...values,organizationId:user.organization_id}).returning();
 return item?NextResponse.json({item}):NextResponse.json({error:'Item not found.'},{status:404});}
export const GET=protectedRoute(get);
export const POST=protectedRoute(post);
