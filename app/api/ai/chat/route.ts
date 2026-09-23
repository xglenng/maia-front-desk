import { protectedRoute } from '@/packages/auth/server';
import { handlePOST } from '@/packages/ai/src/http';
import { NextRequest } from 'next/server';
async function routePOST(request: NextRequest) { return handlePOST(request); }
export const POST = protectedRoute(routePOST);
