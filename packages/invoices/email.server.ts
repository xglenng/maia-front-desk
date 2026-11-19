import { createHash } from 'node:crypto';
import { db } from '@/packages/db/src';
import { studioInvoices, organizations, studioLogoAssets } from '@/packages/db/src/schema';
import { eq, and } from 'drizzle-orm';
import { Resend } from 'resend';
import sharp from 'sharp';
import { z } from 'zod';
import { invoiceEmailTemplate } from './email-template';
import { pdfUnavailableWarning, type InvoiceDelivery } from './delivery';

function extractPostgresError(error: unknown): { code?: string; message?: string; cause?: unknown } {
  if (!(error instanceof Error)) return {};
  const value = error as Error & { code?: string; detail?: unknown; hint?: unknown };
  if (value.code) return { code: value.code, message: error.message, cause: value.detail || value.hint };
  if (error.cause instanceof Error) return extractPostgresError(error.cause);
  return {};
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(apiKey);
}

function invoiceSender(configuredFrom: string, studioName: string | undefined) {
  const match = configuredFrom.match(/^(?:[^<>\r\n]*<([^<>\s]+)>|([^<>\s]+))$/);
  const address = match?.[1] || match?.[2];
  if (!address || !z.string().email().safeParse(address).success) {
    throw new Error('Invoice email is unavailable. Configure a valid verified email sender.');
  }
  const name = studioName?.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, ' ').trim();
  if (!name) throw new Error('Invoice email is unavailable. Configure the studio name.');
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${address}>`;
}

async function getInvoiceContext(invoice: typeof studioInvoices.$inferSelect) {
  const [org] = await db.select({ name: organizations.name, publicName: organizations.publicName })
    .from(organizations).where(eq(organizations.id, invoice.organizationId)).limit(1);
  const [logo] = await db.select({ data: studioLogoAssets.data, byteLength: studioLogoAssets.byteLength, sha256: studioLogoAssets.sha256 })
    .from(studioLogoAssets).where(and(eq(studioLogoAssets.organizationId, invoice.organizationId), eq(studioLogoAssets.active, true))).limit(1);
  return { org, logo };
}

export async function sendInvoiceEmail(
  invoice: typeof studioInvoices.$inferSelect,
  recipientEmail: string | undefined,
  delivery: InvoiceDelivery,
) {
  const email = recipientEmail || invoice.clientEmail;
  if (!email) throw new Error('Client email is required to send invoice.');
  if (invoice.emailStatus === 'SENT') return { invoice, message: 'Invoice already sent by email.' };
  if (!invoice.hostedUrl) throw new Error('Payment link must be created before sending by email.');
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!from) throw new Error('Invoice email is unavailable. Configure the verified email sender.');

  try {
    await db.update(studioInvoices).set({ emailStatus: 'SENDING', updatedAt: new Date() }).where(eq(studioInvoices.id, invoice.id));
  } catch (error) {
    const pgError = extractPostgresError(error);
    if (pgError.code === '42703' && pgError.message?.includes('email_status')) {
      throw new Error('Invoice email is not yet available. The database migration is pending.');
    }
    if (pgError.code) {
      console.error('Invoice email update failed', { errorCode: pgError.code, errorMessage: pgError.message, invoiceId: invoice.id });
    }
    throw error;
  }

  try {
    const { org, logo } = await getInvoiceContext(invoice);
    const studioName = org?.publicName?.trim() || org?.name?.trim();
    const sender = invoiceSender(from, studioName);
    if (!studioName) throw new Error('Invoice email is unavailable. Configure the studio name.');
    let logoPng: Buffer | undefined;
    if (logo) {
      const bytes = Buffer.from(logo.data, 'base64');
      if (bytes.length !== logo.byteLength || createHash('sha256').update(bytes).digest('hex') !== logo.sha256) {
        throw new Error('The studio logo could not be verified. Check studio branding before sending.');
      }
      try {
        logoPng = await sharp(bytes).resize({ width: 320, height: 160, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      } catch {
        console.error('Invoice studio logo conversion failed.');
        throw new Error('The studio logo could not be displayed. Check studio branding before sending.');
      }
    }
    const content = invoiceEmailTemplate(invoice, studioName, email, delivery, Boolean(logoPng));
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: sender,
      to: email,
      subject: 'Invoice Payment Required',
      ...content,
      ...(logoPng ? { attachments: [{ filename: 'studio-logo.png', content: logoPng, contentType: 'image/png', contentId: 'studio-logo' }] } : {}),
      headers: { 'Idempotency-Key': `invoice-${invoice.id}-${email.toLowerCase()}` },
    });

    if (error) {
      console.error('Invoice email provider rejected send', { code: error.name });
      await db.update(studioInvoices).set({ emailStatus: 'UNKNOWN', updatedAt: new Date() }).where(eq(studioInvoices.id, invoice.id));
      throw new Error('Email could not be sent. Please try again or contact support.');
    }
    const [updated] = await db.update(studioInvoices).set({
      emailStatus: 'SENT', emailProviderId: data?.id, updatedAt: new Date(),
    }).where(eq(studioInvoices.id, invoice.id)).returning();
    return { invoice: updated, message: `Invoice sent successfully.${pdfUnavailableWarning(delivery)}` };
  } catch (error) {
    try {
      await db.update(studioInvoices).set({ emailStatus: 'NOT_SENT', updatedAt: new Date() }).where(eq(studioInvoices.id, invoice.id));
    } catch {
      // If reset fails, don't mask the original error.
    }
    throw error;
  }
}
