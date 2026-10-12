export function plainArtistReply(text: string, artistName: string) {
  const name = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(/\*\*/g, '').replace(new RegExp(`\\s+with ${name}(?=[.!:,\\n]|$)`, 'gi'), '').trim();
}
export function selectsOfferedTime(text: string) {
  return /\b(can do|can take|i.ll take|i can|book|works for me|let.s do)\b/i.test(text) && /\d/.test(text);
}
