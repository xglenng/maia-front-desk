export function installPlatform(userAgent: string, maxTouchPoints: number): 'apple' | 'android' | 'other' {
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'apple';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}
