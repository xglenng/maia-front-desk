/**
 * Calculate if an invoice is overdue based on its due date and status.
 * Only OPEN invoices with unpaid balance can be overdue.
 */
export function isInvoiceOverdue(invoice: {
  status: string;
  issuingAt: Date | null;
  createdAt: Date;
  dueDays: number;
}): boolean {
  // Only OPEN invoices can be overdue
  if (invoice.status !== 'OPEN') {
    return false;
  }

  // Calculate due date: issuing_at + dueDays, or created_at + dueDays for drafts
  const dateToUse = invoice.issuingAt || invoice.createdAt;
  const dueDate = new Date(dateToUse);
  dueDate.setDate(dueDate.getDate() + invoice.dueDays);

  // Check if today is past the due date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  return today > dueDate;
}

/**
 * Get the overdue start date for an invoice.
 * Returns null if the invoice is not overdue.
 */
export function getOverdueSinceDate(invoice: {
  status: string;
  issuingAt: Date | null;
  createdAt: Date;
  dueDays: number;
}): Date | null {
  if (!isInvoiceOverdue(invoice)) {
    return null;
  }

  const dateToUse = invoice.issuingAt || invoice.createdAt;
  const dueDate = new Date(dateToUse);
  dueDate.setDate(dueDate.getDate() + invoice.dueDays);
  return dueDate;
}
