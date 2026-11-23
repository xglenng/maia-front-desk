import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import manifest from '../../../app/manifest';
import { BRAND_ASSET_ROOT, IPHONE_SCREENS, startupImage, startupMedia } from '../../../app/brand-assets';
import { GET as legacyIcon } from '../../../app/app-icon/[size]/route';
import { GET as legacyFavicon } from '../../../app/maia-favicon.svg/route';

const file = (url: string) => path.join(process.cwd(), 'public', url);

test('versioned icons are opaque, correctly sized, and referenced by the manifest', async () => {
  const master = await sharp(file(`${BRAND_ASSET_ROOT}/maia-emblem.png`)).metadata();
  assert.equal(master.width, 440);
  assert.equal(master.height, 440);
  assert.equal(master.hasAlpha, false);
  const icons = manifest().icons!;
  for (const size of [32, 48, 180, 192, 512]) {
    const meta = await sharp(file(`${BRAND_ASSET_ROOT}/icon-${size}.png`)).metadata();
    assert.equal(meta.width, size);
    assert.equal(meta.height, size);
    assert.equal(meta.hasAlpha, false);
  }
  for (const size of [192, 512]) {
    for (const purpose of ['any', 'maskable'] as const) {
      const icon = icons.find(item => item.sizes === `${size}x${size}` && item.purpose === purpose);
      assert.ok(icon);
      const meta = await sharp(file(icon.src)).metadata();
      assert.equal(meta.width, size);
      assert.equal(meta.height, size);
      assert.equal(meta.hasAlpha, false);
    }
    const { data } = await sharp(file(`${BRAND_ASSET_ROOT}/maskable-${size}.png`)).raw().toBuffer({ resolveWithObject: true });
    const centre = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (Math.hypot(x + 0.5 - centre, y + 0.5 - centre) <= size * 0.4) continue;
      const offset = (y * size + x) * 3;
      assert.ok(Math.max(...data.subarray(offset, offset + 3)) <= 25, 'maskable artwork extends outside the safe circle');
    }
  }
});

test('legacy icon links resolve to the versioned artwork', async () => {
  const icon = await legacyIcon(new Request('https://example.test/app-icon/180'), { params: Promise.resolve({ size: '180' }) });
  assert.equal(icon.status, 308);
  assert.equal(icon.headers.get('location'), `${BRAND_ASSET_ROOT}/icon-180.png`);
  assert.equal((await legacyIcon(new Request('https://example.test/app-icon/999'), { params: Promise.resolve({ size: '999' }) })).status, 404);
  assert.equal(legacyFavicon().headers.get('location'), `${BRAND_ASSET_ROOT}/icon-48.png`);
});

test('iPhone startup assets cover both orientations at exact physical dimensions', async () => {
  for (const screen of IPHONE_SCREENS) for (const orientation of ['portrait', 'landscape'] as const) {
    const href = startupImage(screen, orientation);
    const media = startupMedia(screen, orientation);
    assert.match(media, new RegExp(`device-width: ${screen.width}px`));
    assert.match(media, new RegExp(`device-height: ${screen.height}px`));
    assert.match(media, new RegExp(`device-pixel-ratio: ${screen.scale}`));
    assert.match(media, new RegExp(`orientation: ${orientation}`));
    const image = sharp(file(href));
    const meta = await image.metadata();
    assert.equal(meta.width, (orientation === 'portrait' ? screen.width : screen.height) * screen.scale);
    assert.equal(meta.height, (orientation === 'portrait' ? screen.height : screen.width) * screen.scale);
    assert.equal(meta.hasAlpha, false);
    const corner = await image.extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...corner], [10, 10, 10]);
  }
  const screen = IPHONE_SCREENS.find(item => item.width === 390)!;
  const logoSize = 180 * screen.scale;
  const startup = sharp(file(startupImage(screen, 'portrait')));
  const actual = await startup.extract({ left: (screen.width * screen.scale - logoSize) / 2,
    top: (screen.height * screen.scale - logoSize) / 2, width: logoSize, height: logoSize }).raw().toBuffer();
  const expected = await sharp(file(`${BRAND_ASSET_ROOT}/maia-emblem.png`)).resize(logoSize, logoSize).raw().toBuffer();
  assert.deepEqual(actual, expected);
});
