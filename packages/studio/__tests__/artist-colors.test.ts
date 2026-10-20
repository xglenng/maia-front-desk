import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIST_COLORS, artistColor, availableArtistColor, validArtistColor } from '../artist-colors';
test('artist colors persist approved values and safely fall back for legacy profiles',()=>{
  assert.equal(artistColor('artist-a','#008A42'),'#008A42');
  assert.equal(artistColor('artist-a'),artistColor('artist-a',null));
  assert.ok(validArtistColor(artistColor('artist-a','red; color: white')));
  assert.equal(validArtistColor('red'),false);
  assert.equal(availableArtistColor([ARTIST_COLORS[0].value]),ARTIST_COLORS[1].value);
  assert.ok(validArtistColor(availableArtistColor(ARTIST_COLORS.map(c=>c.value))));
});
