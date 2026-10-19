import { NextRequest, NextResponse } from 'next/server';
import { identity } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { modelCost, monthRange, platformAdmin, smsSegments } from '@/packages/usage/metrics';

export async function GET(request: NextRequest) {
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const user = await identity(request);
  if (!user) return respond({ error: 'Sign in required.' }, 401);
  const platform = request.nextUrl.searchParams.get('scope') === 'platform';
  const isAdmin = platformAdmin(user.id);
  if (platform && !isAdmin) return respond({ error: 'Platform administrator access required.' }, 403);
  if (!platform && !['OWNER', 'ARTIST'].includes(user.role)) return respond({ error: 'Access denied.' }, 403);
  let range;
  const month = request.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7);
  try { range = monthRange(month); } catch { return respond({ error: 'Use YYYY-MM for month.' }, 400); }
  try {
    const params = [platform ? null : user.organization_id, !platform && user.role === 'ARTIST' ? user.id : null, range.start, range.end];
    // All aggregates originate from authorized artists. Tenant joins also protect malformed legacy records.
    const artists = await pool.query(`SELECT a.id, a.display_name, o.name AS studio FROM artists a JOIN organizations o ON o.id=a.organization_id WHERE ($1::uuid IS NULL OR a.organization_id=$1) AND ($2::uuid IS NULL OR a.user_id=$2) ORDER BY o.name,a.display_name`, params.slice(0,2));
    const runs = await pool.query(`SELECT c.artist_id, r.model, count(*)::int AS runs, count(*) FILTER (WHERE r.input_tokens IS NULL OR r.output_tokens IS NULL)::int AS missing, coalesce(sum(r.input_tokens),0)::float8 AS input, coalesce(sum(r.output_tokens),0)::float8 AS output FROM agent_runs r JOIN conversations c ON c.id=r.conversation_id JOIN artists a ON a.id=c.artist_id AND a.organization_id=c.organization_id WHERE ($1::uuid IS NULL OR c.organization_id=$1) AND ($2::uuid IS NULL OR a.user_id=$2) AND r.created_at >= $3 AND r.created_at < $4 GROUP BY c.artist_id,r.model`, params);
    const sms = await pool.query(`SELECT c.artist_id,m.content,m.metadata,m.role FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN artists a ON a.id=c.artist_id AND a.organization_id=c.organization_id WHERE ($1::uuid IS NULL OR c.organization_id=$1) AND ($2::uuid IS NULL OR a.user_id=$2) AND c.channel='SMS' AND m.created_at >= $3 AND m.created_at < $4`, params);
    return respond({ month, timezone: 'UTC', platformAdmin: isAdmin, artists: artists.rows.map(artist => {
      const models = runs.rows.filter(row => row.artist_id === artist.id).map(row => ({ ...row, estimatedCostUsd: row.missing ? null : modelCost(row.model, row.input, row.output) }));
      const messages = sms.rows.filter(row => row.artist_id === artist.id && !['failed','undelivered','submitting'].includes(row.metadata?.status || row.metadata?.apiStatus));
      const media = messages.filter(row => row.metadata?.attachments?.length);
      const texts = messages.filter(row => !row.metadata?.attachments?.length);
      return { ...artist, models, aiRuns: models.reduce((sum,row) => sum+row.runs,0), inputTokens: models.reduce((sum,row) => sum+row.input,0), outputTokens: models.reduce((sum,row) => sum+row.output,0), estimatedCostUsd: models.some(row => row.estimatedCostUsd === null) ? null : models.reduce((sum,row) => sum+(row.estimatedCostUsd || 0),0), smsMessages: texts.length, estimatedSmsSegments: texts.reduce((sum,row) => sum+smsSegments(row.content),0), mmsMessages: media.length };
    }) });
  } catch { return respond({ error: 'Usage data could not be loaded.' }, 500); }
}
