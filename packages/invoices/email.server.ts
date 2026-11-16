import { db } from '@/packages/db/src';
import { studioInvoices } from '@/packages/db/src/schema';
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

// Check if email_status column exists in schema by attempting a safe query
async function checkEmailCapability(): Promise<boolean> {
  try {
    await db
      .select()
      .from(studioInvoices)
      .where(eq(studioInvoices.id, '00000000-0000-0000-0000-000000000000'))
      .limit(0);
    return true;
  } catch (error) {
    // If the query fails due to missing column, the schema isn't ready
    if (
      error instanceof Error &&
      (error.message.includes('email_status') ||
        error.message.includes('column') ||
        error.message.includes('does not exist'))
    ) {
      return false;
    }
    // Other errors should still throw
    throw error;
  }
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
  try {
    await db
      .update(studioInvoices)
      .set({ emailStatus: 'SENDING', updatedAt: new Date() })
      .where(eq(studioInvoices.id, invoice.id));
  } catch (error) {
    // If the update fails due to missing column, provide helpful message
    if (
      error instanceof Error &&
      (error.message.includes('email_status') ||
        error.message.includes('column') ||
        error.message.includes('does not exist'))
    ) {
      throw new Error(
        'Invoice email is not yet available. The database migration is pending.'
      );
    }
    throw error;
  }

  try {
    // Send via Resend
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: 'invoices@maia.studio',
      to: email,
      subject: `Invoice Payment Required`,
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
      throw new Error(
        `Email could not be sent. Please try again or contact support.`
      );
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
      message: 'Invoice sent successfully.',
    };
  } catch (error) {
    // Reset to NOT_SENT on failure (recoverable error)
    try {
      await db
        .update(studioInvoices)
        .set({ emailStatus: 'NOT_SENT', updatedAt: new Date() })
        .where(eq(studioInvoices.id, invoice.id));
    } catch {
      // If reset fails, don't mask the original error
    }
    throw error;
  }
}

