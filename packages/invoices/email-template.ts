import { z } from 'zod';
import type { studioInvoices } from '@/packages/db/src/schema';
import type { InvoiceDelivery } from './delivery';

const lineItems = z.array(z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitCents: z.number().int().nonnegative(),
}));

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function date(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  const value = new Date(timestamp * 1000);
  if (!Number.isFinite(value.getTime())) throw new Error('Stripe invoice date is invalid.');
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(value);
}

export function invoiceEmailTemplate(invoice: typeof studioInvoices.$inferSelect, studioName: string, recipient: string, delivery: InvoiceDelivery, hasLogo: boolean) {
  const lines = lineItems.safeParse(invoice.lines);
  if (!lines.success) throw new Error('Invoice items are invalid. Review the invoice before sending.');
  const issued = date(delivery.finalizedAt);
  const due = date(delivery.dueAt);
  const amount = money(delivery.amountRemaining);
  const paymentUrl = escapeHtml(delivery.paymentUrl);
  const pdfUrl = delivery.pdfUrl ? escapeHtml(delivery.pdfUrl) : null;
  const items = lines.data.map(line => `<tr><td style="padding:12px 0;color:#29343e;font-size:14px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(line.name)}${line.quantity > 1 ? ` <span style="color:#6b7280">× ${line.quantity} @ ${money(line.unitCents)}</span>` : ''}</td><td align="right" style="padding:12px 0;color:#29343e;font-size:14px;font-weight:bold;white-space:nowrap">${money(line.quantity * line.unitCents)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice</title></head>
<body style="margin:0;background:#f3f4f5;font-family:Arial,Helvetica,sans-serif;color:#29343e">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f5"><tr><td align="center" style="padding:16px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff">
<tr><td style="height:72px;background:#293b48"></td></tr>
<tr><td style="padding:0 24px 32px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 0 0">
${hasLogo ? `<img src="cid:studio-logo" alt="${escapeHtml(studioName)} logo" width="120" style="display:block;max-width:120px;max-height:80px;width:auto;height:auto;margin:0 auto 16px">` : ''}
<p style="margin:0 0 12px;font-size:16px;font-weight:bold">${escapeHtml(studioName)}</p>
<p style="margin:0 0 18px;font-size:15px;color:#6b7280">Invoice</p>
<p style="margin:0;font-size:36px;font-weight:bold;line-height:1.2">${amount}</p>
${due ? `<p style="margin:8px 0 0;font-size:14px;color:#6b7280">Payment due ${due} (UTC)</p>` : ''}
</td></tr><tr><td align="center" style="padding:24px 0"><a href="${paymentUrl}" style="display:block;background:#293b48;color:#fff;text-align:center;text-decoration:none;border-radius:5px;padding:16px;font-size:15px;font-weight:bold">Pay invoice</a></td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding-top:22px;font-size:14px;line-height:1.55">
${delivery.invoiceNumber ? `<p style="margin:0 0 16px"><strong>Invoice ${escapeHtml(delivery.invoiceNumber)}</strong>${issued ? `<br>${issued} (UTC)` : ''}</p>` : issued ? `<p style="margin:0 0 16px"><strong>Issued</strong><br>${issued} (UTC)</p>` : ''}
<p style="margin:0 0 16px;overflow-wrap:anywhere;word-break:break-word"><strong>Customer</strong><br>${escapeHtml(invoice.clientName)}${invoice.clientEmail ? `<br>${escapeHtml(invoice.clientEmail)}` : ''}</p>
${pdfUrl ? `<p style="margin:0 0 20px"><a href="${pdfUrl}" style="color:#0668b3;text-decoration:underline">Download invoice PDF</a></p>` : ''}
</td></tr><tr><td style="border:1px solid #e5e7eb;border-radius:5px;padding:20px">
<p style="margin:0 0 10px;font-size:15px;font-weight:bold">Invoice summary</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}<tr><td colspan="2" style="border-top:1px solid #e5e7eb"></td></tr><tr><td style="padding-top:16px;font-size:14px;font-weight:bold">Amount due</td><td align="right" style="padding-top:16px;font-size:14px;font-weight:bold">${amount}</td></tr></table>
</td></tr></table><p style="margin:22px 0 0;color:#6b7280;font-size:12px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word">This invoice was sent to ${escapeHtml(recipient)}. Questions? Contact ${escapeHtml(studioName)}.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${studioName}\nInvoice\nAmount due: ${amount}${due ? `\nPayment due ${due} (UTC)` : ''}${delivery.invoiceNumber ? `\nInvoice ${delivery.invoiceNumber}` : ''}${issued ? `\nIssued ${issued} (UTC)` : ''}\nCustomer: ${invoice.clientName}\n\nPay invoice: ${delivery.paymentUrl}${delivery.pdfUrl ? `\nDownload invoice PDF: ${delivery.pdfUrl}` : ''}\n\nInvoice summary\n${lines.data.map(line => `${line.name}${line.quantity > 1 ? ` × ${line.quantity} @ ${money(line.unitCents)}` : ''}: ${money(line.quantity * line.unitCents)}`).join('\n')}\nAmount due: ${amount}\n\nThis invoice was sent to ${recipient}. Questions? Contact ${studioName}.`;
  return { html, text };
}
