import type { MetadataRoute } from 'next';
import { BRAND_ASSET_ROOT, BRAND_BACKGROUND } from './brand-assets';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Maia Front Desk', short_name: 'Maia',
    description: 'Manage studio conversations, AI drafts, and appointments.',
    start_url: '/inbox', scope: '/', display: 'standalone',
    background_color: BRAND_BACKGROUND, theme_color: BRAND_BACKGROUND,
    icons: [
      ...[192, 512].map(size => ({ src: `${BRAND_ASSET_ROOT}/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' as const })),
      ...[192, 512].map(size => ({ src: `${BRAND_ASSET_ROOT}/maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' as const }))
    ]
  };
}
