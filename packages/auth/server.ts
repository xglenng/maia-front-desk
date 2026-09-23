import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/packages/db/src';
import { digest } from './crypto';
import { readWaiver } from './waiver-token';

export const cookieName = 'inkflow_session';
export type Identity = { id: string; organization_id: string; role: string; name: string; email: string };
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  const allowedOrigins = new Set([new URL(req.url).origin]);
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowedOrigins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      return false;
    }
  }

  return allowedOrigins.has(origin);
}
export async function identity(req: NextRequest): Promise<Identity | null> {
  const raw = req.cookies.get(cookieName)?.value;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  const result = await pool.query(`SELECT u.id,u.organization_id,u.role,u.name,u.email FROM auth_sessions s
    JOIN users u ON u.id=s.user_id JOIN auth_credentials c ON c.user_id=u.id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND c.active=true`, [digest(raw)]);
  return result.rows[0] || null;
}
export function permitted(user: Identity, org: string, owner: boolean) {
  return user.organization_id === org && (owner ? user.role === 'OWNER' : ['OWNER','ARTIST'].includes(user.role));
}

// All browser API handlers enter here before reading or mutating tenant records.
export function protectedRoute<C>(handler: (req: NextRequest, context: C) => Promise<Response>, owner = false) {
  return async (req: NextRequest, context: C): Promise<Response> => {
    try {
      const waiverPath = new URL(req.url).pathname;
      const waiverToken = req.headers.get('x-waiver-token') || new URL(req.url).searchParams.get('access');
      if (waiverToken && ((waiverPath==='/api/waivers' && req.method==='GET') || (waiverPath==='/api/waivers/sign' && req.method==='POST'))) {
        const access=readWaiver(waiverToken);
        if(!access)return NextResponse.json({error:'Invalid or expired waiver link'},{status:403});
        const values=req.method==='GET'?Object.fromEntries(new URL(req.url).searchParams):await req.clone().json();
        if(['organizationId','appointmentId','clientId','waiverTemplateId'].some(k=>values[k]!==access[k as keyof typeof access]))return NextResponse.json({error:'Invalid waiver scope'},{status:403});
        return handler(req,context);
      }
      const user = await identity(req);
      if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
      if (!['GET','HEAD'].includes(req.method) && !sameOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
      const url = new URL(req.url);
      const body = ['GET','HEAD','DELETE'].includes(req.method) ? {} : await req.clone().json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({error:'Invalid request'}, {status:400});
      for (const org of [url.searchParams.get('organizationId'), body.organizationId]) {
        if (org && !permitted(user, org, owner)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!permitted(user, user.organization_id, owner)) return NextResponse.json({error:'Owner access required'}, {status:403});
      const tables: Record<string,string> = { artistId:'artists',clientId:'clients',appointmentId:'appointments',conversationId:'conversations',serviceId:'services',waiverTemplateId:'waiver_templates' };
      const references = [...Object.entries(body), ...url.searchParams.entries()];
      const pathId = url.pathname.match(/^\/api\/appointments\/([^/]+)$/)?.[1];
      if (pathId) references.push(['appointmentId',pathId]);
      for (const [key,id] of references) {
        if (!tables[key] || id == null || id === '') continue;
        if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({error:'Invalid record ID'}, {status:400});
        const found = await pool.query(`SELECT id FROM ${tables[key]} WHERE id=$1 AND organization_id=$2`, [id,user.organization_id]);
        if (!found.rowCount) return NextResponse.json({error:'Record not found'}, {status:404});
      }
      url.searchParams.set('organizationId', user.organization_id);
      if (!['GET','HEAD','DELETE'].includes(req.method)) body.organizationId = user.organization_id;
      const next = new NextRequest(url, {method:req.method, headers:req.headers, ...(!['GET','HEAD','DELETE'].includes(req.method) ? {body:JSON.stringify(body)} : {})});
      const response = await handler(next, context);
      // Do not serialize encrypted credentials through legacy compliance endpoints.
      if (url.pathname.startsWith('/api/compliance') && response.headers.get('content-type')?.includes('application/json')) {
        const value = await response.json();
        const cleaned = JSON.parse(JSON.stringify(value, (key,v) => key === 'businessRegistrationNumberEncrypted' ? undefined : v));
        return NextResponse.json(cleaned, {status:response.status,headers:{'Cache-Control':'no-store'}});
      }
      response.headers.set('Cache-Control','no-store');
      return response;
    } catch (e) {
      return NextResponse.json({error:e instanceof SyntaxError ? 'Invalid JSON' : 'Request failed'}, {status:e instanceof SyntaxError ? 400 : 500});
    }
  };
}

// Multipart uploads cannot use protectedRoute because that guard intentionally
// normalizes JSON bodies. This variant performs the same owner, tenant, and
// same-origin checks without attempting to serialize an uploaded document.
export function protectedFormRoute<C>(handler: (req: NextRequest, context: C) => Promise<Response>, owner = false) {
  return async (req: NextRequest, context: C): Promise<Response> => {
    try {
      const user = await identity(req);
      if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
      if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
      if (!permitted(user, user.organization_id, owner)) return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
      const form = await req.clone().formData();
      const organizationId = form.get('organizationId');
      if (typeof organizationId !== 'string' || !permitted(user, organizationId, owner)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const artistId = form.get('artistId');
      if (typeof artistId !== 'string' || !/^[a-f0-9-]{36}$/i.test(artistId)) return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
      const found = await pool.query('SELECT id FROM artists WHERE id=$1 AND organization_id=$2', [artistId, user.organization_id]);
      if (!found.rowCount) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
      const response = await handler(req, context);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      console.error(error);
      return NextResponse.json({ error: 'Request failed' }, { status: 500 });
    }
  };
}
