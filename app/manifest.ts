import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Maia Front Desk', short_name: 'Maia',
    description: 'Manage studio conversations, AI drafts, and appointments.',
    start_url: '/inbox', scope: '/', display: 'standalone',
    background_color: '#f5f5f5', theme_color: '#5f4da5',
    icons: [192, 512].map(size => ({ src: `/app-icon/${size}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' as const }))
  };
}
