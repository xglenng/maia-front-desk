import { BRAND_ASSET_ROOT } from '@/app/brand-assets';

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!['180', '192', '512'].includes(size)) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 308, headers: { Location: `${BRAND_ASSET_ROOT}/icon-${size}.png` } });
}
