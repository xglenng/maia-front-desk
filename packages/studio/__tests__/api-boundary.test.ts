import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configApi = readFileSync('app/api/studio/config/route.ts', 'utf8');
const locationsApi = readFileSync('app/api/studio/locations/route.ts', 'utf8');
const schema = readFileSync('packages/db/src/schema.ts', 'utf8');
const agent = readFileSync('packages/ai/src/agent.server.ts', 'utf8');
const readTools = readFileSync('packages/ai/src/read-tools.server.ts', 'utf8');

test('Studio Configuration endpoints require OWNER and scope all reads/writes to the authenticated organization', () => {
  assert.match(configApi, /export const GET = protectedRoute\(handleGET, true\)/);
  assert.match(configApi, /export const PUT = protectedRoute\(handlePUT, true\)/);
  assert.match(configApi, /eq\(businessRules\.organizationId, input\.organizationId\)/);
  assert.match(configApi, /eq\(studioFaqs\.organizationId, input\.organizationId\)/);
  assert.match(configApi, /eq\(studioAftercare\.organizationId, input\.organizationId\)/);
  assert.match(configApi, /eq\(artists\.organizationId, input\.organizationId\)/);
  assert.match(locationsApi, /export const GET = protectedRoute\(handleGET, true\)/);
  assert.match(locationsApi, /export const POST = protectedRoute\(handlePOST, true\)/);
  assert.match(locationsApi, /export const PATCH = protectedRoute\(handlePATCH, true\)/);
  assert.match(locationsApi, /eq\(studioLocations\.organizationId, organizationId\)/);
  assert.match(locationsApi, /eq\(studioBusinessHours\.organizationId, organizationId\)/);
});

test('new storage keeps studio hours separate from artist availability and constrains location references by tenant', () => {
  assert.match(schema, /export const availabilityRules = pgTable\("availability_rules"/);
  assert.match(schema, /export const studioBusinessHours = pgTable\("studio_business_hours"/);
  assert.match(schema, /tenantLocationReference: foreignKey\(\{ (?:name: "[^"]+", )?columns: \[table\.locationId, table\.organizationId\]/);
  assert.match(schema, /visibility: text\("visibility"\).*default\("AI_INTERNAL"\)/);
});

test('Agent checks receptionist disablement before message or audit writes and uses the bounded scoped context', () => {
  const disabledCheck = agent.indexOf('if (!artist.receptionistEnabled)');
  const messageWrite = agent.indexOf('if (!input.messageAlreadyStored)');
  const auditWrite = agent.indexOf('const runId = await auditRun');
  assert.ok(disabledCheck >= 0 && disabledCheck < messageWrite && disabledCheck < auditWrite);
  assert.match(agent, /getStudioPromptConfiguration\(context, input\.message\)/);
  assert.match(readTools, /eq\(studioFaqs\.organizationId, context\.organizationId\)/);
  assert.match(readTools, /eq\(studioAftercare\.organizationId, context\.organizationId\)/);
  assert.match(readTools, /eq\(businessRules\.organizationId, context\.organizationId\)/);
});
