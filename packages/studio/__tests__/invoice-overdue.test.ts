import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInvoiceOverdue,
  getOverdueSinceDate,
} from "../../invoices/overdue";

test("invoice overdue status - open invoice with past due date is overdue", () => {
  const daysAgo = 2;
  const issueDate = new Date();
  issueDate.setDate(issueDate.getDate() - daysAgo);

  const invoice = {
    status: "OPEN" as const,
    issuingAt: issueDate,
    createdAt: issueDate,
    dueDays: 1,
  };

  assert.equal(isInvoiceOverdue(invoice), true);
});

test("invoice overdue status - open invoice with future due date is not overdue", () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);

  const invoice = {
    status: "OPEN" as const,
    issuingAt: futureDate,
    createdAt: futureDate,
    dueDays: 7,
  };

  assert.equal(isInvoiceOverdue(invoice), false);
});

test("invoice overdue status - non-open invoices are never overdue", () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 10);

  const invoice = {
    status: "PAID" as const,
    issuingAt: pastDate,
    createdAt: pastDate,
    dueDays: 1,
  };

  assert.equal(isInvoiceOverdue(invoice), false);
});

test("invoice overdue status - draft invoices are never overdue", () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 10);

  const invoice = {
    status: "DRAFT" as const,
    issuingAt: null,
    createdAt: pastDate,
    dueDays: 1,
  };

  assert.equal(isInvoiceOverdue(invoice), false);
});

test("invoice overdue status - uses issuingAt if available, otherwise createdAt", () => {
  const createdDate = new Date();
  createdDate.setDate(createdDate.getDate() - 10);

  const issuedDate = new Date();
  issuedDate.setDate(issuedDate.getDate() - 2);

  const invoiceWithIssuing = {
    status: "OPEN" as const,
    issuingAt: issuedDate,
    createdAt: createdDate,
    dueDays: 1,
  };

  assert.equal(isInvoiceOverdue(invoiceWithIssuing), true);

  const invoiceWithoutIssuing = {
    status: "OPEN" as const,
    issuingAt: null,
    createdAt: createdDate,
    dueDays: 1,
  };

  assert.equal(isInvoiceOverdue(invoiceWithoutIssuing), true);
});

test("invoice overdue since date - returns null if not overdue", () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);

  const invoice = {
    status: "OPEN" as const,
    issuingAt: futureDate,
    createdAt: futureDate,
    dueDays: 7,
  };

  const result = getOverdueSinceDate(invoice);
  assert.equal(result, null);
});

test("invoice overdue since date - returns due date if overdue", () => {
  const issueDate = new Date();
  issueDate.setDate(issueDate.getDate() - 2);
  issueDate.setHours(0, 0, 0, 0);

  const invoice = {
    status: "OPEN" as const,
    issuingAt: issueDate,
    createdAt: issueDate,
    dueDays: 1,
  };

  const result = getOverdueSinceDate(invoice);
  assert.ok(result !== null);

  // Due date should be issueDate + dueDays
  const expectedDueDate = new Date(issueDate);
  expectedDueDate.setDate(expectedDueDate.getDate() + 1);
  expectedDueDate.setHours(0, 0, 0, 0);

  assert.equal(result?.getTime(), expectedDueDate.getTime());
});

test("invoice overdue status - boundary case (due date is today)", () => {
  const issueDate = new Date();
  issueDate.setDate(issueDate.getDate() - 1);
  issueDate.setHours(0, 0, 0, 0);

  const invoice = {
    status: "OPEN" as const,
    issuingAt: issueDate,
    createdAt: issueDate,
    dueDays: 1,
  };

  // If due date is today, it's not yet overdue
  assert.equal(isInvoiceOverdue(invoice), false);
});

test("invoice overdue status - boundary case (due date is tomorrow)", () => {
  const issueDate = new Date();
  issueDate.setDate(issueDate.getDate() - 1);
  issueDate.setHours(0, 0, 0, 0);

  const invoice = {
    status: "OPEN" as const,
    issuingAt: issueDate,
    createdAt: issueDate,
    dueDays: 2,
  };

  assert.equal(isInvoiceOverdue(invoice), false);
});
