import { db } from '@/packages/db/src';
import { studioInvoices } from '@/packages/db/src/schema';
import { eq, and } from 'drizzle-orm';
import { Resend } from 'resend';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(apiKey);
}

export async function sendInvoiceEmail(
  invoice: typeof studioInvoices.$inferSelect,
  recipientEmail?: string,
) {
  const email = recipientEmail || invoice.clientEmail;
  
  if (!email) {
    throw new Error('Client email is required to send invoice.');
  }

  if (invoice.emailStatus === 'SENT') {
    return { invoice, message: 'Invoice already sent by email.' };
  }

  if (!invoice.hostedUrl) {
    throw new Error('Payment link must be created before sending by email.');
  }

  // Update status to SENDING
  await db
    .update(studioInvoices)
    .set({ emailStatus: 'SENDING', updatedAt: new Date() })
    .where(eq(studioInvoices.id, invoice.id));

  try {
    // Send via Resend
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: 'invoices@maia.studio',
      to: email,
      subject: `Payment link for your invoice`,
      html: generateInvoiceEmailHtml(invoice),
      text: generateInvoiceEmailText(invoice),
      headers: {
        'Idempotency-Key': `invoice-${invoice.id}-${email.toLowerCase()}`,
      },
    });

    if (error) {
      await db
        .update(studioInvoices)
        .set({ emailStatus: 'UNKNOWN', updatedAt: new Date() })
        .where(eq(studioInvoices.id, invoice.id));
      throw new Error(`Email provider error: ${error.message}`);
    }

    // Mark as sent
    const [updated] = await db
      .update(studioInvoices)
      .set({
        emailStatus: 'SENT',
        emailProviderId: data?.id,
        updatedAt: new Date(),
      })
      .where(eq(studioInvoices.id, invoice.id))
      .returning();

    return {
      invoice: updated,
      message: 'Email queued successfully.',
    };
  } catch (error) {
    // Reset to NOT_SENT on failure
    await db
      .update(studioInvoices)
      .set({ emailStatus: 'NOT_SENT', updatedAt: new Date() })
      .where(eq(studioInvoices.id, invoice.id));
    throw error;
  }
}

function generateInvoiceEmailHtml(invoice: typeof studioInvoices.$inferSelect): string {
  return `
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Invoice Payment</h2>
          <p>Hi ${invoice.clientName},</p>
          <p>Your invoice is ready for payment. Please follow the link below to complete the payment:</p>
          <div style="margin: 20px 0;">
            <a href="${invoice.hostedUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View and Pay Invoice
            </a>
          </div>
          <p>Or copy this link: <code>${invoice.hostedUrl}</code></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">If you have any questions, please reply to this email or contact us directly.</p>
        </div>
      </body>
    </html>
  `;
}

function generateInvoiceEmailText(invoice: typeof studioInvoices.$inferSelect): string {
  return `
Invoice Payment

Hi ${invoice.clientName},

Your invoice is ready for payment. Please visit the link below to complete the payment:

${invoice.hostedUrl}

If you have any questions, please reply to this email or contact us directly.
  `.trim();
}
