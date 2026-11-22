import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSiteIndustry } from '../public-site-policy';

test('website copy and forms follow each selected industry', () => {
  for (const [selection, type, text] of [['TATTOO','TATTOO_REQUEST','piece'], ['PIERCING','PIERCING_REQUEST','detail'], ['HAIR','HAIR_REQUEST','look'], ['NAILS','NAILS_REQUEST','set'], ['ESTHETICS','ESTHETICS_REQUEST','you']]) {
    const site = publicSiteIndustry([selection]);
    assert.deepEqual(site.requestTypes, [type]);
    assert.match(site.headline.join(' '), new RegExp(text));
  }
});
test('multi-specialty sites combine matching forms without adding other industries', () => {
  const site = publicSiteIndustry(['NAILS', 'HAIR', 'NAILS']);
  assert.deepEqual(new Set(site.requestTypes), new Set(['HAIR_REQUEST', 'NAILS_REQUEST']));
  assert.equal(site.specialties, 'Hair · Nails');
  assert.equal(site.headline[0], 'Your next appointment.');
});
test('legacy sites retain tattoo/piercing while Other stays generic', () => {
  assert.deepEqual(new Set(publicSiteIndustry([]).requestTypes), new Set(['TATTOO_REQUEST', 'PIERCING_REQUEST']));
  for (const selection of [['OTHER'], ['unknown']]) {
    assert.deepEqual(publicSiteIndustry(selection).requestTypes, []);
    assert.equal(publicSiteIndustry(selection).specialties, '');
  }
});
