// URL artist IDs are preferences only; callers must resolve them against authorized artists.
export function selectedArtistId(artists: ReadonlyArray<{ id: string }>, requested: string | null, existing = '') {
  return artists.find(artist => artist.id === requested)?.id
    || artists.find(artist => artist.id === existing)?.id
    || artists[0]?.id || '';
}
export function artistServicesHref(artistId: string) {
  return `/settings/services?artistId=${encodeURIComponent(artistId)}`;
}

// Configuration defaults to the authenticated user's linked profile, never list order.
// A completed OAuth flow must retain its authorized destination for the review.
export function settingsArtistId(artists: ReadonlyArray<{id:string}>, ownArtistId: string | null, requested: string | null, oauthReturn=false) {
  if (oauthReturn && artists.some(artist=>artist.id===requested)) return requested!;
  return artists.find(artist=>artist.id===ownArtistId)?.id || (artists.length===1?artists[0].id:'');
}
