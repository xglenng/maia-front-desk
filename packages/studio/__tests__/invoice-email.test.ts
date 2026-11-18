import test from 'node:test';
import assert from 'node:assert/strict';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { db } from '../../db/src';
import { artists, organizations, studioInvoices, studioLogoAssets } from '../../db/src/schema';
import { sendInvoiceEmail } from '../../invoices/email.server';

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
    clientName: 'Client', clientEmail: 'client@example.test',
    lines: [{ name: 'Service', quantity: 1, unitCents: 1000 }],
    totalCents: 1000, dueDays: 30, note: '', status: 'OPEN',
    stripeAccountId: null, stripeInvoiceId: null, issuingAt: null,
    hostedUrl: 'https://example.test/invoice', createdAt: new Date(), updatedAt: new Date(),
  };
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
          if (table === artists) return [{ id: params[0], displayName: 'Artist' }];
          if (table === studioLogoAssets) return [];
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

  const payloads: { from: string; to: string }[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('Expected JSON request body');
    payloads.push(JSON.parse(body));
    return Response.json({ id: 'provider-id' });
  };

  await sendInvoiceEmail(invoice);
  process.env.AUTH_EMAIL_FROM = 'sender@example.test';
  await sendInvoiceEmail({ ...invoice, id: 'invoice-2', organizationId: 'org-2', artistId: 'artist-2' });
  process.env.AUTH_EMAIL_FROM = 'Maia <sender@example.test>';
  await sendInvoiceEmail({ ...invoice, id: 'invoice-3', organizationId: 'org-3', artistId: 'artist-3' });
  assert.deepEqual(payloads.map(payload => payload.from), [
    '"Bright \\"Moon\\", Ink" <sender@example.test>',
    '"Second Studio" <sender@example.test>',
    '"Studio  Bcc:  other@example.test" <sender@example.test>',
  ]);
  assert.equal(payloads[0].to, 'client@example.test');
  assert.deepEqual(queries.filter(query => query.table === organizations).map(query => query.params), [
    ['org-1'], ['org-2'], ['org-3'],
  ]);
  assert.deepEqual(queries.filter(query => query.table === artists).map(query => query.params), [
    ['artist-1', 'org-1'], ['artist-2', 'org-2'], ['artist-3', 'org-3'],
  ]);

  process.env.AUTH_EMAIL_FROM = 'Maia <sender@example.test>\r\nBcc: other@example.test';
  await assert.rejects(sendInvoiceEmail(invoice), /valid verified email sender/);
  process.env.AUTH_EMAIL_FROM = 'sender@example.test';
  await assert.rejects(sendInvoiceEmail({ ...invoice, organizationId: 'unknown' }), /Configure the studio name/);
  assert.equal(payloads.length, 3);
  assert.deepEqual(statuses.slice(-4), ['SENDING', 'NOT_SENT', 'SENDING', 'NOT_SENT']);
});
