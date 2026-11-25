import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SQL } from 'drizzle-orm';
import { db } from '../../db/src';
import { organizations, studioInvoices, studioLogoAssets } from '../../db/src/schema';
import { sendInvoiceEmail } from '../../invoices/email.server';
import { invoiceDelivery } from '../../invoices/delivery';

test('invoice email uses the invoice studio name and verified address safely', async t => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.AUTH_EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.AUTH_EMAIL_FROM;
    else process.env.AUTH_EMAIL_FROM = previousFrom;
    globalThis.fetch = originalFetch;
  });
  process.env.RESEND_API_KEY = 'synthetic-key';
  process.env.AUTH_EMAIL_FROM = 'Maia <sender@example.test>';

  const invoice: typeof studioInvoices.$inferSelect = {
    id: 'invoice-1', organizationId: 'org-1', artistId: 'artist-1',
    createdByUserId: 'user-1', requestId: 'request-1', clientId: null,
    smsStatus: 'NOT_SENT', smsProviderId: null, emailStatus: 'NOT_SENT', emailProviderId: null,
    clientName: '<Client & Co>', clientEmail: 'client@example.test',
    lines: [{ name: '<Service & care>', quantity: 2, unitCents: 500 }],
    totalCents: 1000, dueDays: 30, note: '', status: 'OPEN',
    stripeAccountId: null, stripeInvoiceId: null, issuingAt: null,
    hostedUrl: 'https://invoice.stripe.com/test', createdAt: new Date(), updatedAt: new Date(),
  };
  const stripe = {hosted_invoice_url:'https://invoice.stripe.com/test',invoice_pdf:'https://invoice.stripe.com/test/pdf',amount_remaining:750,due_date:1793721600,status_transitions:{finalized_at:1793635200},number:'INV-123'};
  const delivery = invoiceDelivery(stripe);
  const logoBytes = await sharp({create:{width:12,height:12,channels:3,background:'#123456'}}).webp().toBuffer();
  const logo = {data:logoBytes.toString('base64'),byteLength:logoBytes.length,sha256:createHash('sha256').update(logoBytes).digest('hex')};
  const studios = new Map([
    ['org-1', { id: 'org-1', publicName: 'Bright "Moon", Ink', name: 'First Studio' }],
    ['org-2', { id: 'org-2', publicName: '  ', name: 'Second Studio' }],
    ['org-3', { id: 'org-3', publicName: 'Studio\r\nBcc: <other@example.test>', name: 'Third Studio' }],
  ]);
  const dialect = new PgDialect();
  const queries: { table: unknown; params: unknown[] }[] = [];
  t.mock.method(db, 'select', (() => ({
    from: (table: unknown) => ({
      where: (where: SQL) => ({
        limit: async () => {
          const params = dialect.sqlToQuery(where).params;
          queries.push({ table, params });
          if (table === organizations) {
            const org = studios.get(String(params[0]));
            return org ? [org] : [];
          }
          if (table === studioLogoAssets) return params[0]==='org-1' ? [logo] : [];
          throw new Error('Unexpected select');
        },
      }),
    }),
  })) as never);
  const statuses: string[] = [];
  t.mock.method(db, 'update', (() => ({
    set: (values: { emailStatus: string }) => {
      statuses.push(values.emailStatus);
      return {
        where: () => Object.assign(Promise.resolve(), {
          returning: async () => [{ ...invoice, emailStatus: values.emailStatus }],
        }),
      };
    },
  })) as never);

  const idempotencyKeys:string[]=[];
  const payloads: { from: string; to: string; html: string; text: string; attachments?: {content:string;content_type:string;content_id:string}[] }[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    idempotencyKeys.push(new Headers(init?.headers).get('idempotency-key')||'');
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON request body');
    payloads.push(JSON.parse(body));
    return Response.json({ id: 'provider-id' });
  };

  await sendInvoiceEmail(invoice, 'other@example.test', delivery);
  process.env.AUTH_EMAIL_FROM = 'sender@example.test';
  const noPdf = await sendInvoiceEmail({ ...invoice, id: 'invoice-2', organizationId: 'org-2', artistId: 'artist-2' }, undefined, {...delivery,pdfUrl:null});
  process.env.AUTH_EMAIL_FROM = 'Maia <sender@example.test>';
  await sendInvoiceEmail({ ...invoice, id: 'invoice-3', organizationId: 'org-3', artistId: 'artist-3' }, undefined, delivery);
  assert.deepEqual(payloads.map(payload => payload.from), [
    '"Bright \\"Moon\\", Ink" <sender@example.test>',
    '"Second Studio" <sender@example.test>',
    '"Studio  Bcc:  other@example.test" <sender@example.test>',
  ]);
  assert.equal(payloads[0].to, 'other@example.test');
  assert.match(payloads[0].html, /&lt;Client &amp; Co&gt;/);
  assert.match(payloads[0].html, /&lt;Service &amp; care&gt;/);
  assert.ok(payloads[0].html.includes('× 2 @ $5.00'));
  assert.ok(payloads[0].text.includes('× 2 @ $5.00'));
  assert.doesNotMatch(payloads[0].html, /<Client & Co>|<Service & care>/);
  assert.match(payloads[0].html, /cid:studio-logo/);
  assert.equal(payloads[0].attachments?.[0].content_id, 'studio-logo');
  assert.equal(payloads[0].attachments?.[0].content_type, 'image/png');
  assert.equal(Buffer.from(payloads[0].attachments![0].content,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.match(payloads[0].html, /Invoice INV-123/);
  assert.ok(payloads[0].html.includes('November 3, 2026 (UTC)'));
  assert.ok(payloads[0].html.includes('$7.50'));
  assert.ok(payloads[0].html.includes('https://invoice.stripe.com/test/pdf'));
  assert.ok(payloads[0].text.includes('Download invoice PDF: https://invoice.stripe.com/test/pdf'));
  assert.ok(payloads[0].text.includes('sent to other@example.test'));
  assert.equal(payloads[1].attachments, undefined);
  assert.doesNotMatch(payloads[1].html, /Download invoice PDF/);
  assert.match(noPdf.message, /no PDF link was included/);
  assert.deepEqual(queries.filter(query => query.table === organizations).map(query => query.params), [
    ['org-1'], ['org-2'], ['org-3'],
  ]);
  assert.deepEqual(queries.filter(query => query.table === studioLogoAssets).map(query => query.params), [
    ['org-1', true], ['org-2', true], ['org-3', true],
  ]);

  process.env.AUTH_EMAIL_FROM = 'Maia <sender@example.test>\r\nBcc: other@example.test';
  await assert.rejects(sendInvoiceEmail(invoice, undefined, delivery), /valid verified email sender/);
  process.env.AUTH_EMAIL_FROM = 'sender@example.test';
  await assert.rejects(sendInvoiceEmail({ ...invoice, organizationId: 'unknown' }, undefined, delivery), /Configure the studio name/);
  logo.sha256 = 'invalid';
  await assert.rejects(sendInvoiceEmail(invoice, undefined, delivery), /studio logo could not be verified/);
  assert.equal(payloads.length, 3);
  assert.deepEqual(statuses.slice(-6), ['SENDING', 'NOT_SENT', 'SENDING', 'NOT_SENT', 'SENDING', 'NOT_SENT']);
  logo.sha256=createHash('sha256').update(Buffer.from(logo.data,'base64')).digest('hex');
  const resendId='11111111-1111-4111-8111-111111111111';
  await sendInvoiceEmail({...invoice,emailStatus:'SENT'},undefined,delivery,resendId);
  await sendInvoiceEmail({...invoice,emailStatus:'SENT'},undefined,delivery,resendId);
  assert.equal(idempotencyKeys.at(-1),idempotencyKeys.at(-2));
  assert.match(idempotencyKeys.at(-1)!,/-resend-11111111/);
  await assert.rejects(sendInvoiceEmail({...invoice,emailStatus:'UNKNOWN'},undefined,delivery,resendId),/needs review/);

});

test('invoice delivery accepts only Stripe links and surfaces missing PDFs', t => {
  const stripe = {hosted_invoice_url:'https://invoice.stripe.com/test',invoice_pdf:'https://pay.stripe.com/test/pdf',amount_remaining:750,due_date:null,status_transitions:{finalized_at:null},number:null};
  assert.equal(invoiceDelivery(stripe).pdfUrl,'https://pay.stripe.com/test/pdf');
  assert.equal(invoiceDelivery({...stripe,invoice_pdf:null}).pdfUrl,null);
  t.mock.method(console,'error',()=>{});
  assert.equal(invoiceDelivery({...stripe,invoice_pdf:'https://invoice.stripe.com.evil.test/pdf'}).pdfUrl,null);
  assert.throws(()=>invoiceDelivery({...stripe,hosted_invoice_url:'https://invoice.stripe.com@evil.test/'}),/invoice details/);
  assert.throws(()=>invoiceDelivery({...stripe,amount_remaining:-1}),/invoice details/);
});
