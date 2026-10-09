import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {middleware} from '../../../middleware';
test('isolated staging blocks provider, webhook, and cron routes while retaining signup',()=>{
  const previous=process.env.MAIA_STAGING_ISOLATED;
  process.env.MAIA_STAGING_ISOLATED='1';
  try {
    for(const path of ['/api/integrations/google/connect','/api/integrations/google/callback','/api/automations/run','/api/twilio/provision','/api/twilio/inbound','/api/compliance/registration/adopt','/api/meta/webhook','/api/payments/webhook','/api/waivers/webhooks/jotform/test']) {
      assert.equal(middleware(new NextRequest(`http://127.0.0.1:3100${path}`)).status,403,path);
    }
    assert.equal(middleware(new NextRequest('http://127.0.0.1:3100/api/auth/signup')).headers.get('x-middleware-next'),'1');
    delete process.env.MAIA_STAGING_ISOLATED;
    assert.equal(middleware(new NextRequest('http://localhost/api/twilio/inbound')).headers.get('x-middleware-next'),'1');
  } finally {
    if(previous===undefined)delete process.env.MAIA_STAGING_ISOLATED;else process.env.MAIA_STAGING_ISOLATED=previous;
  }
});
