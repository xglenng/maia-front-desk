import { and, eq } from 'drizzle-orm';
import { db, pool } from '@/packages/db/src';
import { studioInvoices, clients } from '@/packages/db/src/schema';
import { invoiceClient } from './sms.server';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.AUTH_EMAIL_FROM || 'Maia <invoices@maia.app>';

export async function sendInvoiceEmail(
  row: typeof studioInvoices.$inferSelect,
  recipientEmail?: string,
) {
  if (row.emailStatus === 'SENT') {
    return { invoice: row, message: 'Invoice email was already submitted.' };
  }
  if (row.emailStatus !== 'NOT_SENT') {
    throw Error('Email delivery needs review before sending again.');
  }
  if (row.status !== 'OPEN' || !row.hostedUrl || !/^https:\/\/(?:invoice|pay)\.stripe\.com\//.test(row.hostedUrl)) {
    throw Error('Create an open invoice link first.');
  }

  const toEmail = recipientEmail?.trim() || row.clientEmail;
  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    throw Error('A valid recipient email address is required.');
  }

  if (!RESEND_API_KEY || process.env.MAIA_STAGING_ISOLATED === '1') {
    throw Error('Email is not configured for this environment.');
  }

  const subject = `Invoice for $${(row.totalCents / 100).toFixed(2)}`;
  const html = `
    <p>Hello ${row.clientName},</p>
    <p>Your invoice for <strong>$${(row.totalCents / 100).toFixed(2)}</strong> is ready.</p>
    <p>
      <a href="${row.hostedUrl}" style="display: inline-block; padding: 12px 24px; background-color: #246d48; color: white; text-decoration: none; border-radius: 4px;">
        View and Pay Invoice
      </a>
    </p>
    <p>
      <strong>Invoice Details:</strong><br>
      Amount Due: $${(row.totalCents / 100).toFixed(2)}<br>
      ${row.dueDays ? `Payment Due: ${new Date(Date.now() + row.dueDays * 24 * 60 * 60 * 1000).toLocaleDateString()}` : ''}
    </p>
    ${row.note ? `<p><strong>Note:</strong> ${row.note}</p>` : ''}
    <p>Thank you!</p>
  `;

  const text = `Hello ${row.clientName},\n\nYour invoice for $${(row.totalCents / 100).toFixed(2)} is ready.\n\nView and pay: ${row.hostedUrl}\n\nInvoice Details:\nAmount Due: $${(row.totalCents / 100).toFixed(2)}\n${row.dueDays ? `Payment Due: ${new Date(Date.now() + row.dueDays * 24 * 60 * 60 * 1000).toLocaleDateString()}\n` : ''}${row.note ? `Note: ${row.note}\n` : ''}\nThank you!`;

  // Mark as sending before attempting to send
  const [claimed] = await db
    .update(studioInvoices)
    .set({ emailStatus: 'SENDING', updatedAt: new Date() })
    .where(
      and(
        eq(studioInvoices.id, row.id),
        eq(studioInvoices.organizationId, row.organizationId),
        eq(studioInvoices.emailStatus, 'NOT_SENT'),
      ),
    )
    .returning();

  if (!claimed) {
    throw Error('Email send already started. Check delivery before sending again.');
  }

  let messageId: string | undefined;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `studio-invoice/${row.id}/${toEmail}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [toEmail],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 409 || response.status === 429 || response.status >= 500) {
        // Temporary failure - mark as UNKNOWN and allow retry
        await db
          .update(studioInvoices)
          .set({ emailStatus: 'UNKNOWN', updatedAt: new Date() })
          .where(
            and(
              eq(studioInvoices.id, row.id),
              eq(studioInvoices.organizationId, row.organizationId),
            ),
          );
        throw Error('Email delivery is uncertain. Please retry.');
      }
      throw Error('Email provider rejected the request.');
    }

    const data = await response.json();
    messageId = data.id;
    if (typeof messageId !== 'string' || !messageId) {
      throw Error('Email provider did not confirm acceptance.');
    }

    const [invoice] = await db
      .update(studioInvoices)
      .set({ emailStatus: 'SENT', emailProviderId: messageId, updatedAt: new Date() })
      .where(
        and(
          eq(studioInvoices.id, row.id),
          eq(studioInvoices.organizationId, row.organizationId),
        ),
      )
      .returning();

    return { invoice, message: 'Invoice email submitted successfully.' };
  } catch (error) {
    const isRecoverableError =
      error instanceof Error &&
      (error.message === 'A valid recipient email address is required.' ||
        error.message === 'Email is not configured for this environment.');

    await db
      .update(studioInvoices)
      .set({ emailStatus: isRecoverableError ? 'NOT_SENT' : 'UNKNOWN', emailProviderId: messageId, updatedAt: new Date() })
      .where(
        and(
          eq(studioInvoices.id, row.id),
          eq(studioInvoices.organizationId, row.organizationId),
        ),
      );

    throw error;
  }
}
