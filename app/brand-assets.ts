export const BRAND_ASSET_ROOT = '/brand/v1';
export const BRAND_BACKGROUND = '#0a0a0a';

// Logical portrait dimensions and pixel ratios shared by supported iPhones.
export const IPHONE_SCREENS = [
  { width: 375, height: 667, scale: 2 },
  { width: 360, height: 780, scale: 3 },
  { width: 390, height: 844, scale: 3 },
  { width: 393, height: 852, scale: 3 },
  { width: 402, height: 874, scale: 3 },
  { width: 420, height: 912, scale: 3 },
  { width: 428, height: 926, scale: 3 },
  { width: 430, height: 932, scale: 3 },
  { width: 440, height: 956, scale: 3 }
] as const;

export type StartupScreen = (typeof IPHONE_SCREENS)[number];
export type StartupOrientation = 'portrait' | 'landscape';

export function startupImage(screen: StartupScreen, orientation: StartupOrientation) {
  return `${BRAND_ASSET_ROOT}/startup/${screen.width}x${screen.height}-${screen.scale}-${orientation}.png`;
}

export function startupMedia(screen: StartupScreen, orientation: StartupOrientation) {
  return `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.scale}) and (orientation: ${orientation})`;
}
