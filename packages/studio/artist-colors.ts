export const ARTIST_COLORS = [
  { value: '#006AFF', name: 'Blue' }, { value: '#008A42', name: 'Green' },
  { value: '#C66B00', name: 'Orange' }, { value: '#8053C4', name: 'Purple' },
  { value: '#C73564', name: 'Rose' }, { value: '#007F86', name: 'Teal' },
  { value: '#B83C30', name: 'Red' }, { value: '#596579', name: 'Slate' },
] as const;
export function validArtistColor(value: unknown): value is string {
  return ARTIST_COLORS.some(color => color.value === value);
}
export function artistColor(id: string, saved?: string | null) {
  if (validArtistColor(saved)) return saved;
  const hash = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  return ARTIST_COLORS[hash % ARTIST_COLORS.length].value;
}
export function availableArtistColor(used: Array<string | null>) {
  return ARTIST_COLORS.find(color => !used.includes(color.value))?.value || ARTIST_COLORS[used.length % ARTIST_COLORS.length].value;
}
