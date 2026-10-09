import { and, eq, sql } from 'drizzle-orm';
import { db } from '@db';
import { a2pCampaigns, legalCustomers, legalCustomerAccounts, phoneNumbers, twilioAccounts, twilioMessagingServices, users } from '@db/schema';
import type { Identity } from '@/packages/auth/server';

export class LegalCustomerConflict extends Error {}
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function ownerTransaction<T>(actor: Identity, work: (tx: Transaction) => Promise<T>) {
  if (actor.role !== 'OWNER') throw new LegalCustomerConflict('Studio owner review is required.');
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`legal-customer:${actor.organization_id}`}, 0))`);
    const [owner] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, actor.id), eq(users.organizationId, actor.organization_id), eq(users.role, 'OWNER'))).limit(1);
    if (!owner) throw new LegalCustomerConflict('Studio owner review is required.');
    return work(tx);
  });
}
export async function createLegalCustomer(actor: Identity, input: { legalName: string; customerType: 'STUDIO' | 'INDEPENDENT_BUSINESS' }) {
  const legalName = input.legalName.trim();
  if (!legalName || legalName.length > 200 || !['STUDIO', 'INDEPENDENT_BUSINESS'].includes(input.customerType)) throw new LegalCustomerConflict('Valid legal business identity is required.');
  return ownerTransaction(actor, async tx => {
    const [existing] = await tx.select().from(legalCustomers).where(eq(legalCustomers.organizationId, actor.organization_id)).limit(1);
    if (existing) {
      if (existing.legalName !== legalName || existing.customerType !== input.customerType) throw new LegalCustomerConflict('Legal identity already exists. Changes require a separate reviewed correction.');
      return existing;
    }
    return (await tx.insert(legalCustomers).values({ organizationId: actor.organization_id, legalName, customerType: input.customerType }).returning())[0];
  });
}
export async function bindLegalCustomerAccount(actor: Identity, input: { legalCustomerId: string; twilioAccountId: string; verificationReference: string }) {
  const reference = input.verificationReference.trim();
  if (!reference || reference.length > 300) throw new LegalCustomerConflict('A review reference is required.');
  return ownerTransaction(actor, async tx => {
    const [customer] = await tx.select().from(legalCustomers).where(and(eq(legalCustomers.id, input.legalCustomerId), eq(legalCustomers.organizationId, actor.organization_id))).limit(1);
    const accounts = await tx.select().from(twilioAccounts).where(eq(twilioAccounts.organizationId, actor.organization_id)).limit(2);
    if (!customer || accounts.length !== 1 || accounts[0].id !== input.twilioAccountId || accounts[0].status !== 'ACTIVE' || !/^AC[0-9a-f]{32}$/i.test(accounts[0].accountSid)) {
      throw new LegalCustomerConflict('A single active tenant-bound live account is required. Ambiguous legacy accounts need separate review.');
    }
    for (const table of [twilioMessagingServices, phoneNumbers, a2pCampaigns]) {
      const rows = await tx.select({ accountId: table.twilioAccountId }).from(table).where(eq(table.organizationId, actor.organization_id));
      if (rows.some(row => row.accountId !== input.twilioAccountId)) throw new LegalCustomerConflict('Existing resources do not share the reviewed owning account.');
    }
    const [existing] = await tx.select().from(legalCustomerAccounts).where(eq(legalCustomerAccounts.organizationId, actor.organization_id)).limit(1);
    if (existing) {
      if (existing.legalCustomerId !== customer.id || existing.twilioAccountId !== input.twilioAccountId) throw new LegalCustomerConflict('Existing binding cannot be replaced by this command.');
      return existing; // Preserve the original review evidence on replay.
    }
    return (await tx.insert(legalCustomerAccounts).values({ organizationId: actor.organization_id, legalCustomerId: customer.id, twilioAccountId: input.twilioAccountId, verifiedByUserId: actor.id, verifiedAt: new Date(), verificationReference: reference }).returning())[0];
  });
}
/** Server-side resolution; never returns credentials to a client. */
export async function resolveLegalCustomerAccount(organizationId: string) {
  const rows = await db.select({ legalCustomerId: legalCustomers.id, accountId: twilioAccounts.id, accountSid: twilioAccounts.accountSid, status: twilioAccounts.status })
    .from(legalCustomerAccounts)
    .innerJoin(legalCustomers, and(eq(legalCustomerAccounts.legalCustomerId, legalCustomers.id), eq(legalCustomerAccounts.organizationId, legalCustomers.organizationId)))
    .innerJoin(twilioAccounts, and(eq(legalCustomerAccounts.twilioAccountId, twilioAccounts.id), eq(legalCustomerAccounts.organizationId, twilioAccounts.organizationId)))
    .where(eq(legalCustomerAccounts.organizationId, organizationId)).limit(2);
  if (rows.length !== 1 || rows[0].status !== 'ACTIVE' || !/^AC[0-9a-f]{32}$/i.test(rows[0].accountSid)) throw new LegalCustomerConflict('An explicit active legal-customer account binding is required.');
  return rows[0];
}
