/**
 * Build resources/icon.png + resources/splash.png from the existing
 * Kumudha hospital logo at public/branding/kh-logo.jpeg.
 *
 * Outputs:
 *   resources/icon.png            1024×1024 — used by @capacitor/assets to
 *                                  generate every Android density + the iOS
 *                                  AppIcon set.
 *   resources/splash.png          2732×2732 — launch screen base (logo on a
 *                                  white square).
 *   resources/icon-foreground.png 1024×1024 — adaptive-icon foreground
 *                                  (logo padded to the inner safe zone).
 *   resources/icon-background.png 1024×1024 — adaptive-icon background
 *                                  (solid white).
 *
 * Requires `sharp`, which is a transitive dep of @capacitor/assets so it's
 * already on disk after install.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC  = resolve(ROOT, 'public/branding/kh-logo.jpeg');
const OUT  = resolve(ROOT, 'resources');
mkdirSync(OUT, { recursive: true });

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Full-bleed icon: scale to 1024 directly.
await sharp(SRC)
  .resize(1024, 1024, { fit: 'cover' })
  .png()
  .toFile(resolve(OUT, 'icon.png'));

// Adaptive icon foreground: the logo must sit inside the 432/1080 = 40%
// safe zone for Android adaptive icons. We render it at 720px on a 1024
// transparent canvas (~70% — Android keeps ~66% visible across masks).
const fg = await sharp(SRC)
  .resize(720, 720, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: fg, gravity: 'center' }])
  .png()
  .toFile(resolve(OUT, 'icon-foreground.png'));

await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: WHITE },
})
  .png()
  .toFile(resolve(OUT, 'icon-background.png'));

// Splash: logo centred on white at the canonical 2732×2732 size.
const splashLogo = await sharp(SRC)
  .resize(900, 900, { fit: 'contain', background: WHITE })
  .png()
  .toBuffer();

await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: WHITE },
})
  .composite([{ input: splashLogo, gravity: 'center' }])
  .png()
  .toFile(resolve(OUT, 'splash.png'));

// Dark splash — same composition; capacitor-assets uses this for dark mode.
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: WHITE },
})
  .composite([{ input: splashLogo, gravity: 'center' }])
  .png()
  .toFile(resolve(OUT, 'splash-dark.png'));

console.log('Generated icon + splash assets in resources/');
