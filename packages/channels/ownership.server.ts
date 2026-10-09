import {and,eq,sql} from 'drizzle-orm';
import {db} from '@db/index';
import {channelConnections} from '@db/schema';
export class ChannelOwnershipConflict extends Error {}
export async function reserveChannelConnections(values:Array<typeof channelConnections.$inferInsert>) {
  const ordered=[...values].sort((a,b)=>`${a.provider}:${a.externalAccountId}`.localeCompare(`${b.provider}:${b.externalAccountId}`));
  return db.transaction(async tx=>{
    const results=[];
    for(const value of ordered) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`channel-owner:${value.provider}:${value.externalAccountId}`},0))`);
      const existing=await tx.select().from(channelConnections).where(and(eq(channelConnections.provider,value.provider),eq(channelConnections.externalAccountId,value.externalAccountId)));
      if(existing.length>1 || existing.some(row=>row.organizationId!==value.organizationId || row.artistId!==value.artistId)) {
        throw new ChannelOwnershipConflict('This social account is already assigned to another studio or artist. Contact support for a transfer.');
      }
      const update={displayName:value.displayName,accessTokenEncrypted:value.accessTokenEncrypted,metadata:value.metadata,status:value.status,lastCheckedAt:value.lastCheckedAt,lastError:value.lastError,updatedAt:new Date()};
      const result=existing[0] ? await tx.update(channelConnections).set(update).where(and(eq(channelConnections.id,existing[0].id),eq(channelConnections.organizationId,value.organizationId),eq(channelConnections.artistId,value.artistId))).returning() : await tx.insert(channelConnections).values(value).returning();
      results.push(result[0]);
    }
    return results;
  });
}

export async function resolveChannelRouting(provider:string,externalAccountId:string) {
  const matches=await db.select().from(channelConnections).where(and(eq(channelConnections.provider,provider),eq(channelConnections.externalAccountId,externalAccountId))).limit(2);
  if(matches.length>1)return {connection:null,reason:"ambiguous_connection"} as const;
  const connection=matches[0];
  if(!connection)return {connection:null,reason:"connection_not_found"} as const;
  if(connection.status!=="ACTIVE")return {connection:null,reason:"connection_not_active"} as const;
  return {connection,reason:null} as const;
}
