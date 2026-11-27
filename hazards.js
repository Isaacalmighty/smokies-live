/* Smokies Live: flood and wildfire views.
   These are not part of the everyday map. index.html loads this file only when someone opens a
   real alert: a National Weather Service flood alert, or a fire reported by satellite. Every map
   layer here is added when a view opens and removed when it closes, so nothing keeps running.
   The models are the original ones (height above nearest drainage for water, minimum travel time
   for fire spread), kept reusable for the future flood and fire dashboards. */
(() => {
  const S = window.__smokies, map = S.map;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TZ = 'America/New_York', M2FT = S.M2FT, RAD = Math.PI / 180;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // slow in, slow out
  const km = (a, b) => { const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const miles = k => { const m = k * 0.621371; return (m < 10 ? m.toFixed(1) : Math.round(m)) + ' miles'; };
  const bearing = (a, b) => { const y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD); const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD); return (Math.atan2(y, x) / RAD + 360) % 360; };
  const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const compass = d => COMPASS[Math.round(((d % 360) + 360) % 360 / 45) % 8];
  const when = iso => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }); };
  const localHour = t => new Date(t + ':00-05:00').valueOf(); // Open-Meteo hours are Eastern time

  /* ---------- styles (only exist while this file is loaded) ---------- */
  const css = document.createElement('style');
  css.textContent = `
#hzSheet{position:fixed;z-index:15;left:0;right:0;bottom:0;max-height:min(56vh,620px);overflow:auto;overscroll-behavior:contain;border-radius:22px 22px 0 0;padding:4px 16px calc(env(safe-area-inset-bottom,0px) + 16px);transform:translateY(105%);transition:transform .5s cubic-bezier(.34,1.32,.64,1);background:var(--glass-strong,rgba(10,17,15,.92));-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);color:var(--ink,#eef2ec)}
#hzSheet.in{transform:none}
#hzSheet.out{transition:transform .32s cubic-bezier(.55,0,.75,.2)}
@media (min-width:761px){#hzSheet{left:auto;right:24px;bottom:24px;width:400px;border-radius:20px;max-height:calc(100vh - 140px)}}
#hzSheet .grab{height:20px;display:grid;place-items:center;touch-action:none;cursor:grab}
#hzSheet .grab::after{content:"";width:40px;height:5px;border-radius:3px;background:rgba(255,255,255,.25)}
.hzh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}
.hzh small{display:block;color:var(--ink-dim,#a9b7ad);font-size:12.5px;letter-spacing:.02em}
.hzh b{display:block;font:700 21px/1.15 var(--font-display,sans-serif);letter-spacing:.01em;margin-top:2px}
.hzx{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.06);color:inherit;font-size:15px;cursor:pointer}
.hzlead{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid var(--line)}
.hzlead p{margin:0;font-size:14px;line-height:1.42;color:var(--ink-dim,#a9b7ad)}
.hzlead p.big{font-size:16.5px;line-height:1.35;color:var(--ink,#eef2ec);font-weight:600;margin-bottom:6px}
.hzk{margin:14px 2px 7px;font:600 11.5px var(--font-body,sans-serif);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint,#75857a)}
.hzchips{display:flex;gap:6px}
.hzchips button{flex:1;min-width:0;padding:9px 6px 8px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);cursor:pointer;text-align:center;transition:transform .35s cubic-bezier(.34,1.56,.64,1),background .25s,border-color .25s}
.hzchips button b{display:block;font:700 17px var(--font-data,monospace)}
.hzchips button small{display:block;font-size:11px;line-height:1.2;color:var(--ink-dim);margin-top:2px}
.hzchips button[aria-pressed=true]{background:rgba(74,163,255,.18);border-color:rgba(120,190,255,.6)}
.hzchips.fire button[aria-pressed=true]{background:rgba(242,166,90,.18);border-color:rgba(242,166,90,.6)}
.hzchips button:active{transform:scale(.94)}
.hzrow{display:flex;gap:10px;align-items:flex-start;padding:10px 2px;border-bottom:1px solid var(--line);font-size:14px;line-height:1.4}
.hzrow:last-of-type{border-bottom:0}
.hzrow>span:first-child{font-size:18px;line-height:1.2;width:22px;text-align:center;flex:none}
.hzrow small{display:block;color:var(--ink-dim);font-size:12.5px;margin-top:1px}
.hzdo{margin-top:10px;padding:11px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:13.5px;line-height:1.42}
.hzdo b{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:4px}
.hzdo ul{margin:0;padding-left:18px}.hzdo li{margin:2px 0}
.hzfine{margin:10px 2px 0;font-size:12px;line-height:1.4;color:var(--ink-faint)}
.hzacts{display:flex;gap:8px;margin-top:12px}.hzacts>*{flex:1;text-align:center;text-decoration:none;padding:11px 8px}
.hzwait{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.25);border-top-color:var(--ember,#f2a65a);animation:hzspin .9s linear infinite;vertical-align:-1px;margin-right:6px}
@keyframes hzspin{to{transform:rotate(360deg)}}
#hzSheet .body>*{animation:hzin .5s cubic-bezier(.22,1.2,.36,1) both}
#hzSheet .body>*:nth-child(2){animation-delay:.05s}#hzSheet .body>*:nth-child(3){animation-delay:.1s}#hzSheet .body>*:nth-child(4){animation-delay:.15s}#hzSheet .body>*:nth-child(5){animation-delay:.2s}#hzSheet .body>*:nth-child(n+6){animation-delay:.25s}
@keyframes hzin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.hzwind{width:150px;height:150px;pointer-events:none}
.hzwind svg{width:100%;height:100%;overflow:visible}
.hzwind .chev{animation:hzdrift 2.4s cubic-bezier(.45,0,.55,1) infinite;opacity:0;will-change:transform,opacity}
.hzwind .chev:nth-of-type(2){animation-delay:.8s}.hzwind .chev:nth-of-type(3){animation-delay:1.6s}
@keyframes hzdrift{0%{transform:translateY(18px);opacity:0}25%{opacity:1}100%{transform:translateY(-46px);opacity:0}}
.hzme{width:16px;height:16px;border-radius:50%;background:#4aa3ff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(74,163,255,.25)}
@media (prefers-reduced-motion:reduce){#hzSheet,#hzSheet .body>*,.hzwind .chev{animation:none!important;transition:none!important}.hzwind .chev{opacity:.8}}
`;
  document.head.appendChild(css);

  /* ---------- shared sheet ---------- */
  let active = null, token = 0;
  const markers = [];
  function sheet() {
    let s = $('#hzSheet'); if (s) return s;
    s = document.createElement('section'); s.id = 'hzSheet'; s.className = 'panel'; s.hidden = true; s.setAttribute('aria-live', 'polite');
    s.innerHTML = '<div class="grab" aria-hidden="true"></div><div class="body"></div>';
    document.body.appendChild(s);
    // flick the handle down to put it away; it keeps the speed you gave it
    let y0 = null, dy = 0, t0 = 0; const g = s.querySelector('.grab');
    g.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; t0 = performance.now(); s.style.transition = 'none'; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); s.style.transform = `translateY(${dy}px)`; });
    const up = () => { if (y0 == null) return; const v = dy / Math.max(1, performance.now() - t0); y0 = null; s.style.transition = ''; s.style.transform = ''; if (dy > 110 || v > 0.6) close(); };
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    return s;
  }
  function showSheet(html) {
    const s = sheet(); s.querySelector('.body').innerHTML = html; s.classList.remove('out'); s.hidden = false; s.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('in')));
    s.querySelector('.hzx').onclick = close;
    return s;
  }
  const sheetH = () => innerWidth <= 760 ? Math.min(innerHeight * 0.56, 620) : 0;
  // keep the spot in the clear part of the screen, above the sheet
  const camera = (center, zoom, extra = {}) => map.flyTo({ center, zoom, pitch: 52, offset: [0, -sheetH() / 2.2], duration: 2600, curve: 1.3, easing: ease, essential: true, ...extra });

  function prep(kind) {
    close(true); token++; active = kind;
    if (window.UX && UX.closeSheet) UX.closeSheet();
    if (window.MapMe && MapMe.closeSheet) MapMe.closeSheet();
    const lc = $('#lcard'); if (lc) lc.hidden = true;
    if (window.Social && document.body.dataset.view && document.body.dataset.view !== 'map') Social.setView('map');
    S.stopOrbit();
    return token;
  }
  function close(silent) {
    const was = active; active = null; token++;
    cancelAnimationFrame(floodAnim); cancelAnimationFrame(fireAnim);
    markers.splice(0).forEach(m => m.remove());
    ['hz-flood', 'hz-fire'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    ['hz-hand', 'hz-fire'].forEach(id => { if (map.getSource(id)) map.removeSource(id); });
    if (was === 'flood') S.setFloodTint(0);
    fireRun = null;
    const s = $('#hzSheet');
    if (s && !s.hidden) { if (silent) { s.hidden = true; s.classList.remove('in'); } else { s.classList.add('out'); s.classList.remove('in'); setTimeout(() => { if (!active) s.hidden = true; }, 340); } }
  }
  // leaving the map closes the view, so nothing runs behind the feed
  new MutationObserver(() => { if (active && document.body.dataset.view && document.body.dataset.view !== 'map') close(true); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && active) close(); });

  function origin() { // where you are (if you shared it), or the home town you picked for weather
    const b = S.BOUNDS, M = window.MapMe && MapMe.Me;
    if (M && M.pos && M.pos.lng > b[0] && M.pos.lng < b[2] && M.pos.lat > b[1] && M.pos.lat < b[3]) return { ll: { lng: M.pos.lng, lat: M.pos.lat }, n: 'you', live: true };
    const h = window.Live && Live.home ? Live.home() : { n: 'Gatlinburg', lat: 35.714, lng: -83.512 };
    return { ll: { lng: h.lng, lat: h.lat }, n: h.n, live: false };
  }
  function meMarker(o) {
    if (o.live) return; // the blue dot is already on the map
    const el = document.createElement('div'); el.className = 'hzme'; el.title = o.n;
    markers.push(new maplibregl.Marker({ element: el }).setLngLat(o.ll).addTo(map));
  }

  /* ---------- tiles ---------- */
  function lngLatToTile(lng, lat, z) { const n = 2 ** z; const x = (lng + 180) / 360 * n; const r = lat * RAD; const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; return [x, y]; }
  function tileToLngLat(x, y, z) { const n = 2 ** z; const lng = x / n * 360 - 180; const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / RAD; return [lng, lat]; }
  async function decodeTile(layer, z, x, y) {
    const buf = await S.getTile(layer, z, x, y); if (!buf) return null;
    const bmp = await createImageBitmap(new Blob([buf]));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width };
  }
  const terrarium = (d, o) => d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;

  /* =====================================================================
     FLOOD: only for an NWS flood alert. Says how much rain is coming, then
     shows how high water could reach around the person's own spot.
     ===================================================================== */
  const LEVELS = [
    { ft: 5, n: 'Creeks over their banks', d: 'Common with a flood watch or advisory' },
    { ft: 10, n: 'Serious flooding', d: 'Warning-level water on rivers and low roads' },
    { ft: 20, n: 'Rare, historic flood', d: 'Like the worst floods on record here' },
  ];
  let floodAnim = 0, floodM = 0, floodLevel = 0, floodCtx = null;
  const levelFor = a => /emergency/i.test(a.event) || a.severity === 'Extreme' ? 2 : /warning/i.test(a.event) ? 1 : 0;
  function nwsRain(a) { // the official wording wins: "rainfall amounts of 2 to 4 inches"
    const t = [a.description, a.headline, a.instruction].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    let m = t.match(/(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*inch/i); if (m) return `${m[1]} to ${m[2]} inches`;
    m = t.match(/up to (\d+(?:\.\d+)?)\s*inch/i); if (m) return `up to ${m[1]} inches`;
    m = t.match(/(\d+(?:\.\d+)?)\s*inch(?:es)? of rain/i); if (m) return `${m[1]} inches`;
    return null;
  }
  async function rainForecast(ll, endISO) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${ll.lat.toFixed(3)}&longitude=${ll.lng.toFixed(3)}&hourly=precipitation&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=3`;
    const j = await fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const now = Date.now(); let end = endISO ? new Date(endISO).valueOf() : now + 48 * 3600e3;
    if (!(end > now + 6 * 3600e3)) end = now + 24 * 3600e3; if (end > now + 60 * 3600e3) end = now + 60 * 3600e3;
    const hrs = j.hourly.time.map((t, i) => [localHour(t), j.hourly.precipitation[i] || 0]).filter(([t]) => t >= now - 3600e3 && t <= end);
    const total = hrs.reduce((s, h) => s + h[1], 0);
    let peak = null; for (let i = 0; i + 2 < hrs.length; i++) { const v = hrs[i][1] + hrs[i + 1][1] + hrs[i + 2][1]; if (!peak || v > peak.v) peak = { v, t: hrs[i][0] }; }
    return { total, end, peak };
  }
  async function handAt(ll) { // how far above the nearest creek or river this spot sits, in meters
    const z = 14; const [x, y] = lngLatToTile(ll.lng, ll.lat, z); const tx = Math.floor(x), ty = Math.floor(y);
    const t = await decodeTile('hand', z, tx, ty); if (!t) return null;
    const px = Math.min(t.w - 1, Math.floor((x - tx) * t.w)), py = Math.min(t.w - 1, Math.floor((y - ty) * t.w));
    return terrarium(t.d, (py * t.w + px) * 4);
  }
  const waterColor = m => ['interpolate', ['linear'], ['elevation'], 0, 'rgba(14,58,120,0.9)', m * 0.5, 'rgba(26,95,180,0.82)', Math.max(m * 0.5 + 0.01, m - 0.05), 'rgba(70,160,235,0.7)', m, 'rgba(120,200,255,0)'];
  function setWater(m) { if (map.getLayer('hz-flood')) map.setPaintProperty('hz-flood', 'color-relief-color', m < 0.15 ? 'rgba(0,0,0,0)' : waterColor(m)); }
  function riseTo(m) { // water eases up (or down) to the new level instead of jumping
    cancelAnimationFrame(floodAnim); S.setFloodTint(0);
    const from = floodM, t0 = performance.now(), dur = 1100;
    const step = now => { const u = Math.min(1, (now - t0) / dur); floodM = from + (m - from) * ease(u); setWater(floodM); if (u < 1) floodAnim = requestAnimationFrame(step); else { S.setFloodTint(m); map.once('idle', countBuildings); } };
    floodAnim = requestAnimationFrame(step);
  }
  function countBuildings() {
    const el = $('#hzBldg'); if (!el || active !== 'flood') return;
    if (!map.getLayer('buildings') || map.getZoom() < 13.2) { el.innerHTML = '<span>🏠</span><div>Zoom in to see which buildings sit low<small>Buildings at or below the water level turn orange</small></div>'; return; }
    const m = LEVELS[floodLevel].ft / M2FT, seen = new Set(); let n = 0;
    map.queryRenderedFeatures({ layers: ['buildings'] }).forEach(f => { const k = f.id != null ? f.id : JSON.stringify(f.geometry.coordinates[0] && f.geometry.coordinates[0][0]); if (seen.has(k)) return; seen.add(k); if (f.properties.f != null && f.properties.f < m) n++; });
    el.innerHTML = `<span>🏠</span><div>${n ? `${n.toLocaleString('en-US')} building${n > 1 ? 's' : ''} in view sit at or below this level` : 'No buildings in view sit below this level'}<small>Shown in orange. Move the map to check other places.</small></div>`;
  }
  function youRow(h, o) {
    const el = $('#hzYou'); if (!el) return;
    const who = o.live ? 'Your spot' : esc(o.n);
    if (h == null) { el.innerHTML = `<span>📍</span><div>${who} is outside the detailed flood map<small>The water layer covers the park and the gateway towns.</small></div>`; return; }
    const ft = Math.max(0, Math.round(h * M2FT)), lv = LEVELS[floodLevel].ft;
    const sub = ft <= lv ? 'At the level shown, water could reach this spot. Know your way to higher ground.' : ft <= lv * 2 ? 'Higher than the water shown, but nearby roads and driveways could still flood.' : 'Well above the water shown. Roads in the valleys could still flood.';
    el.innerHTML = `<span>📍</span><div>${who} ${o.live ? 'is' : 'sits'} about ${ft.toLocaleString('en-US')} ft above the nearest creek or river<small>${sub}</small></div>`;
  }
  function gaugeRow(o) {
    const g = ((window.Live && Live.st.gauges) || []).filter(x => x.lat && (x.ft != null || x.cfs != null)).map(x => ({ ...x, d: km(o.ll, x) })).sort((a, b) => a.d - b.d)[0];
    if (!g || g.d > 30) return '';
    const name = String(g.name || 'River gauge').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/,?\s*Tn$/, '').replace(/\bNr\b/g, 'near').replace(/\bAt\b/g, 'at');
    const a = g.ft24 || [], trend = a.length > 3 ? (a[a.length - 1] - a[a.length - 4] > 0.3 ? 'rising' : a[a.length - 1] - a[a.length - 4] < -0.3 ? 'falling' : 'steady') : '';
    return `<div class="hzrow"><span>📈</span><div>${esc(name)}${g.ft != null ? `: ${g.ft.toFixed(1)} ft${trend ? ', ' + trend : ''}` : ''}<small>Nearest river gauge, ${miles(g.d)} away (USGS, live)</small></div></div>`;
  }
  async function flood(a) {
    if (!a) return; const my = prep('flood'); const o = origin();
    floodLevel = levelFor(a); floodM = 0; floodCtx = { a, o };
    const official = nwsRain(a);
    const place = o.live ? 'your area' : esc(o.n);
    const s = showSheet(`<header class="hzh"><div><small>🌊 ${esc(a.event)}${a.ends || a.expires ? ' · until ' + esc(when(a.ends || a.expires)) : ''}</small><b>What this means near ${o.live ? 'you' : esc(o.n)}</b></div><button class="hzx" aria-label="Close">✕</button></header>
      <div class="hzlead"><p class="big" id="hzRain">${official ? `The National Weather Service expects ${esc(official)} of rain.` : '<span class="hzwait"></span>Checking how much rain is coming…'}</p><p id="hzRain2">${official ? '' : ''}Flooding is possible along creeks, rivers and low roads. Homes on higher ground usually stay dry, but roads can still be cut off.</p></div>
      <div class="hzk">How high water could reach</div>
      <div class="hzchips" role="group" aria-label="Water level">${LEVELS.map((l, i) => `<button data-lv="${i}" aria-pressed="${i === floodLevel}"><b>${l.ft} ft</b><small>${l.n}</small></button>`).join('')}</div>
      <div style="margin-top:6px">
        <div class="hzrow" id="hzYou"><span>📍</span><div><span class="hzwait"></span>Checking your spot…</div></div>
        <div class="hzrow" id="hzBldg"><span>🏠</span><div>Looking at buildings nearby…</div></div>
        ${gaugeRow(o)}
      </div>
      <div class="hzdo"><b>Good to know</b><ul><li>Turn around, don't drown: never drive into water on a road. A foot of moving water can float a car.</li><li>If you are told to move to higher ground, go right away.</li></ul></div>
      <p class="hzfine">Water levels are an estimate from the terrain (height above the nearest creek or river), not an official forecast. Official instructions come first: the National Weather Service, Sevier County Emergency Management, and 911 in an emergency.</p>
      <div class="hzacts"><a class="btn" href="https://www.weather.gov/mrx/" target="_blank" rel="noopener">NWS Morristown</a><button class="btn primary" data-center>${o.live ? 'Back to me' : 'Back to ' + esc(o.n)}</button></div>`);
    s.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
      floodLevel = +b.dataset.lv; s.querySelectorAll('[data-lv]').forEach(x => x.setAttribute('aria-pressed', x === b));
      const el = $('#hzBldg'); if (el) el.innerHTML = '<span>🏠</span><div>Looking at buildings nearby…</div>';
      riseTo(LEVELS[floodLevel].ft / M2FT); if (floodCtx.h !== undefined) youRow(floodCtx.h, o);
    });
    s.querySelector('[data-center]').onclick = () => camera([o.ll.lng, o.ll.lat], 14.6);
    // the water layer exists only while this view is open
    map.addSource('hz-hand', { type: 'raster-dem', tiles: ['pk://hand/{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', minzoom: 10, maxzoom: 14, bounds: S.BOUNDS });
    map.addLayer({ id: 'hz-flood', type: 'color-relief', source: 'hz-hand', paint: { 'color-relief-opacity': 0.86, 'color-relief-color': 'rgba(0,0,0,0)' } }, map.getLayer('landuse') ? 'landuse' : undefined);
    meMarker(o);
    camera([o.ll.lng, o.ll.lat], 14.6);
    map.once('moveend', () => { if (my === token) riseTo(LEVELS[floodLevel].ft / M2FT); });
    map.on('moveend', onFloodMove);
    handAt(o.ll).then(h => { if (my !== token) return; floodCtx.h = h; youRow(h, o); }).catch(() => { if (my === token) youRow(null, o); });
    if (!official) rainForecast(o.ll, a.ends || a.expires).then(r => {
      if (my !== token) return; const el = $('#hzRain'); if (!el) return;
      const amt = r.total < 0.05 ? 'Little rain' : r.total < 0.95 ? `About ${r.total.toFixed(1)} inch${r.total >= 0.95 ? 'es' : ''} of rain` : `About ${r.total.toFixed(1)} inches of rain`;
      el.textContent = `${amt} ${r.total < 0.05 ? 'is' : 'is'} in the forecast for ${o.live ? 'your area' : o.n} through ${when(new Date(r.end).toISOString())}.`;
      if (r.peak && r.peak.v >= 0.3) $('#hzRain2').textContent = `Heaviest around ${when(new Date(r.peak.t).toISOString())}. ` + $('#hzRain2').textContent;
    }).catch(() => { if (my === token && $('#hzRain')) $('#hzRain').textContent = `Heavy rain is possible in ${place}. Check the alert for amounts.`; });
  }
  function onFloodMove() { if (active !== 'flood') { map.off('moveend', onFloodMove); return; } map.once('idle', countBuildings); }

  /* =====================================================================
     WILDFIRE: only for a fire that was actually reported. Shows the live
     wind there and a rough estimate of where it could go if not contained.
     ===================================================================== */
  const HOURS = [3, 6, 12];
  const GRIDP = (() => { const pts = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) pts.push([-84.10 + i * (1.22 / 6), 35.33 + j * (0.70 / 5)]); return pts; })(); // same weather grid as the live layer
  let fireAnim = 0, fireRun = null, fireH = 0;
  function windAt(ll) {
    const g = window.Live && Live.st.grid;
    if (g && g.cells) { let best = null, bd = 1e9; GRIDP.forEach((p, i) => { const c = g.cells[i]; if (!c || c.wind_direction_10m == null) return; const d = Math.hypot((p[0] - ll.lng) * 0.81, p[1] - ll.lat); if (d < bd) { bd = d; best = c; } }); if (best) return { dir: best.wind_direction_10m, spd: best.wind_speed_10m, rh: best.relative_humidity_2m, live: true }; }
    const c = window.Live && Live.st.wx && Live.st.wx.current;
    if (c) return { dir: c.wind_direction_10m, spd: c.wind_speed_10m, gust: c.wind_gusts_10m, rh: c.relative_humidity_2m, live: true };
    return { dir: 225, spd: 8, rh: 50, live: false };
  }
  // minimum-travel-time spread (the original fire model): slope, wind and fuel read from the imagery
  async function spread(ll, w) {
    const Z = 13, N = 360, cellPx = 2;
    const [cx, cy] = lngLatToTile(ll.lng, ll.lat, Z); const half = N * cellPx / 2 / 256;
    const x0 = cx - half, y0 = cy - half, x1 = cx + half, y1 = cy + half;
    const tiles = {}, jobs = [], season = S.seasonId();
    for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) {
      jobs.push(decodeTile('terrain', Z, tx, ty).then(d => tiles['t' + tx + '_' + ty] = d && d.d).catch(() => {}));
      jobs.push(decodeTile('img-' + season, Z, tx, ty).then(d => tiles['i' + tx + '_' + ty] = d && d.d).catch(() => {}));
    }
    await Promise.all(jobs);
    if (!tiles['t' + Math.floor(cx) + '_' + Math.floor(cy)]) return null;
    const E = new Float32Array(N * N), F = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const px = x0 + (i + 0.5) * cellPx / 256, py = y0 + (j + 0.5) * cellPx / 256;
      const tx = Math.floor(px), ty = Math.floor(py); const lx = Math.min(255, Math.floor((px - tx) * 256)), ly = Math.min(255, Math.floor((py - ty) * 256));
      const t = tiles['t' + tx + '_' + ty], im = tiles['i' + tx + '_' + ty]; const o = (ly * 256 + lx) * 4;
      E[j * N + i] = t ? terrarium(t, o) : 0;
      let fu = 1;
      if (im) {
        const r = im[o], g = im[o + 1], b = im[o + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (r + g + b) / 3;
        if (l > 120 && mx - mn < 40) fu = 0.03;            // pavement, rooftops, rock
        else if (b > g && b > r && l < 70) fu = 0;          // open water
        else if (l > 150) fu = 0.3;
        else fu = 0.75 + 0.5 * Math.min(1, Math.max(0, (g - b) / 60));
      }
      F[j * N + i] = fu * (0.8 + 0.4 * hash(i, j)); // natural patchiness
    }
    const cellM = cellPx * 40075016.7 / (256 * 2 ** Z) * Math.cos(ll.lat * RAD);
    const dry = Math.min(1, Math.max(0.2, 1.15 - (w.rh == null ? 50 : w.rh) / 100));
    const T = travelTimes(N, E, F, cellM, [N >> 1, N >> 1], w.dir, Math.max(2, w.spd), dry, HOURS[HOURS.length - 1] * 60 + 30);
    const nw = tileToLngLat(x0, y0, Z), se = tileToLngLat(x1, y1, Z);
    return { N, T, cellM, coords: [[nw[0], nw[1]], [se[0], nw[1]], [se[0], se[1]], [nw[0], se[1]]], dry };
  }
  function hash(i, j) { let h = (i * 374761393 + j * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function travelTimes(N, E, F, cm, origin, windFrom, mph, dry, maxMin) {
    const U = mph * 1.609; // km/h
    const LB = 1 + 8.729 * Math.pow(1 - Math.exp(-0.03 * U), 2.155);
    const ecc = Math.sqrt(1 - 1 / (LB * LB));
    const Rhead = (0.9 + 0.12 * U) * (0.35 + dry); // m/min, hardwood litter / understory
    const windTo = (windFrom + 180) * RAD; // wind FROM -> spreads TO
    const nb = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (!dx && !dy) continue; if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue; if ((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0)) continue; nb.push([dx, dy, Math.hypot(dx, dy)]); }
    const T = new Float32Array(N * N).fill(Infinity);
    const hi = new Int32Array(N * N * 4), hv = new Float32Array(N * N * 4); let hn = 0; // binary heap
    const push = (i, v) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= v) break; hi[k] = hi[p]; hv[k] = hv[p]; k = p; } hi[k] = i; hv[k] = v; };
    const pop = () => { const ri = hi[0]; const lv = hv[--hn], li = hi[hn]; let k = 0; while (true) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hv[c + 1] < hv[c]) c++; if (hv[c] >= lv) break; hi[k] = hi[c]; hv[k] = hv[c]; k = c; } hi[k] = li; hv[k] = lv; return ri; };
    const o = origin[1] * N + origin[0]; T[o] = 0; push(o, 0);
    while (hn > 0) {
      const t0 = hv[0]; const c = pop(); if (t0 > T[c]) continue; if (t0 > maxMin) break;
      const cx = c % N, cy = (c / N) | 0;
      for (const [dx, dy, d] of nb) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = ny * N + nx; const fu = F[n]; if (fu < 0.05) continue;
        const dist = d * cm; const tanS = (E[n] - E[c]) / dist;
        const sf = tanS > 0 ? Math.exp(3.533 * Math.pow(tanS, 1.2)) : Math.max(0.45, 1 + tanS * 0.9);
        const th = Math.atan2(dx, -dy) - windTo; const rw = (1 - ecc) / (1 - ecc * Math.cos(th));
        const R = Rhead * rw * sf * fu * Math.min(F[c] + 0.3, 1.2);
        const nt = t0 + dist / Math.max(R, 0.02);
        if (nt < T[n]) { T[n] = nt; push(n, nt); }
      }
    }
    return T;
  }
  // a calm, flat estimate: amber area with a soft edge, no flames
  function paintFire(cv, run, tmin) {
    const N = run.N, T = run.T, g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    for (let k = 0; k < N * N; k++) {
      const a = T[k]; if (!(a <= tmin)) continue;
      const x = k % N, y = (k / N) | 0, o = k * 4;
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1 || !(T[k - 1] <= tmin) || !(T[k + 1] <= tmin) || !(T[k - N] <= tmin) || !(T[k + N] <= tmin);
      if (edge) { d[o] = 255; d[o + 1] = 214; d[o + 2] = 150; d[o + 3] = 240; continue; }
      const u = Math.min(1, a / Math.max(1, tmin));
      d[o] = 214 + 30 * u; d[o + 1] = 104 + 60 * u; d[o + 2] = 40 + 30 * u; d[o + 3] = 120 + 40 * (1 - u);
    }
    g.putImageData(img, 0, 0);
  }
  const acresAt = (run, tmin) => { let n = 0; for (let k = 0; k < run.T.length; k++) if (run.T[k] <= tmin) n++; return n * run.cellM * run.cellM / 4046.86; };
  function growTo(h) { // the shaded area eases out to the new time instead of jumping
    const run = fireRun; if (!run) return; cancelAnimationFrame(fireAnim);
    const src = map.getSource('hz-fire'); const from = fireH, to = h * 60, t0 = performance.now(), dur = 1200;
    if (src && src.play) src.play();
    const step = now => { if (fireRun !== run) return; const u = Math.min(1, (now - t0) / dur); fireH = from + (to - from) * ease(u); paintFire(run.cv, run, fireH); if (u < 1) fireAnim = requestAnimationFrame(step); else if (src && src.pause) src.pause(); };
    fireAnim = requestAnimationFrame(step);
  }
  function fireStats(h) {
    const run = fireRun, el = $('#hzAcres'); if (!el) return;
    if (!run) { el.innerHTML = '<span>🗺️</span><div>The spread estimate works inside the detailed map area<small>Wind is still shown on the map.</small></div>'; return; }
    const ac = acresAt(run, h * 60);
    el.innerHTML = `<span>🗺️</span><div>About ${ac < 10 ? Math.max(1, Math.round(ac)) : Math.round(ac / 10) * 10 > 1000 ? (Math.round(ac / 100) * 100).toLocaleString('en-US') : (Math.round(ac / 10) * 10).toLocaleString('en-US')} acres after ${h} hours, if no one fights it<small>Shaded on the map. Real fires are usually slowed by crews, roads, creeks and rain.</small></div>`;
  }
  const confText = c => ({ l: 'low', n: 'medium', h: 'high', low: 'low', nominal: 'medium', high: 'high' }[String(c).toLowerCase()] || (isFinite(+c) ? (+c >= 80 ? 'high' : +c >= 40 ? 'medium' : 'low') : 'unknown'));
  function seenAt(f) { if (!f.date) return ''; const t = String(f.time || '0000').padStart(4, '0'); const d = new Date(`${f.date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`); return isNaN(d) ? f.date : d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
  async function fire(f) {
    if (!f || f.lat == null) return; const my = prep('fire'); const o = origin();
    const ll = { lng: +f.lng, lat: +f.lat }, w = windAt(ll), to = (w.dir + 180) % 360;
    const dist = km(o.ll, ll), toward = Math.abs(((bearing(ll, o.ll) - to + 540) % 360) - 180) < 45 && dist < 25;
    fireH = 0; fireRun = null;
    const who = o.live ? 'you' : esc(o.n);
    const s = showSheet(`<header class="hzh"><div><small>🔥 Fire reported by satellite${seenAt(f) ? ' · ' + esc(seenAt(f)) : ''}</small><b>Wind and possible spread</b></div><button class="hzx" aria-label="Close">✕</button></header>
      <div class="hzlead"><p class="big">Wind from the ${compass(w.dir)} at ${Math.round(w.spd)} mph${w.gust ? `, gusts ${Math.round(w.gust)}` : ''}.</p><p>If this fire is not contained, it would mostly move toward the ${compass(to)}, faster uphill. ${w.rh != null ? `Humidity is ${Math.round(w.rh)}%${w.rh < 30 ? ', which helps fires spread' : w.rh > 70 ? ', which slows fires down' : ''}.` : ''}${w.live ? '' : ' Live wind is not available right now, so this uses a typical wind.'}</p></div>
      <div class="hzk">Rough estimate if not contained</div>
      <div class="hzchips fire" role="group" aria-label="Time">${HOURS.map((h, i) => `<button data-h="${h}" aria-pressed="${i === 0}"><b>${h} hr</b><small>${i === 0 ? 'Next few hours' : i === 1 ? 'This afternoon or night' : 'Half a day'}</small></button>`).join('')}</div>
      <div style="margin-top:6px">
        <div class="hzrow" id="hzAcres"><span>🗺️</span><div><span class="hzwait"></span>Working out the estimate from the terrain…</div></div>
        <div class="hzrow"><span>📍</span><div>${miles(dist)} from ${who}<small>${toward ? `The wind is blowing from the fire toward ${who}. Keep an eye on official updates.` : `The wind is blowing away from ${who} right now.`}</small></div></div>
        <div class="hzrow"><span>🛰️</span><div>Satellite confidence: ${confText(f.conf)}${f.sat ? ` (${esc(f.sat)})` : ''}<small>Many heat detections are controlled burns, brush piles or fires already out.</small></div></div>
      </div>
      <p class="hzfine">This is an estimate from slope, today's wind and the vegetation in satellite imagery, not an official fire forecast. Official instructions come first: Sevier County Emergency Management, the National Park Service, and 911 to report a fire or in an emergency. If you are told to leave, leave.</p>
      <div class="hzacts"><button class="btn" data-center>Show the fire</button><button class="btn primary" data-me>${o.live ? 'Show me too' : 'Show ' + esc(o.n)}</button></div>`);
    s.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { s.querySelectorAll('[data-h]').forEach(x => x.setAttribute('aria-pressed', x === b)); growTo(+b.dataset.h); fireStats(+b.dataset.h); });
    s.querySelector('[data-center]').onclick = () => camera([ll.lng, ll.lat], 12.6);
    s.querySelector('[data-me]').onclick = () => { const pad = 60; map.fitBounds([[Math.min(ll.lng, o.ll.lng), Math.min(ll.lat, o.ll.lat)], [Math.max(ll.lng, o.ll.lng), Math.max(ll.lat, o.ll.lat)]], { padding: { top: pad + 60, left: pad, right: pad, bottom: pad + sheetH() }, maxZoom: 13.5, pitch: 45, duration: 2200, easing: ease }); };
    // wind arrow sits on the fire, pointing where the wind is going
    const el = document.createElement('div'); el.className = 'hzwind'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<svg viewBox="-75 -75 150 150"><circle r="70" fill="rgba(10,16,14,.18)" stroke="rgba(255,255,255,.35)" stroke-width="1.5" stroke-dasharray="3 5"/><line x1="0" y1="40" x2="0" y2="-52" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".92"/><path d="M-14 -42 L0 -64 L14 -42 Z" fill="#fff"/>${[0, 1, 2].map(() => '<path class="chev" d="M-10 6 L0 -4 L10 6" fill="none" stroke="#9cd2ff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>').join('')}</svg>`;
    markers.push(new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map', rotation: to }).setLngLat(ll).addTo(map));
    meMarker(o);
    camera([ll.lng, ll.lat], 12.6);
    // the estimate is worked out once, then drawn as a still picture (no frame-by-frame animation)
    const run = await spread(ll, w).catch(e => { console.warn('[hazards] spread', e); return null; });
    if (my !== token) return;
    if (!run) { fireStats(HOURS[0]); return; }
    const cv = document.createElement('canvas'); cv.width = cv.height = run.N; run.cv = cv; fireRun = run;
    paintFire(cv, run, 0.01);
    map.addSource('hz-fire', { type: 'canvas', canvas: cv, coordinates: run.coords, animate: false });
    map.addLayer({ id: 'hz-fire', type: 'raster', source: 'hz-fire', paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, map.getLayer('lbl-water') ? 'lbl-water' : undefined);
    const first = +(s.querySelector('[data-h][aria-pressed=true]') || {}).dataset?.h || HOURS[0];
    fireStats(first);
    if (map.isMoving()) map.once('moveend', () => { if (my === token) growTo(first); }); else growTo(first);
  }

  window.HazardViews = { flood, fire, close, get active() { return active; }, models: { travelTimes, handAt, rainForecast, nwsRain } };
})();
