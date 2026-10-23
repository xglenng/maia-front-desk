import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedArtistId, artistServicesHref } from '../artist-selection';
test('artist selection honors the requested authorized artist rather than the first provider', () => {
 const artists=[{id:'garrett'},{id:'val'}];
 assert.equal(selectedArtistId(artists,'val'),'val');
 assert.equal(selectedArtistId(artists,'foreign-artist','val'),'val');
 assert.equal(selectedArtistId(artists,'foreign-artist'),'garrett');
 assert.equal(selectedArtistId([], 'val'),'');
 assert.equal(artistServicesHref('val'),'/settings/services?artistId=val');
 assert.equal(artistServicesHref('a&other=b'),'/settings/services?artistId=a%26other%3Db');
});
