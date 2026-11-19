export type InvoiceDelivery = {
  paymentUrl: string;
  pdfUrl: string | null;
  amountRemaining: number;
  dueAt: number | null;
  finalizedAt: number | null;
  invoiceNumber: string | null;
};

function stripeInvoiceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['invoice.stripe.com', 'pay.stripe.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function invoiceDelivery(invoice: {
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  amount_remaining: number;
  due_date: number | null;
  status_transitions: { finalized_at: number | null };
  number: string | null;
}): InvoiceDelivery {
  const paymentUrl = stripeInvoiceUrl(invoice.hosted_invoice_url);
  if (!paymentUrl || !Number.isSafeInteger(invoice.amount_remaining) || invoice.amount_remaining < 0) {
    throw new Error('Stripe invoice details are unavailable. Refresh the invoice and retry.');
  }
  const pdfUrl = stripeInvoiceUrl(invoice.invoice_pdf);
  if (invoice.invoice_pdf && !pdfUrl) console.error('Stripe returned an invalid invoice PDF URL.');
  return {
    paymentUrl,
    pdfUrl,
    amountRemaining: invoice.amount_remaining,
    dueAt: invoice.due_date,
    finalizedAt: invoice.status_transitions.finalized_at,
    invoiceNumber: invoice.number,
  };
}

export function pdfUnavailableWarning(delivery: InvoiceDelivery): string {
  return delivery.pdfUrl ? '' : ' Stripe has not provided the invoice PDF yet; no PDF link was included.';
}
