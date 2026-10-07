import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readinessRoute = readFileSync('app/api/onboarding/readiness/route.ts', 'utf8');
const artistRoute = readFileSync('app/api/studio/artists/route.ts', 'utf8');
const dashboardRoute = readFileSync('app/api/dashboard/route.ts', 'utf8');
const inboxRoute = readFileSync('app/api/inbox/route.ts', 'utf8');
const inboxServer = readFileSync('packages/inbox/server.ts', 'utf8');
const testSessionRoute = readFileSync('app/api/onboarding/test-session/route.ts', 'utf8');
const migration = readFileSync('packages/db/drizzle/0000_studio_configuration_foundation.sql', 'utf8');
const signupRoute = readFileSync('app/api/auth/signup/route.ts', 'utf8');
const agentSource = readFileSync('packages/ai/src/agent.server.ts', 'utf8');
const contextResolver = readFileSync('packages/ai/src/context.server.ts', 'utf8');
const conversationRoute = readFileSync('app/api/ai/conversation/route.ts', 'utf8');

test('readiness API is owner-guarded, tenant-scoped, and makes no provider calls', () => {
  assert.match(readinessRoute, /export const GET = protectedRoute\(handleGET, true\)/);
  assert.match(readinessRoute, /eq\(artists\.organizationId, organizationId\)/);
  assert.match(readinessRoute, /eq\(services\.organizationId, organizationId\)/);
  assert.match(readinessRoute, /eq\(schedulingConnections\.organizationId, organizationId\)/);
  assert.match(readinessRoute, /eq\(phoneNumbers\.organizationId, organizationId\)/);
  assert.match(readinessRoute, /eq\(complianceProfiles\.organizationId, organizationId\)/);
  assert.match(readinessRoute, /eq\(conversations\.channel, 'WEB_TEST'\)/);
  assert.match(readinessRoute, /eq\(agentRuns\.success, true\)/);
  assert.match(readinessRoute, /ne\(agentRuns\.model, 'mock'\)/);
  assert.doesNotMatch(readinessRoute, /startLiveRegistration|SquareApiClient|fetch\(/);
});

test('artist creation is owner-only and tenant ID is overwritten by the authenticated guard', () => {
  assert.match(artistRoute, /export const POST = protectedRoute\(handlePOST, true\)/);
  assert.match(artistRoute, /insert\(artists\)/);
  assert.match(dashboardRoute, /canAccessArtist\(user\.role, user\.id, artistAccess\?\.userId/);
  assert.doesNotMatch(dashboardRoute, /Run npm run db:seed/);
});

test('Test Maia creates only an internal unconsented WEB_TEST profile and cannot call external messaging', () => {
  assert.match(testSessionRoute, /export const POST = protectedRoute\(handlePOST, true\)/);
  assert.match(testSessionRoute, /smsOptIn: false/);
  assert.match(testSessionRoute, /smsConsentStatus: 'NOT_REQUESTED'/);
  assert.match(testSessionRoute, /channel: 'WEB_TEST'/);
  assert.doesNotMatch(testSessionRoute, /sendSms|sendMetaMessage|TwilioApiClient|SquareApiClient/);
  assert.match(dashboardRoute, /ONBOARDING_PREVIEW_CLIENT_NOTE/);
  assert.match(dashboardRoute, /ne\(conversations\.channel, 'WEB_TEST'\)/);
  assert.match(inboxRoute, /ne\(conversations\.channel, 'WEB_TEST'\)/);
  assert.match(inboxServer, /ne\(conversations\.channel, "WEB_TEST"\)/);
  assert.match(agentSource, /context\.channel === 'WEB_TEST' \? \{\} :/);
  assert.match(agentSource, /testMode: context\.channel === 'WEB_TEST'/);
  assert.match(contextResolver, /resolved\.context\.channel === 'WEB_TEST' && user\.role !== 'OWNER'/);
  assert.match(conversationRoute, /conversation\.channel === 'WEB_TEST'.*role !== 'OWNER'/);
});

test('C1 migration is additive and safely defaults existing business rules to internal visibility', () => {
  assert.match(migration, /ADD COLUMN "visibility" text DEFAULT 'AI_INTERNAL' NOT NULL/);
  assert.match(signupRoute, /INSERT INTO organizations\(name, slug, timezone, public_name\)/);
  assert.match(migration, /CREATE TABLE "studio_locations"/);
  assert.match(migration, /CREATE TABLE "studio_business_hours"/);
  assert.match(migration, /CREATE TABLE "studio_faqs"/);
  assert.match(migration, /CREATE TABLE "studio_aftercare"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/);
});
