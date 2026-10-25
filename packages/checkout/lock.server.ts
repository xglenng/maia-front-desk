import {sql} from 'drizzle-orm';
import {db} from '@/packages/db/src';
// Cash and card attempts for one request share a transaction lock.
export async function lockCheckout(tx:Parameters<Parameters<typeof db.transaction>[0]>[0],organizationId:string,requestId:string){
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId+':'+requestId},0))`);
}
