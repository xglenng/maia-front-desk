import { getTableColumns } from 'drizzle-orm';
import { automationJobs } from '@db/schema';

/** Raw pg rows use SQL column names; Drizzle queries already map these names. */
export function mapClaimedAutomationJob(row: Record<string, unknown>): typeof automationJobs.$inferSelect {
  const mapped: Record<string, unknown> = {};
  for (const [property, column] of Object.entries(getTableColumns(automationJobs))) {
    if (!Object.hasOwn(row, column.name)) throw new Error('Incomplete automation claim row');
    const value = row[column.name];
    if (value == null && column.notNull) throw new Error('Invalid automation claim row');
    const decoded = value == null ? value : column.mapFromDriverValue(value);
    if (decoded instanceof Date && !Number.isFinite(decoded.getTime())) throw new Error('Invalid automation claim date');
    mapped[property] = decoded;
  }
  return mapped as typeof automationJobs.$inferSelect;
}
