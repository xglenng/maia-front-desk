export function isNewTattooInquiry(text: string) {
  if (/\b(my|existing|current|this) tattoo\b/i.test(text) && !/\b(another|new|additional)\b/i.test(text)) return false;
  return /\btattoo\b/i.test(text) && /\b(another|new|other appointments?|add|additional|next tattoo)\b/i.test(text);
}
export function tattooQuoteSearch(text: string) {
  return /\btattoo\b/i.test(text) ? { serviceType: 'TATTOO', query: undefined, category: undefined } : null;
}
