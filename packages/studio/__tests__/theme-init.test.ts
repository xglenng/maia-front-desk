import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { themeInitScript, THEME_KEY } from '../../../components/theme';

function run(stored: string | null, systemDark: boolean) {
  const root: { dataset: Record<string, string> } = { dataset: {} };
  vm.runInNewContext(themeInitScript, {
    localStorage: { getItem: (key: string) => (key === THEME_KEY ? stored : null) },
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: { documentElement: root },
  });
  return root.dataset;
}

test('defaults to the system theme', () => {
  assert.deepEqual(run(null, true), { themePreference: 'system', theme: 'dark' });
  assert.deepEqual(run(null, false), { themePreference: 'system', theme: 'light' });
});

test('a saved choice overrides the system theme', () => {
  assert.deepEqual(run('light', true), { themePreference: 'light', theme: 'light' });
  assert.deepEqual(run('dark', false), { themePreference: 'dark', theme: 'dark' });
});

test('an unrecognised saved value falls back to system', () => {
  assert.deepEqual(run('sepia', true), { themePreference: 'system', theme: 'dark' });
});
