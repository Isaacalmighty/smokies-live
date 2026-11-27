// Builds the app icon and splash sources for @capacitor/assets from the site's logo.
// Uses ../icons/app-icon.svg when it exists (new logo), otherwise ../icons/maskable-512.png.
// Run: npm run icons   (then commit android/ and ios/ changes)
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
const BG = '#0d1411';
const svg = new URL('../../icons/app-icon.svg', import.meta.url).pathname;
const png = new URL('../../icons/maskable-512.png', import.meta.url).pathname;
const src = existsSync(svg) ? svg : png;
mkdirSync('assets', { recursive: true });
const art = (px) => sharp(src, { density: 600 }).resize(px, px, { kernel: 'lanczos3' }).png().toBuffer();
// Full-bleed icon (iOS, legacy Android)
await sharp(await art(1024)).toFile('assets/icon-only.png');
// Adaptive Android icon: plain background + artwork inside the safe zone
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile('assets/icon-background.png');
await sharp(await art(1024)).toFile('assets/icon-foreground.png');
// Splash: logo centred on the app's forest-night colour
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: BG } })
    .composite([{ input: await art(900), gravity: 'center' }]).png().toFile('assets/' + name);
}
console.log('assets/ built from', src);
