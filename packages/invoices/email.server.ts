import { db } from '@/packages/db/src';
import { studioInvoices, artists, organizations, studioLogoAssets } from '@/packages/db/src/schema';
import { eq, and } from 'drizzle-orm';
import { Resend } from 'resend';

// Extract PostgreSQL error details from Drizzle ORM errors
// PostgreSQL error codes: 42703 = column not found, 42P01 = table not found, etc.
function extractPostgresError(error: unknown): {
  code?: string;
  message?: string;
  cause?: unknown;
} {
  if (!(error instanceof Error)) {
    return {};
  }

  const anyError = error as any;

  if (anyError.code) {
    return {
      code: anyError.code,
      message: error.message,
      cause: anyError.detail || anyError.hint,
    };
  }

  if ('cause' in error && error.cause instanceof Error) {
    return extractPostgresError(error.cause);
  }

  return {};
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

// Get invoice context data: artist, organization, and logo
async function getInvoiceContext(invoice: typeof studioInvoices.$inferSelect) {
  const artist = await db
    .select({ id: artists.id, displayName: artists.displayName })
    .from(artists)
    .where(eq(artists.id, invoice.artistId))
    .limit(1)
    .then((rows) => rows[0]);

  const org = await db
    .select({ id: organizations.id, name: organizations.name, publicName: organizations.publicName })
    .from(organizations)
    .where(eq(organizations.id, invoice.organizationId))
    .limit(1)
    .then((rows) => rows[0]);

  const logo = await db
    .select({ data: studioLogoAssets.data })
    .from(studioLogoAssets)
    .where(and(eq(studioLogoAssets.organizationId, invoice.organizationId), eq(studioLogoAssets.active, true)))
    .limit(1)
    .then((rows) => rows[0]?.data);

  return { artist, org, logo };
}

function generateInvoiceEmailHtml(
  invoice: typeof studioInvoices.$inferSelect,
  artistName?: string,
  orgName?: string,
  logoData?: string
): string {
  // Get business name: artist display name or studio name
  const businessName = artistName || orgName || 'Your Studio';

  // Format currency
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(invoice.totalCents / 100);

  // Use issuing_at if available (issued invoice), otherwise createdAt (draft)
  const dateToUse = invoice.issuingAt || invoice.createdAt;
  const issueDate = dateToUse
    ? new Date(dateToUse).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Calculate due date
  const dueDate = dateToUse
    ? new Date(dateToUse.getTime() + invoice.dueDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Use Stripe invoice number if available, otherwise indicate draft
  const invoiceNumber = invoice.stripeInvoiceId || `DRAFT-${invoice.id.substring(0, 8).toUpperCase()}`;

  // Format line items with totals
  const lineItemsHtml = Array.isArray(invoice.lines)
    ? invoice.lines
        .map((line) => {
          const unitPrice = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(line.unitCents / 100);
          const lineTotal = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format((line.quantity * line.unitCents) / 100);
          return `
            <tr>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; color: #2c2c2c; font-weight: 500;">${line.name}</td>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; color: #666; text-align: center;">${line.quantity}</td>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; color: #2c2c2c; text-align: right;">${unitPrice}</td>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; color: #2c2c2c; text-align: right; font-weight: 600;">${lineTotal}</td>
            </tr>
          `;
        })
        .join('')
    : '';

  const logoHtml = logoData ? `<div style="text-align: left; margin-bottom: 24px;"><img src="data:image/webp;base64,${logoData}" alt="Logo" style="max-width: 120px; height: auto; display: block;"></div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.6; color: #2c2c2c; margin: 0; padding: 0; background-color: #f9f9f9; }
    .wrapper { background-color: #f9f9f9; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #fff; border-radius: 8px; overflow: hidden; }
    .logo-section { padding: 32px 24px; border-bottom: 1px solid #e9e9e9; }
    .business-section { padding: 32px 24px; border-bottom: 1px solid #e9e9e9; }
    .business-name { font-size: 24px; font-weight: 700; color: #000; margin-bottom: 24px; }
    .info-row { margin-bottom: 16px; }
    .info-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .info-value { font-size: 14px; color: #2c2c2c; font-weight: 500; }
    .amount-section { padding: 32px 24px; background-color: #f0f0f0; border-bottom: 1px solid #e9e9e9; }
    .amount-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .amount-value { font-size: 32px; font-weight: 700; color: #000; }
    .cta-section { padding: 32px 24px; text-align: center; background-color: #fff; border-bottom: 1px solid #e9e9e9; }
    .cta-button { display: inline-block; background-color: #000; color: #fff; padding: 16px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin-bottom: 16px; }
    .cta-button:hover { background-color: #222; }
    .payment-link-text { font-size: 12px; color: #0066cc; word-break: break-all; }
    .items-section { padding: 32px 24px; border-bottom: 1px solid #e9e9e9; }
    .items-title { font-size: 14px; font-weight: 600; color: #000; margin-bottom: 16px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .items-table th { text-align: left; padding: 12px 8px; border-bottom: 2px solid #333; color: #666; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .items-table th:nth-child(2) { text-align: center; }
    .items-table th:nth-child(3), .items-table th:nth-child(4) { text-align: right; }
    .total-section { padding: 20px 8px; border-top: 2px solid #333; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
    .total-row.final { font-size: 16px; font-weight: 700; color: #000; padding-top: 12px; }
    .footer { padding: 24px; background-color: #f9f9f9; border-top: 1px solid #e9e9e9; text-align: center; color: #666; font-size: 12px; }
    .bill-to-section { margin-top: 24px; }
    .bill-to-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .bill-to-value { font-size: 14px; color: #2c2c2c; }
    @media (max-width: 480px) {
      .container { border-radius: 0; }
      .logo-section, .business-section, .cta-section, .items-section, .footer { padding: 20px 16px; }
      .business-name { font-size: 20px; }
      .amount-value { font-size: 28px; }
      .cta-button { width: 100%; padding: 14px 24px; }
      .items-table { font-size: 12px; }
      .items-table th, .items-table td { padding: 10px 4px; }
      .payment-link-text { font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      ${logoHtml ? `<div class="logo-section">${logoHtml}</div>` : ''}

      <div class="business-section">
        <div class="business-name">${businessName}</div>

        <div class="info-row">
          <div class="info-label">Invoice Number</div>
          <div class="info-value">${invoiceNumber}</div>
        </div>

        ${
          issueDate
            ? `<div class="info-row">
          <div class="info-label">Issue Date</div>
          <div class="info-value">${issueDate}</div>
        </div>`
            : ''
        }

        ${
          dueDate
            ? `<div class="info-row">
          <div class="info-label">Due Date</div>
          <div class="info-value">${dueDate}</div>
        </div>`
            : ''
        }

        <div class="bill-to-section">
          <div class="bill-to-label">Bill To</div>
          <div class="bill-to-value">${invoice.clientName}</div>
          ${invoice.clientEmail ? `<div class="bill-to-value" style="margin-top: 4px;">${invoice.clientEmail}</div>` : ''}
        </div>
      </div>

      <div class="amount-section">
        <div class="amount-label">Amount Due</div>
        <div class="amount-value">${amount}</div>
      </div>

      <div class="cta-section">
        <a href="${invoice.hostedUrl}" class="cta-button">Pay Invoice</a>
        <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
          Can't click? Copy and paste this link:
        </div>
        <div class="payment-link-text">${invoice.hostedUrl}</div>
      </div>

      ${
        lineItemsHtml
          ? `<div class="items-section">
        <div class="items-title">Invoice Items</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>
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
        <p style="margin: 0 0 12px 0;">Questions about this invoice? Contact us for support.</p>
        <p style="margin: 0; color: #999;">
          This invoice was sent to ${invoice.clientEmail}
        </p>
      </div>
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

  const dateToUse = invoice.issuingAt || invoice.createdAt;
  const issueDate = dateToUse
    ? new Date(dateToUse).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const dueDate = dateToUse
    ? new Date(dateToUse.getTime() + invoice.dueDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const invoiceNumber = invoice.stripeInvoiceId || `DRAFT-${invoice.id.substring(0, 8).toUpperCase()}`;

  let text = `INVOICE PAYMENT
${'='.repeat(50)}

Amount Due: ${amount}

Invoice Number: ${invoiceNumber}
${issueDate ? `Issue Date: ${issueDate}` : ''}
${dueDate ? `Due Date: ${dueDate}` : ''}

${'='.repeat(50)}

PAY INVOICE

Please visit this link to complete payment:
${invoice.hostedUrl}

${'='.repeat(50)}`;

  if (Array.isArray(invoice.lines) && invoice.lines.length > 0) {
    text += `\n\nINVOICE ITEMS\n${'-'.repeat(50)}\n`;
    invoice.lines.forEach((line) => {
      const unitPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(line.unitCents / 100);
      const lineTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format((line.quantity * line.unitCents) / 100);
      text += `${line.name}\n  ${line.quantity} × ${unitPrice} = ${lineTotal}\n`;
    });
    text += `${'-'.repeat(50)}\nTOTAL: ${amount}\n`;
  }

  text += `\n\n${'-'.repeat(50)}\nThis invoice was sent to ${invoice.clientEmail}`;

  return text;
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

  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!from) {
    throw new Error('Invoice email is unavailable. Configure the verified email sender.');
  }

  // Update status to SENDING
  try {
    await db
      .update(studioInvoices)
      .set({ emailStatus: 'SENDING', updatedAt: new Date() })
      .where(eq(studioInvoices.id, invoice.id));
  } catch (error) {
    const pgError = extractPostgresError(error);

    if (pgError.code === '42703' && pgError.message?.includes('email_status')) {
      throw new Error('Invoice email is not yet available. The database migration is pending.');
    }

    if (pgError.code) {
      console.error('Invoice email update failed', {
        errorCode: pgError.code,
        errorMessage: pgError.message,
        invoiceId: invoice.id,
      });
    }

    throw error;
  }

  try {
    // Get context data
    const { artist, org, logo } = await getInvoiceContext(invoice);

    // Send via Resend
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from,
      to: email,
      subject: `Invoice Payment Required`,
      html: generateInvoiceEmailHtml(
        invoice,
        artist?.displayName,
        org?.publicName || org?.name,
        logo
      ),
      text: generateInvoiceEmailText(invoice),
      headers: {
        'Idempotency-Key': `invoice-${invoice.id}-${email.toLowerCase()}`,
      },
    });

    if (error) {
      console.error('Invoice email provider rejected send', { code: error.name });
      await db
        .update(studioInvoices)
        .set({ emailStatus: 'UNKNOWN', updatedAt: new Date() })
        .where(eq(studioInvoices.id, invoice.id));
      throw new Error(`Email could not be sent. Please try again or contact support.`);
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
