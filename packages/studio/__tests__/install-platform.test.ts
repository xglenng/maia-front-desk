import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPlatform } from '../install-platform';

test('install instructions recognize iPhones, Android, and iPads using desktop Safari mode', () => {
  assert.equal(installPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), 'apple');
  assert.equal(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', 5), 'apple');
  assert.equal(installPlatform('Mozilla/5.0 (Linux; Android 15) Chrome/130.0', 5), 'android');
  assert.equal(installPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1', 0), 'other');
  assert.equal(installPlatform('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', 10), 'other');
});
