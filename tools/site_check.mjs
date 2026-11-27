// Loads the live site in headless Chromium and saves screenshots plus console errors.
import { chromium } from 'playwright';
import fs from 'fs';
const URL = process.env.SITE || 'https://isaacalmighty.github.io/smokies-live/';
const out = process.argv[2] || 'checks';
fs.mkdirSync(out, { recursive: true });
const log = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });
  page.on('pageerror', e => log.push(`${tag} pageerror ${e.message} @ ${(e.stack || '').split('\n').slice(1, 4).map(s => s.trim()).join(' | ').slice(0, 400)}`));
  page.on('console', m => { if (m.type() === 'error' || /\[live\]/.test(m.text())) log.push(`${tag} console ${m.type()} ${m.text().slice(0, 300)}`); });
  page.on('requestfailed', r => log.push(`${tag} failed ${r.url().slice(0, 160)} ${r.failure() && r.failure().errorText}`));
  const tt = {}; page.on('response', r => { if (r.url().includes('api.tomtom.com')) { const k = r.status(); tt[k] = (tt[k] || 0) + 1; } });
  await page.addInitScript(() => { window.__noIntro = true; });
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  try { await page.waitForFunction(() => window.__smokies && window.__smokies.sky && window.__smokies.sky.sun, null, { timeout: 90000 }); } catch (e) { log.push(tag + ' sky never ready'); }
  await page.waitForTimeout(20000);
  const state = await page.evaluate(() => { const L = window.Live && window.Live.st; return L ? { blocked: L.blocked, wx: !!L.wx, puffs: window.Live.Clouds.n, alerts: L.alerts.map(a => a.event), news: L.news.length, events: L.events.length, incidents: L.traffic.incidents.length, cams: L.traffic.cameras.length, gauges: L.gauges.length, fires: L.fires.length, sky: document.getElementById('skyTime').textContent, chip: document.getElementById('wxDesc').textContent } : 'no Live'; });
  log.push(tag + ' state ' + JSON.stringify(state)); log.push(tag + ' tomtom ' + JSON.stringify(tt));
  const shot = async name => { try { await page.screenshot({ path: `${out}/${tag}-${name}.jpg`, quality: 70, timeout: 60000 }); } catch (e) { log.push(`${tag} screenshot ${name} timed out`); } fs.writeFileSync(`${out}/log.txt`, log.join('\n') + '\n'); };
  await shot('1');
  await page.evaluate(() => { localStorage.setItem('sl-who', '"visitor"'); if (window.UX) UX.closeSheet(); });
  await page.waitForTimeout(800);
  await shot('1b-map');
  await page.evaluate(() => window.Social && Social.setView('today'));
  await page.waitForTimeout(2500);
  await shot('2-today');
  await page.evaluate(() => { Social.setView('map'); setTimeout(() => window.UX && UX.openShow(), 500); });
  await page.waitForTimeout(2500);
  await shot('3-show');
  await page.evaluate(() => { UX.closeSheet(); const m = window.__smokies.map; m.jumpTo({ center: [-83.47, 35.62], zoom: 12.3, pitch: 78, bearing: 20 }); });
  await page.waitForTimeout(15000);
  await shot('4-clouds-now');
  await page.close();
}
await browser.close();
fs.writeFileSync(`${out}/log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
