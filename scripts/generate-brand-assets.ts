import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BRAND_ASSET_ROOT, BRAND_BACKGROUND, IPHONE_SCREENS, startupImage, type StartupOrientation } from '../app/brand-assets';

async function main() {
  const root = path.join(process.cwd(), 'public', BRAND_ASSET_ROOT);
  const master = path.join(root, 'maia-emblem.png');
  await mkdir(path.join(root, 'startup'), { recursive: true });

  for (const size of [32, 48, 180, 192, 512]) {
    await sharp(master).resize(size, size).removeAlpha().png().toFile(path.join(root, `icon-${size}.png`));
  }
  for (const size of [192, 512]) {
    const logoSize = Math.round(size * 0.72);
    const logo = await sharp(master).resize(logoSize, logoSize).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 3, background: BRAND_BACKGROUND } })
      .composite([{ input: logo, gravity: 'centre' }]).removeAlpha().png().toFile(path.join(root, `maskable-${size}.png`));
  }
  for (const screen of IPHONE_SCREENS) {
    const logo = await sharp(master).resize(180 * screen.scale, 180 * screen.scale).png().toBuffer();
    for (const orientation of ['portrait', 'landscape'] as const satisfies readonly StartupOrientation[]) {
      const width = (orientation === 'portrait' ? screen.width : screen.height) * screen.scale;
      const height = (orientation === 'portrait' ? screen.height : screen.width) * screen.scale;
      await sharp({ create: { width, height, channels: 3, background: BRAND_BACKGROUND } })
        .composite([{ input: logo, gravity: 'centre' }]).removeAlpha().png()
        .toFile(path.join(process.cwd(), 'public', startupImage(screen, orientation)));
    }
  }
}

main().catch(error => { console.error('Unable to generate brand assets:', error); process.exitCode = 1; });
