export function plainArtistReply(text: string, artistName: string) {
  const name = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(/\*\*/g, '').replace(new RegExp(`\\s+with ${name}(?=[.!:,\\n]|$)`, 'gi'), '').trim();
}
export function selectsOfferedTime(text: string) {
  return /\b(can do|can take|i.ll take|i can|book|works for me|let.s do)\b/i.test(text) && /\d/.test(text);
}

export function estimateBeforeAvailability(text: string, priceCents: number) {
  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(priceCents / 100);
  const introduction = `The estimate is ${price}.`;
  return text.startsWith(introduction) ? text : `${introduction}\n\n${text}`;
}
