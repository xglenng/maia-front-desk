export function isNewTattooInquiry(text: string, previousAssistant?: string) {
  if (/^(yes|yes please|yeah|yep|correct|that.s right)[.! ]*$/i.test(text.trim()) &&
      /\b(?:are you (?:looking|wanting|planning)|do you (?:want|mean)|would you like|is this|did you (?:want|mean))\b[^?]*\b(?:another|new|additional)\b[^?]*\btattoo\b[^?]*\?/i.test(previousAssistant || '')) return true;
  if (/\b(my|existing|current|this) tattoo\b/i.test(text) && !/\b(another|new|additional)\b/i.test(text)) return false;
  if (/\b(?:cancel|reschedule|move|change|deposit|payment|paid|refund|aftercare)\b/i.test(text)) return false;
  return /\btattoo\b/i.test(text) && (/\b(another|new|other appointments?|add|additional|next tattoo)\b/i.test(text) ||
    /\b(?:book(?:ing)?|schedule|want|get)\b[^.!?]*\b(?:a|an)\b[^.!?]*\btattoo\b/i.test(text));
}

export function currentTattooIntake<T extends { id: string }>(history: T[], startMessageId?: string) {
  const index = history.findIndex(message => message.id === startMessageId);
  return index < 0 ? history : history.slice(index);
}
export function tattooQuoteSearch(text: string) {
  return /\btattoo\b/i.test(text) ? { serviceType: 'TATTOO', query: undefined, category: undefined } : null;
}
