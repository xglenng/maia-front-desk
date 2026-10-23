// URL artist IDs are preferences only; callers must resolve them against authorized artists.
export function selectedArtistId(artists: ReadonlyArray<{ id: string }>, requested: string | null, existing = '') {
  return artists.find(artist => artist.id === requested)?.id
    || artists.find(artist => artist.id === existing)?.id
    || artists[0]?.id || '';
}
export function artistServicesHref(artistId: string) {
  return `/settings/services?artistId=${encodeURIComponent(artistId)}`;
}
