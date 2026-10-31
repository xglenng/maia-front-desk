// Keypad digits represent cents, so 1 → 2 → 3 displays $1.23.
export function updatePriceDigits(previous: string, key: string): string {
  if (key === 'Backspace') return previous.slice(0, -1);
  if (!/^(\d|00)$/.test(key)) return previous;
  const next = (previous + key).replace(/^0+/, '');
  return next.length <= 9 && Number(next) <= 100_000_000 ? next : previous;
}