function generateInvoiceEmailHtml(invoice: typeof studioInvoices.$inferSelect): string {
  // Format currency
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(invoice.totalCents / 100);

  // Format date
  const issueDate = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Calculate item count
  const itemCount = Array.isArray(invoice.lines)
    ? invoice.lines.length
    : 0;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; }
    .header { background: #fff; padding: 32px 24px; border-bottom: 1px solid #eee; }
    .header-content { max-width: 500px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .studio-info { flex: 1; }
    .studio-name { font-size: 18px; font-weight: 600; color: #000; margin-bottom: 4px; }
    .artist-name { font-size: 14px; color: #666; }
    .amount-box { text-align: right; }
    .amount-label { font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .amount-due { font-size: 28px; font-weight: 700; color: #000; }
    .invoice-details { margin-top: 24px; display: flex; gap: 32px; font-size: 13px; }
    .detail-row { flex: 1; }
    .detail-label { color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .detail-value { color: #333; font-weight: 500; }
    .cta-section { padding: 32px 24px; background: #f9f9f9; text-align: center; border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
    .cta-button { display: inline-block; background: #000; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; margin-bottom: 12px; }
    .cta-button:hover { background: #222; }
    .cta-subtext { font-size: 12px; color: #666; }
    .payment-link { word-break: break-all; color: #0066cc; font-size: 12px; }
    .content { padding: 32px 24px; }
    .invoice-items { margin-bottom: 24px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .items-table th { text-align: left; padding: 12px 0; border-bottom: 1px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .items-table td { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
    .items-table .item-name { color: #333; font-weight: 500; }
    .items-table .item-qty { text-align: center; color: #666; }
    .items-table .item-price { text-align: right; color: #333; }
    .total-section { padding-top: 16px; border-top: 2px solid #333; }
    .total-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-size: 14px; }
    .total-row.final { font-size: 18px; font-weight: 700; color: #000; padding: 12px 0; }
    .footer { padding: 24px; background: #f9f9f9; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
    .footer-link { color: #0066cc; text-decoration: none; }
    @media (max-width: 480px) {
      .header { padding: 24px 16px; }
      .cta-section { padding: 24px 16px; }
      .content { padding: 24px 16px; }
      .footer { padding: 16px; }
      .header-top { flex-direction: column; }
      .amount-box { text-align: left; margin-top: 16px; }
      .invoice-details { flex-direction: column; gap: 12px; }
      .amount-due { font-size: 24px; }
      .cta-button { width: 100%; padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-content">
        <div class="header-top">
          <div class="studio-info">
            <div class="studio-name">${invoice.clientName}</div>
            <div class="artist-name">Invoice from business</div>
          </div>
          <div class="amount-box">
            <div class="amount-label">Amount Due</div>
            <div class="amount-due">${amount}</div>
          </div>
        </div>
        <div class="invoice-details">
          ${
            invoice.id
              ? `<div class="detail-row">
              <div class="detail-label">Invoice Number</div>
              <div class="detail-value">${invoice.id.substring(0, 8).toUpperCase()}</div>
            </div>`
              : ''
          }
          ${
            issueDate
              ? `<div class="detail-row">
              <div class="detail-label">Issue Date</div>
              <div class="detail-value">${issueDate}</div>
            </div>`
              : ''
          }
        </div>
      </div>
    </div>

    <div class="cta-section">
      <a href="${invoice.hostedUrl}" class="cta-button">Pay Invoice</a>
      <div class="cta-subtext">
        Can't click? Copy and paste this link:<br>
        <span class="payment-link">${invoice.hostedUrl}</span>
      </div>
    </div>

    ${
      itemCount > 0
        ? `<div class="content">
      <div class="invoice-items">
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th class="item-qty">Qty</th>
              <th class="item-price">Price</th>
            </tr>
          </thead>
          <tbody>
            ${Array.isArray(invoice.lines)
              ? invoice.lines
                  .map(
                    (line) => `
              <tr>
                <td class="item-name">${line.name}</td>
                <td class="item-qty">${line.quantity}</td>
                <td class="item-price">${new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(line.unitCents / 100)}</td>
              </tr>
            `
                  )
                  .join('')
              : ''}
          </tbody>
        </table>
      </div>
      <div class="total-section">
        <div class="total-row final">
          <span>Total Due</span>
          <span>${amount}</span>
        </div>
      </div>
    </div>`
        : ''
    }

    <div class="footer">
      <p>Questions about this invoice? <a href="mailto:support@example.com" class="footer-link">Contact us</a></p>
      <p style="margin-top: 12px; color: #999;">
        This invoice was sent to ${invoice.clientEmail}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function generateInvoiceEmailText(invoice: typeof studioInvoices.$inferSelect): string {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(invoice.totalCents / 100);

  const issueDate = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  let text = `INVOICE PAYMENT
${'='.repeat(50)}

Amount Due: ${amount}

Invoice Number: ${invoice.id ? invoice.id.substring(0, 8).toUpperCase() : 'N/A'}
${issueDate ? `Issue Date: ${issueDate}` : ''}

${'='.repeat(50)}

PAY INVOICE

Please visit this link to complete payment:
${invoice.hostedUrl}

${'='.repeat(50)}`;

  if (Array.isArray(invoice.lines) && invoice.lines.length > 0) {
    text += `\n\nITEMS\n${'-'.repeat(50)}\n`;
    invoice.lines.forEach((line) => {
      const price = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(line.unitCents / 100);
      text += `${line.name}
  Qty: ${line.quantity} × ${price}
`;
    });
    text += `${'-'.repeat(50)}\nTotal: ${amount}\n`;
  }

  text += `
${'='.repeat(50)}

This invoice was sent to: ${invoice.clientEmail}
Have questions? Contact support or reply to this email.`;

  return text;
}

