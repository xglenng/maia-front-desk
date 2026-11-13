import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeEmail } from '../welcome-email';
import { setupReturnPath } from '../setup-return';

test('welcome email escapes personalization and has a plain text setup link', () => {
  const result = welcomeEmail({ ownerName: '<Val> Example', studioName: 'Val & Co', origin: 'https://maia.example' });
  assert.equal(result.subject, '<Val>, let’s set up Maia for Val & Co');
  assert.match(result.html, /Welcome to Maia, &lt;Val&gt;!/);
  assert.doesNotMatch(result.html, /<Val>/);
  assert.match(result.text, /https:\/\/maia.example\/onboarding/);
  assert.match(result.html, /https:\/\/maia.example\/help/);
  assert.equal((result.html.match(/Finish setting up Maia/g) || []).length, 1);
  assert.match(result.text, /review a test conversation/);
});

test('missing names and pilot accounts do not invent trial details', () => {
  const result = welcomeEmail({ ownerName: null, studioName: '', origin: 'https://maia.example' });
  assert.equal(result.subject, 'there, let’s set up Maia for your studio');
  assert.match(result.text, /Welcome to Maia, there!/);
  assert.doesNotMatch(result.text, /trial|billing/i);
});

test('active trial uses the verified plan and date, expired trial is omitted', () => {
  const active = welcomeEmail({ ownerName: 'Val', studioName: 'Studio', origin: 'https://maia.example', trial: { planName: 'Studio & Pro', endsAt: new Date('2099-12-03T00:00:00Z') } });
  assert.match(active.html, /Studio &amp; Pro trial ends December 3, 2099/);
  assert.match(active.text, /Studio & Pro trial ends December 3, 2099 \(UTC\)/);
  const expired = welcomeEmail({ ownerName: 'Val', studioName: 'Studio', origin: 'https://maia.example', trial: { planName: 'Old', endsAt: new Date('2020-01-01') } });
  assert.doesNotMatch(expired.text, /trial/);
});

test('login return permits only Maia setup and support routes', () => {
  assert.equal(setupReturnPath('/onboarding'), '/onboarding');
  assert.equal(setupReturnPath('/help'), '/help');
  for (const unsafe of ['//evil.example', 'https://evil.example', '/onboarding?next=//evil.example', null]) assert.equal(setupReturnPath(unsafe), '/');
});
