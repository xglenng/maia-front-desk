import { BRAND_ASSET_ROOT } from '@/app/brand-assets';

export function GET() {
  return new Response(null, { status: 308, headers: { Location: `${BRAND_ASSET_ROOT}/icon-48.png` } });
}
