// Builds the app icon and splash sources for @capacitor/assets from the site's Misty Ridges emblem
// (the vector mark() in ../tools/brand.js), so the app always matches the website's logo.
// Run: npm run icons   (then commit the android/ and ios/ changes)
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
const ICON_BG = '#1f3431', SPLASH_BG = '#0e1612';
const src = readFileSync(new URL('../../tools/brand.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('function mark('), src.indexOf('const wordmark'));
const mark = new Function('let uid = 0;\n' + body + '\nreturn mark;')();
const svg = (px, opts) => Buffer.from(mark(px, opts).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/class="[^"]*"/g, ''));
const emblem = px => sharp(svg(px), { density: 72 }).resize(px, px).png().toBuffer();
const square = async (size, bg, px) => sharp({ create: { width: size, height: size, channels: 4, background: bg } })
  .composite([{ input: await emblem(px), gravity: 'center' }]).png();
mkdirSync('assets', { recursive: true });
await (await square(1024, ICON_BG, 820)).flatten({ background: ICON_BG }).toFile('assets/icon-only.png');        // iOS + legacy Android
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ICON_BG } }).png().toFile('assets/icon-background.png');
await (await square(1024, { r: 0, g: 0, b: 0, alpha: 0 }, 640)).toFile('assets/icon-foreground.png');            // Android adaptive safe zone
for (const f of ['splash.png', 'splash-dark.png']) await (await square(2732, SPLASH_BG, 760)).toFile('assets/' + f);
console.log('assets/ built from the Misty Ridges emblem in tools/brand.js');
