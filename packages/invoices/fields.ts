import {getTableColumns,sql} from 'drizzle-orm';
import {studioInvoices} from '@/packages/db/src/schema';

// Invoice reads must work before the optional email migration is applied.
const { emailStatus, emailProviderId, ...baseColumns } = getTableColumns(studioInvoices);
export const invoiceFields = {
 ...baseColumns,
 emailStatus: sql<string>`coalesce(to_jsonb(${studioInvoices})->>${emailStatus.name}, 'NOT_SENT')`,
 emailProviderId: sql<string | null>`to_jsonb(${studioInvoices})->>${emailProviderId.name}`,
};
