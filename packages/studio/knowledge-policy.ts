// Suggestions are review material, never verified studio facts until owner approval.
export function reusableKnowledgeCandidate(text: string) {
  const value = text.trim();
  return value.length >= 25 && value.length <= 1200 && !/[?]|https?:\/\/|\$|\b\S+@\S+\.\S+|\b\d{1,2}:\d{2}|\b\d{3}[- .]?\d{3}[- .]?\d{4}|\b\d{4}-\d{2}-\d{2}/i.test(value);
}
