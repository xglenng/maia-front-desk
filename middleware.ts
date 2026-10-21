import {NextRequest,NextResponse} from 'next/server';

export function middleware(request:NextRequest) {
  if(process.env.MAIA_STAGING_ISOLATED !== '1') return NextResponse.next();
  const path=request.nextUrl.pathname;
  const stripeSandbox=process.env.MAIA_STAGING_STRIPE_SANDBOX==='1'&&['/api/payments/connect','/api/payments/connect/checkout','/api/payments/connect/refund','/api/payments/connect/webhook','/api/payments/connect/card-entry','/api/payments/connect/receipt','/api/payments/terminal/token','/api/payments/terminal/intent'].includes(path);
  if(stripeSandbox)return NextResponse.next();
  if(path==='/api/automations/run' || path.startsWith('/api/twilio/') || path.startsWith('/api/compliance/registration/') ||
    path.startsWith('/api/integrations/google/') || path.includes('/webhook') || path.startsWith('/api/meta/') || (path.startsWith('/api/payments/') && !(path==='/api/payments/connect'&&request.method==='GET'))) {
    return NextResponse.json({error:'Provider actions, webhook processing, and scheduled automations are disabled in isolated staging.'},{status:403});
  }
  return NextResponse.next();
}
export const config={matcher:'/api/:path*'};
