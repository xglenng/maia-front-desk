import {pool} from '@/packages/db/src';

// Check on each request so a migration becomes visible without a process restart.
// Do not catch other database failures or widen the artist scope as a fallback.
export async function artistClientsReady():Promise<boolean>{
 const result=await pool.query("SELECT to_regclass('artist_clients') IS NOT NULL AS ready");
 return result.rows[0]?.ready===true;
}
