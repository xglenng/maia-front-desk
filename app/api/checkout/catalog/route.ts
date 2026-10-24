import {NextRequest,NextResponse} from 'next/server';
import {protectedRoute,identity} from '@/packages/auth/server';
import {checkoutCatalog} from '@/packages/checkout/catalog.server';
import {z} from 'zod';
async function get(request:NextRequest){const artistId=z.string().uuid().safeParse(request.nextUrl.searchParams.get('artistId'));if(!artistId.success)return NextResponse.json({error:'Choose an artist.'},{status:400});const user=(await identity(request))!;return NextResponse.json({catalog:await checkoutCatalog(user.organization_id,artistId.data)});}
export const GET=protectedRoute(get);
