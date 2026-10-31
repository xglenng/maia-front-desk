import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedArtistId, artistServicesHref, settingsArtistId } from '../artist-selection';
test('artist selection honors the requested authorized artist rather than the first provider', () => {
 const artists=[{id:'garrett'},{id:'val'}];
 assert.equal(selectedArtistId(artists,'val'),'val');
 assert.equal(selectedArtistId(artists,'foreign-artist','val'),'val');
 assert.equal(selectedArtistId(artists,'foreign-artist'),'garrett');
 assert.equal(selectedArtistId([], 'val'),'');
 assert.equal(artistServicesHref('val'),'/settings/services?artistId=val');
 assert.equal(artistServicesHref('a&other=b'),'/settings/services?artistId=a%26other%3Db');
});

test('settings default to the linked login even when a stale URL names another artist', () => {
 const artists=[{id:'garrett'},{id:'val'}];
 assert.equal(settingsArtistId(artists,'val','garrett'),'val');
 assert.equal(settingsArtistId(artists,'val',null),'val');
 assert.equal(settingsArtistId(artists,null,'garrett'),'');
 assert.equal(settingsArtistId(artists,'foreign',null),'');
 assert.equal(settingsArtistId([{id:'val'}],null,'foreign'),'val');
 assert.equal(settingsArtistId([],null,null),'');
 assert.equal(settingsArtistId(artists,'val','garrett',true),'garrett');
 assert.equal(settingsArtistId(artists,'val','foreign',true),'val');
});
