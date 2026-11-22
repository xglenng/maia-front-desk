import { createHash } from 'node:crypto';
import { and, eq, or, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/packages/auth/server';
import { publicIntakeLimit } from '@/packages/consent/rate-limit.server';
import { db } from '@/packages/db/src';
import { artists, requestAttachments, requestForms, requestNotifications, requestSubmissions, users } from '@/packages/db/src/schema';
import { nativeAnswers } from '@/packages/waivers/forms';
import { boundedBody } from '@/packages/waivers/bounded-body';
import { requestDefinition } from '@/packages/waivers/request-forms';
import { validateRequestAnswers } from '@/packages/waivers/request-validation';
import { identityImageStorageReady, MAX_ID_UPLOAD_BYTES, prepareIdentityImage } from '@/packages/waivers/identity-image.server';

const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);
const submission = z.object({token:tokenSchema, idempotencyKey:z.string().uuid(), version:z.number().int().positive(), answers:nativeAnswers});
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const headers = {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer'};

async function findForm(token: string) {
  const [form] = await db.select().from(requestForms).where(eq(requestForms.tokenHash,digest(token))).limit(1);
  return form;
}

export async function GET(request: NextRequest) {
  const token = tokenSchema.safeParse(request.nextUrl.searchParams.get('token'));
  if (!token.success) return NextResponse.json({error:'Request form not found.'},{status:404,headers});
  const form = await findForm(token.data);
  const definition = requestDefinition.safeParse(form?.definition);
  if (!form?.active || !definition.success) return NextResponse.json({error:'Request form not found.'},{status:404,headers});
  return NextResponse.json({name:form.name,definition:definition.data,version:form.version},{headers});
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({error:'Invalid request origin.'},{status:403,headers});
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data;')) return NextResponse.json({error:'Use a multipart form.'},{status:415,headers});
  let parsed: z.SafeParseReturnType<unknown, z.infer<typeof submission>>;
  const files = new Map<string, File>();
  try {
    const raw = await boundedBody(request, 3 * MAX_ID_UPLOAD_BYTES + 200000);
    const parts = await new Response(new Uint8Array(raw),{headers:{'content-type':contentType}}).formData();
    if (parts.getAll('payload').length !== 1 || typeof parts.get('payload') !== 'string') throw Error('Invalid payload');
    const payload = parts.get('payload');
    if (typeof payload !== 'string' || Buffer.byteLength(payload) > 150000) throw Error('Invalid payload');
    parsed = submission.safeParse(JSON.parse(payload));
    for (const [key,value] of parts.entries()) {
      if (key === 'payload') continue;
      if (!key.startsWith('image:') || typeof value === 'string' || files.has(key.slice(6)) || files.size >= 3 || !value.size || value.size > MAX_ID_UPLOAD_BYTES) throw Error('Invalid upload');
      files.set(key.slice(6),value);
    }
  } catch {
    return NextResponse.json({error:'Invalid form or image upload exceeds the limit.'},{status:400,headers});
  }
  if (!parsed.success) return NextResponse.json({error:'Check the request details.'},{status:400,headers});
  const values = parsed.data;
  const form = await findForm(values.token);
  if (!form) return NextResponse.json({error:'Request form not found.'},{status:404,headers});
  const limit = await publicIntakeLimit(form.id,'HOSTED');
  if (!limit.allowed) return NextResponse.json({error:'Too many submissions. Please try again later.'},{status:429,headers:{...headers,'Retry-After':String(limit.retryAfter)}});
  const fileDigests = await Promise.all([...files.entries()].map(async ([id,file]) => [id,digest(Buffer.from(await file.arrayBuffer()))] as const));
  fileDigests.sort(([a],[b]) => a.localeCompare(b));
  const sortedAnswers = Object.fromEntries(Object.entries(values.answers).sort(([a],[b]) => a.localeCompare(b)));
  const payloadHash = digest(JSON.stringify({version:values.version,answers:sortedAnswers,files:fileDigests}));
  const [replay] = await db.select({payloadHash:requestSubmissions.payloadHash}).from(requestSubmissions)
    .where(and(eq(requestSubmissions.formId,form.id),eq(requestSubmissions.idempotencyKey,values.idempotencyKey)));
  if (replay) return replay.payloadHash === payloadHash
    ? NextResponse.json({received:true},{headers})
    : NextResponse.json({error:'This submission ID has already been used with different answers.'},{status:409,headers});
  if (!form.active) return NextResponse.json({error:'Request form not found.'},{status:404,headers});
  const definition = requestDefinition.safeParse(form.definition);
  if (!definition.success || form.version !== values.version) return NextResponse.json({error:'This form changed. Reload it before submitting.'},{status:409,headers});
  const checked = validateRequestAnswers(definition.data,values.answers,[...files.keys()]);
  if (!checked.success) return NextResponse.json({error:checked.error},{status:400,headers});
  if (files.size && !identityImageStorageReady()) return NextResponse.json({error:'Private image storage is unavailable.'},{status:503,headers});
  const attachments: Array<{fieldId:string} & Awaited<ReturnType<typeof prepareIdentityImage>>> = [];
  try {
    for (const [fieldId,file] of files) attachments.push({fieldId,...await prepareIdentityImage(file)});
  } catch {
    return NextResponse.json({error:'Use a readable JPEG or PNG image no larger than 5 MB.'},{status:400,headers});
  }
  try {
    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM request_forms WHERE id=${form.id} AND organization_id=${form.organizationId} FOR UPDATE`);
      const [existing] = await tx.select({payloadHash:requestSubmissions.payloadHash}).from(requestSubmissions)
        .where(and(eq(requestSubmissions.formId,form.id),eq(requestSubmissions.idempotencyKey,values.idempotencyKey)));
      if (existing) return existing.payloadHash === payloadHash ? 'replay' : 'conflict';
      const [current] = await tx.select().from(requestForms).where(and(eq(requestForms.id,form.id),eq(requestForms.organizationId,form.organizationId)));
      if (!current?.active || current.version !== values.version) return 'changed';
      const first = checked.data.first_name;
      const last = checked.data.last_name;
      if (typeof first !== 'string' || typeof last !== 'string' || !first || !last) throw Error('Required client name missing.');
      const [saved] = await tx.insert(requestSubmissions).values({
        organizationId:form.organizationId,formId:form.id,artistId:form.artistId,requestType:form.requestType,
        clientName:`${first} ${last}`,definition:definition.data,answers:checked.data,idempotencyKey:values.idempotencyKey,payloadHash,
      }).returning({id:requestSubmissions.id});
      if (attachments.length) await tx.insert(requestAttachments).values(attachments.map(item => ({...item,organizationId:form.organizationId,submissionId:saved.id})));
      const [artist] = await tx.select({userId:artists.userId}).from(artists).where(and(eq(artists.id,form.artistId),eq(artists.organizationId,form.organizationId)));
      const recipients = await tx.select({id:users.id}).from(users).where(and(eq(users.organizationId,form.organizationId),
        or(eq(users.role,'OWNER'),artist?.userId ? and(eq(users.role,'ARTIST'),eq(users.id,artist.userId)) : undefined)));
      if (recipients.length) await tx.insert(requestNotifications).values(recipients.map(recipient => ({organizationId:form.organizationId,submissionId:saved.id,userId:recipient.id})));
      return 'created';
    });
    if (outcome === 'conflict') return NextResponse.json({error:'This submission ID has already been used with different answers.'},{status:409,headers});
    if (outcome === 'changed') return NextResponse.json({error:'This form changed. Reload it before submitting.'},{status:409,headers});
    return NextResponse.json({received:true},{status:outcome === 'created' ? 201 : 200,headers});
  } catch (error) {
    console.error('Request submission transaction failed', {errorType:error instanceof Error ? error.name : 'unknown'});
    return NextResponse.json({error:'Unable to submit your request. Please retry.'},{status:503,headers});
  }
}
