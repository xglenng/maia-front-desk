import { ImageResponse } from 'next/og';

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!['180', '192', '512'].includes(size)) return new Response('Not found', { status: 404 });
  const pixels = Number(size);
  return new ImageResponse(<div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#5f4da5', color: '#fff', fontSize: pixels * 0.64, fontWeight: 700 }}>M</div>, { width: pixels, height: pixels });
}
