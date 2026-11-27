/* =====================================================================
   LOCALS: features built for people who live here.
   - Sunrise and valley fog forecast (where the sea of clouds will be)
   - "Is it worth going?" score for Cades Cove, Kuwohi, Newfound Gap, Dollywood
   - Neighbor alerts for your own road: creeks, fire, ice, outages, reports
   - Local's mode: Parkway backup now, back roads, when the crowds thin out
   - Wildlife and bloom sightings, a memory layer, a local business board
   Loaded after the main app. Uses the map, Live and Social objects from it.
   ===================================================================== */
(() => {
  'use strict';
  const TZN = 'America/New_York';
  const FEEDS = 'https://raw.githubusercontent.com/Isaacalmighty/smokies-live/feeds/live/';
  const OM = 'https://api.open-meteo.com/v1/forecast?';
  const q = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const km = (a, b) => Math.hypot((a.lng - b.lng) * 90.3, (a.lat - b.lat) * 111.2);
  let map = null; // the app's MapLibre map, from window.__smokies once it exists
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const stopOrbit = () => { try { window.__smokies && window.__smokies.stopOrbit && window.__smokies.stopOrbit(); } catch (e) { /* not orbiting */ } };
  function toast(msg) { const t = q('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 2600); }
  const pref = {
    get(k, d) { try { const v = localStorage.getItem('locals.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('locals.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  async function jget(url, ms = 15000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  // Eastern-time clock helpers. Open-Meteo hours come back as local "YYYY-MM-DDTHH:00" strings.
  const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZN, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  function et(d = new Date()) { const p = Object.fromEntries(etFmt.formatToParts(d).map(x => [x.type, x.value])); return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), key: `${p.year}-${p.month}-${p.day}T${p.hour}:00`, day: `${p.year}-${p.month}-${p.day}` }; }
  const hh = h => { const x = ((h % 24) + 24) % 24; return (x % 12 || 12) + (x < 12 ? ' AM' : ' PM'); };
  const clock = s => { if (!s) return ''; const [H, M] = s.slice(11, 16).split(':').map(Number); return `${H % 12 || 12}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; };
  const dayName = (day, today) => { if (day === today) return 'Today'; const t = new Date(today + 'T12:00:00'); t.setDate(t.getDate() + 1); if (day === t.toISOString().slice(0, 10)) return 'Tomorrow'; return new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }); };
  const ft = m => Math.round(m * 3.28084 / 10) * 10;
  const fmtFt = f => f.toLocaleString('en-US') + ' ft';

  const S = { tab: pref.get('tab', 'sky'), wx: null, flow: null, nps: [], fog: null, worth: null, localMode: pref.get('localMode', false), places: pref.get('places', []), hits: [], seen: pref.get('seen', {}), layers: pref.get('layers', { wild: true, memory: true, board: true }), markers: [], flowMarkers: [], placeWx: null, open: false, sel: null };

  /* ---------- places we read the weather at ---------- */
  // v: valley floor, o: sunrise overlook, d: destination. Elevations come back from Open-Meteo's terrain model.
  const SITES = [
    { k: 'gat', n: 'Gatlinburg', lat: 35.714, lng: -83.512, v: 'tn' },
    { k: 'pf', n: 'Pigeon Forge', lat: 35.788, lng: -83.554, v: 'tn' },
    { k: 'sev', n: 'Sevierville', lat: 35.868, lng: -83.562, v: 'tn' },
    { k: 'tow', n: 'Townsend', lat: 35.675, lng: -83.756, v: 'tn' },
    { k: 'cc', n: 'Cades Cove', lat: 35.597, lng: -83.812, v: 'tn', d: 1 },
    { k: 'wv', n: 'Wears Valley', lat: 35.714, lng: -83.652, v: 'tn' },
    { k: 'che', n: 'Cherokee', lat: 35.484, lng: -83.315, v: 'nc' },
    { k: 'bry', n: 'Bryson City', lat: 35.431, lng: -83.448, v: 'nc' },
    { k: 'chp', n: 'Chimneys Picnic Area', lat: 35.6363, lng: -83.4934 },
    { k: 'lr', n: 'Look Rock', lat: 35.6329, lng: -83.9428, o: { walk: 'Short paved walk to the tower', w: 0.95, face: 'east over the Great Valley and the high peaks' } },
    { k: 'fhp', n: 'Foothills Parkway, Wears Valley', lat: 35.7046, lng: -83.8148, o: { walk: 'Pull-offs right on the road', w: 1, face: 'south into Wears Valley' } },
    { k: 'chm', n: 'Chimney Tops', lat: 35.6295, lng: -83.4778 },
    { k: 'nfg', n: 'Newfound Gap', lat: 35.6108, lng: -83.4256, d: 1, o: { walk: 'Drive up, view from the lot', w: 1, face: 'north over Tennessee and east into North Carolina' } },
    { k: 'min', n: 'Mount Mingus', lat: 35.6179, lng: -83.4590 },
    { k: 'lec', n: 'Myrtle Point, Mount Le Conte', lat: 35.6533, lng: -83.4318, o: { walk: 'Overnight or a 5+ mile hike up', w: 0.8, face: 'east, the classic Smokies sunrise' } },
    { k: 'kuw', n: 'Kuwohi (Clingmans Dome)', lat: 35.5629, lng: -83.4984, d: 1, o: { walk: 'Half-mile steep paved walk to the tower', w: 0.92, face: 'all directions from the highest point in the park' } },
    { k: 'dol', n: 'Dollywood', lat: 35.7951, lng: -83.5312, d: 1 },
  ];
  const SITE = Object.fromEntries(SITES.map(s => [s.k, s]));

  async function loadWx() {
    const cached = pref.get('wx', null);
    if (cached && Date.now() - cached.t < 25 * 60e3) { S.wx = cached.d; return; }
    const vars = 'temperature_2m,dew_point_2m,relative_humidity_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,precipitation,precipitation_probability,visibility,weather_code,apparent_temperature,snowfall';
    const url = OM + `latitude=${SITES.map(s => s.lat).join(',')}&longitude=${SITES.map(s => s.lng).join(',')}&hourly=${vars}&daily=sunrise,sunset&past_days=1&forecast_days=4&timezone=America%2FNew_York&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
    const arr = await jget(url, 20000);
    const d = {}; SITES.forEach((s, i) => { const r = arr[i]; d[s.k] = { elev: r.elevation, h: r.hourly, daily: r.daily }; });
    S.wx = d; pref.set('wx', { t: Date.now(), d });
  }
  async function loadFlow() {
    try { const j = await jget(FEEDS + 'flow.json?t=' + Math.floor(Date.now() / 300e3), 12000); if (Date.now() - new Date(j.updated) < 3 * 3600e3) S.flow = j; } catch (e) { S.flow = null; }
  }
  async function loadNps() { // park alerts (road closures) ride along in the traffic feed
    try { const j = await jget(FEEDS + 'traffic.json?t=' + Math.floor(Date.now() / 300e3), 12000); S.nps = (j.incidents || []).filter(x => x.source === 'National Park Service'); } catch (e) { S.nps = []; }
  }
  const idxOf = (h, key) => h.time.indexOf(key);
  const at = (k, v, i) => { const s = S.wx && S.wx[k]; return s ? s.h[v][i] : null; };
  const avg = (k, v, a, b) => { let s = 0, n = 0; for (let i = a; i <= b; i++) { const x = at(k, v, i); if (x != null) { s += x; n++; } } return n ? s / n : null; };
  const sum = (k, v, a, b) => { let s = 0; for (let i = a; i <= b; i++) s += at(k, v, i) || 0; return s; };

  /* =====================================================================
     1. VALLEY FOG AND SUNRISE FORECAST
     Fog fills the valleys after clear, calm nights when the air near the
     ground is close to saturated and cold air pools under warmer air above
     (an inversion). We score each valley at sunrise, find how high the fog
     reaches from the humidity profile up the mountainside, and pick the
     overlook that sits in clear air above it.
     ===================================================================== */
  function valleyFog(k, i) {
    const rh = at(k, 'relative_humidity_2m', i), T = at(k, 'temperature_2m', i), Td = at(k, 'dew_point_2m', i);
    if (rh == null) return 0;
    const wind = avg(k, 'wind_speed_10m', i - 3, i), sky = avg(k, 'cloud_cover', i - 7, i - 1), rain = sum(k, 'precipitation', i - 24, i - 1);
    const vis = at(k, 'visibility', i), code = at(k, 'weather_code', i), pr = at(k, 'precipitation', i);
    let p = 0.32 * clamp((rh - 85) / 12) + 0.22 * clamp((4.5 - (T - Td)) / 4) + 0.16 * clamp((9 - wind) / 7) + 0.18 * clamp((85 - sky) / 65) + 0.12 * clamp(rain / 0.15);
    if (vis != null && vis < 1500) p = Math.max(p, 0.85);
    if (code === 45 || code === 48) p = Math.max(p, 0.9);
    if (pr > 0.02) p *= 0.45; // that's rain and low cloud, not a fog sea
    return clamp(p);
  }
  function fogMorning(day) {
    const g = S.wx.gat; const sr = g.daily.sunrise[g.daily.time.indexOf(day)]; if (!sr) return null;
    const H = +sr.slice(11, 13); const i0 = idxOf(g.h, `${day}T${String(H).padStart(2, '0')}:00`); if (i0 < 8) return null;
    const hours = [i0 - 1, i0, i0 + 1];
    const tn = SITES.filter(s => s.v === 'tn'), nc = SITES.filter(s => s.v === 'nc');
    const side = list => { const v = list.map(s => Math.max(...hours.map(i => valleyFog(s.k, i)))); return { p: v.reduce((a, b) => a + b, 0) / v.length, by: Object.fromEntries(list.map((s, j) => [s.k, v[j]])) }; };
    const T = side(tn), N = side(nc), p = Math.max(T.p, N.p);
    // how high the fog reaches: walk up the mountainside until the air dries out
    const prof = SITES.filter(s => !s.v && S.wx[s.k]).map(s => ({ s, e: S.wx[s.k].elev, rh: at(s.k, 'relative_humidity_2m', i0), lo: at(s.k, 'cloud_cover_low', i0) })).sort((a, b) => a.e - b.e);
    const floor = tn.reduce((m, s) => Math.min(m, S.wx[s.k].elev), 1e9);
    let top = floor + 120, socked = true;
    for (const x of prof) { if (x.rh < 90 && x.lo < 60) { socked = false; break; } top = x.e; }
    if (!socked) { const firstDry = prof.find(x => x.rh < 90 && x.lo < 60); top = Math.max(floor + 120, (top + firstDry.e) / 2); }
    // inversion: warmer up high than the normal cooling with height would give
    const ridge = 'lec', inv = at(ridge, 'temperature_2m', i0) - (at('gat', 'temperature_2m', i0) - 3.3 * ((S.wx[ridge].elev - S.wx.gat.elev) * 3.28084 / 1000));
    // the overlooks
    const kuwShut = kuwohiRoadClosed(new Date(day + 'T12:00:00'));
    const looks = SITES.filter(s => s.o).map(s => {
      const e = S.wx[s.k].elev, rh = at(s.k, 'relative_humidity_2m', i0), lo = at(s.k, 'cloud_cover_low', i0), pp = at(s.k, 'precipitation_probability', i0) || 0;
      const clear = clamp((93 - rh) / 15) * clamp((65 - lo) / 50) * (1 - pp / 100 * 0.7);
      const above = clamp((e - top) / 250);
      const shut = s.k === 'kuw' && kuwShut;
      const score = clear * (p > 0.35 ? above : 1) * s.o.w * (shut ? 0.55 : 1) * (0.85 + 0.15 * clamp((e - 600) / 1400));
      return { s, e, clear, above, score, shut, rh, lo };
    }).sort((a, b) => b.score - a.score);
    const best = looks[0];
    const hi = avg('kuw', 'cloud_cover_high', i0 - 1, i0 + 1) + 0.6 * avg('kuw', 'cloud_cover_mid', i0 - 1, i0 + 1), low = at('lec', 'cloud_cover_low', i0);
    const color = low > 80 ? ['grey', 'Grey and muted, thick cloud'] : hi > 25 && hi < 75 ? ['fire', 'Pink and orange: high clouds to catch the light'] : hi <= 25 ? ['clean', 'Clean, clear glow'] : ['soft', 'Soft colors through a high veil'];
    const sea = clamp(p * (best ? best.clear * Math.max(best.above, 0.2) : 0) * 1.15);
    return { day, sunrise: sr, i0, p, tn: T, nc: N, top, topFt: ft(top), socked: socked && p > 0.3, inv, looks, best, color, sea, kuwShut };
  }
  function buildFog() {
    if (!S.wx) return;
    const now = et(), days = S.wx.gat.daily.time.filter(d => d >= now.day);
    let list = days.map(fogMorning).filter(Boolean);
    if (list.length && list[0].day === now.day && now.h >= 10) list = list.slice(1); // this morning is over
    S.fog = list.slice(0, 3);
  }
  function fogWords(f) {
    if (!f) return '';
    if (f.socked) return 'Clouds from the valleys to the ridgetops. No sea of clouds, just fog everywhere.';
    if (f.p >= 0.6) return `Valleys likely full of fog up to about ${fmtFt(f.topFt)}.`;
    if (f.p >= 0.35) return `Patchy valley fog possible, mostly below ${fmtFt(f.topFt)}.`;
    return 'Valleys mostly clear at sunrise.';
  }
  const pct = x => Math.round(x * 100) + '%';

  /* =====================================================================
     2. IS IT WORTH GOING?
     One 0 to 10 number per place. It mixes the weather there over the next
     hours, the view (are you inside the cloud?), live road speeds from
     TomTom, closures (seasonal rules plus park alerts) and a crowd and
     parking model by season, holiday, weekday and hour.
     ===================================================================== */
  function thanksgiving(y) { const d = new Date(y, 10, 1); const first = (4 - d.getDay() + 7) % 7 + 1; return first + 21; }
  function holiday(t) { // busy holiday windows
    const tg = thanksgiving(t.y);
    if (t.m === 11 && t.d >= tg - 1 && t.d <= tg + 3) return 'Thanksgiving weekend';
    if ((t.m === 12 && t.d >= 20) || (t.m === 1 && t.d <= 2)) return 'Holiday week';
    if (t.m === 7 && t.d >= 1 && t.d <= 6) return 'Fourth of July week';
    if (t.m === 10 && t.wd >= 5) return 'October weekend';
    return null;
  }
  const SEASON = [0, 0.25, 0.3, 0.5, 0.62, 0.66, 0.9, 1, 0.82, 0.7, 1, 0.66, 0.62];
  const HOURS = { // share of the daily peak, by hour 0..23
    cc: [0, 0, 0, 0, 0, 0, .1, .3, .55, .8, .95, 1, 1, 1, .95, .85, .7, .5, .3, .1, 0, 0, 0, 0],
    kuw: [0, 0, 0, 0, 0, 0, .15, .2, .3, .5, .7, .85, .95, 1, 1, .95, .9, .9, .85, .5, .15, 0, 0, 0],
    nfg: [.02, 0, 0, 0, 0, .05, .2, .3, .45, .65, .85, 1, 1, 1, 1, .95, .85, .7, .5, .3, .15, .08, .04, .02],
    dol: [0, 0, 0, 0, 0, 0, 0, 0, .1, .4, .8, .95, 1, 1, 1, .95, .9, .9, .85, .75, .6, .2, 0, 0],
    pkwy: [.08, .04, .02, .02, .03, .08, .2, .35, .5, .62, .75, .88, .95, 1, 1, .98, .95, .95, .92, .85, .7, .5, .3, .15],
  };
  function crowd(dest, t) {
    let hours = HOURS[dest];
    if (dest === 'dol' && (t.m === 11 && t.d >= 7 || t.m === 12)) hours = hours.map((v, h) => h >= 17 && h <= 21 ? 1 : v); // Christmas lights evenings
    const wk = [1.1, 0.85, 0.8, 0.82, 0.88, 1.05, 1.25][t.wd];
    return clamp(SEASON[t.m] * wk * (holiday(t) ? 1.3 : 1) * hours[t.h]);
  }
  function kuwohiRoadClosed(d) { const m = d.getMonth() + 1, day = d.getDate(); return m === 12 || m <= 3; } // Clingmans Dome Rd: closed Dec 1 to Mar 31
  function npsSays(re) { return S.nps.find(a => re.test(a.title + ' ' + (a.desc || '')) && /clos/i.test(a.title + ' ' + (a.desc || ''))); }
  const DEST = [
    { k: 'cc', n: 'Cades Cove', sub: 'Loop road, wildlife, cabins', roads: ['laurel', 'loop'], view: false, ll: [-83.812, 35.597],
      shut(t, sr, ss) { if (t.wd === 3 && t.m >= 5 && t.m <= 9) return 'Vehicle-free Wednesday: bikes and walkers only'; const a = npsSays(/cades cove|laurel creek/i); if (a) return a.title; const now = t.h + t.min / 60; if (now < sr - 0.6 || now > ss + 0.3) return 'Loop gates are closed sunset to sunrise'; return null; } },
    { k: 'kuw', n: 'Kuwohi', sub: 'Clingmans Dome, highest point', roads: ['newfound', 'kuwohi'], view: true, ll: [-83.4984, 35.5629],
      shut(t) { if (kuwohiRoadClosed(new Date(t.y, t.m - 1, t.d))) return 'Road closed for winter (Dec 1 to Mar 31). Hikers can walk the road.'; const a = npsSays(/clingman|kuwohi/i) || npsSays(/newfound gap road|us-?441/i); return a ? a.title : null; } },
    { k: 'nfg', n: 'Newfound Gap', sub: 'Overlook on the state line', roads: ['newfound'], view: true, ll: [-83.4256, 35.6108],
      shut() { const a = npsSays(/newfound gap|us-?441/i); return a ? a.title : null; } },
    { k: 'dol', n: 'Dollywood', sub: 'Theme park, Pigeon Forge', roads: ['dollywood', 'veterans', 'pkwy_pfs'], view: false, ll: [-83.5312, 35.7951],
      shut(t) { const md = t.m * 100 + t.d; if (md >= 104 && md < 313) return 'Closed for the season. Reopens in March.'; if (t.h < 9 || t.h >= 22) return 'Closed for the night (hours vary by day)'; return null; } },
  ];
  function roadRatio(ids) {
    if (!S.flow) return null;
    const r = S.flow.items.filter(x => ids.includes(x.id) && x.cur && x.free);
    if (!r.length) return null;
    if (r.some(x => x.closed)) return { ratio: 0, closed: true, slow: r.find(x => x.closed) };
    const w = r.reduce((m, x) => (x.cur / x.free < m.cur / m.free ? x : m), r[0]);
    return { ratio: clamp(w.cur / w.free), slow: w };
  }
  function wxScore(k, i, view) {
    const pp = at(k, 'precipitation_probability', i) ?? (at(k, 'precipitation', i) > 0.01 ? 70 : 10), pr = at(k, 'precipitation', i) || 0;
    const feel = at(k, 'apparent_temperature', i), wind = at(k, 'wind_speed_10m', i), rh = at(k, 'relative_humidity_2m', i), lo = at(k, 'cloud_cover_low', i), vis = at(k, 'visibility', i);
    const why = [];
    let s = 1 - 0.55 * clamp(pp / 100) - 0.35 * clamp(pr / 0.15);
    if (pp >= 50) why.push(['rain', `${Math.round(pp)}% chance of rain`]);
    if (feel < 25) { s -= 0.2; why.push(['cold', `Feels like ${Math.round(feel)}°`]); } else if (feel > 92) { s -= 0.15; why.push(['hot', `Feels like ${Math.round(feel)}°`]); }
    if (wind > 22) { s -= 0.15; why.push(['wind', `Wind ${Math.round(wind)} mph`]); }
    let inCloud = false;
    if (view) {
      inCloud = rh >= 96 || lo >= 75 || (vis != null && vis < 2000);
      if (inCloud) { s -= 0.5; why.push(['cloud', 'You would be inside the cloud: no view']); }
      else if (lo < 25 && rh < 80) { s += 0.08; why.push(['clear', 'Clear, long views']); }
    }
    return { s: clamp(s), why, inCloud, feel };
  }
  function buildWorth() {
    if (!S.wx) return;
    const now = new Date(), t0 = et(now), g = S.wx.gat, i0 = idxOf(g.h, t0.key); if (i0 < 0) return;
    const dIdx = g.daily.time.indexOf(t0.day), sr = +g.daily.sunrise[dIdx].slice(11, 13) + +g.daily.sunrise[dIdx].slice(14, 16) / 60, ss = +g.daily.sunset[dIdx].slice(11, 13) + +g.daily.sunset[dIdx].slice(14, 16) / 60;
    const fogNow = S.fog && S.fog[0] && S.fog[0].day === t0.day ? S.fog[0] : null;
    S.worth = DEST.map(D => {
      const at_ = (dh) => { const d = new Date(now.getTime() + dh * 3600e3); return { t: et(d), i: i0 + dh }; };
      const score = (dh, live) => {
        const { t, i } = at_(dh); const shut = D.shut(t, sr, ss); const w = wxScore(D.k, i, D.view);
        const c = crowd(D.k, t);
        let traffic = 1 - c * 0.6; const why = [...w.why];
        if (live) { const rr = roadRatio(D.roads); if (rr) { traffic = rr.ratio; if (rr.closed) why.unshift(['closed', `${rr.slow.name} is closed`]); else if (rr.ratio < 0.6) why.unshift(['traffic', `${rr.slow.name} crawling at ${Math.round(rr.slow.cur)} mph`]); else if (rr.ratio > 0.85) why.push(['go', 'Roads moving freely']); } }
        if (c > 0.75) why.push(['crowd', D.k === 'dol' ? 'Long lines likely' : 'Parking lots likely full']); else if (c < 0.3 && !shut) why.push(['quiet', 'Should be quiet']);
        if (D.view && fogNow && fogNow.p > 0.5 && !w.inCloud && t.h <= 10 && fogNow.topFt < S.wx[D.k].elev * 3.28 - 300) why.unshift(['sea', 'Sea of clouds below you this morning']);
        const dark = D.view && (t.h + 0.5 < sr || t.h > ss + 0.4);
        if (dark) why.unshift(['dark', 'After dark: stars, but no view']);
        let s = 10 * (0.42 * w.s + 0.33 * (1 - c) + 0.25 * traffic) * (dark ? 0.55 : 1);
        if (why.some(x => x[0] === 'sea')) s = Math.min(10, s + 1.5);
        if (shut) s = 0;
        return { s: Math.round(s * 10) / 10, shut, why, crowd: c, t };
      };
      const nowS = score(0, true);
      let best = null; for (let dh = 1; dh <= 20; dh++) { const x = score(dh, false); const lateDark = x.t.h >= 22 || x.t.h < 6; if (!lateDark && (x.t.day === t0.day || t0.h >= 17) && (!best || x.s > best.s + 0.2)) best = x; }
      return { D, now: nowS, best: best && best.s > nowS.s + 1 ? best : null };
    });
  }
  const verdict = s => s >= 8 ? ['Go now', 'great'] : s >= 6.5 ? ['Worth it', 'good'] : s >= 4.5 ? ['It\'s okay', 'meh'] : s > 0 ? ['Skip it', 'bad'] : ['Closed', 'shut'];

  /* =====================================================================
     3. LOCAL'S MODE: the Parkway right now, the back roads, and when the
     crowds usually thin out.
     ===================================================================== */
  function roadsNow() {
    const items = S.flow ? S.flow.items : [];
    const t = et(), c = crowd('pkwy', t);
    let thin = null; for (let dh = 0; dh <= 18; dh++) { const tt = et(new Date(Date.now() + dh * 3600e3)); if (crowd('pkwy', tt) < 0.45) { thin = { dh, t: tt }; break; } }
    const pk = items.filter(x => x.group === 'parkway' && x.cur && x.free), back = items.filter(x => x.group === 'back' && x.cur && x.free), park = items.filter(x => x.group === 'park' && x.cur && x.free);
    const worst = pk.length ? pk.reduce((m, x) => (x.cur / x.free < m.cur / m.free ? x : m)) : null;
    let tip = null;
    const r = id => { const x = items.find(y => y.id === id); return x && x.free ? x.cur / x.free : null; };
    if (r('pkwy_pf') != null && r('pkwy_pf') < 0.6 && (r('veterans') ?? 1) > 0.75 && (r('teaster') ?? 1) > 0.75) tip = 'Parkway is backed up in Pigeon Forge. Veterans Blvd and Teaster Ln are moving.';
    else if (r('pkwy_gat') != null && r('pkwy_gat') < 0.55 && (r('bypass') ?? 1) > 0.75) tip = 'Downtown Gatlinburg is crawling. The Bypass is clear to the park.';
    else if (r('pkwy_sev') != null && r('pkwy_sev') < 0.6 && (r('middlecreek') ?? 1) > 0.75) tip = 'Sevierville Parkway is slow. Middle Creek Rd is the way around.';
    return { live: !!items.length, updated: S.flow && S.flow.updated, c, thin, pk, back, park, worst, tip };
  }
  function setLocalMode(on, quiet) {
    S.localMode = on; pref.set('localMode', on); document.body.classList.toggle('locals-mode', on);
    document.querySelectorAll('[data-lmode]').forEach(b => b.setAttribute('aria-pressed', on));
    drawFlow();
    if (!quiet) toast(on ? 'Local\'s mode on: tourist stuff tucked away' : 'Local\'s mode off');
    if (S.open && S.tab === 'roads') render();
  }

  /* =====================================================================
     4. NEIGHBOR ALERTS: your road or hollow. Everything stays on this
     device. Checks run every 5 minutes while the app is open.
     ===================================================================== */
  const ALERT_KINDS = [['creek', 'Rising creeks', '🌊'], ['fire', 'Fire or smoke nearby', '🔥'], ['ice', 'Ice on the roads', '🧊'], ['power', 'Power outages', '⚡'], ['road', 'Road closed, trees, wrecks', '🚧'], ['nws', 'Weather warnings', '⚠️']];
  const RHRS = { closed: 12, wreck: 3, traffic: 2, tree: 8, ice: 12, flood: 12, power: 12, smoke: 6, bear: 4, wildlife: 4, hazard: 8 };
  function reportsNear(p, cats) {
    const SS = window.Social && Social.S; if (!SS) return [];
    const rows = [...(SS.remote || []).map(r => ({ tag: r.tag, t: r.created_at, ll: r.lng != null ? { lng: r.lng, lat: r.lat } : null, place: r.place_name, text: r.caption })),
      ...(SS.posts || []).map(x => ({ tag: x.tag, t: x.t, ll: x.place, place: x.place && x.place.name, text: x.caption }))];
    return rows.filter(r => r.ll && /^R:/.test(r.tag || '') && cats.includes(r.tag.slice(2)) && Date.now() - new Date(r.t) < (RHRS[r.tag.slice(2)] || 8) * 3600e3 && km(r.ll, p) <= p.r);
  }
  function inPoly(pt, geom) {
    const ring = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
    if (!geom) return false;
    if (geom.type === 'Polygon') return ring(geom.coordinates[0]);
    if (geom.type === 'MultiPolygon') return geom.coordinates.some(p => ring(p[0]));
    if (geom.type === 'GeometryCollection') return geom.geometries.some(g => inPoly(pt, g));
    return false;
  }
  async function loadPlaceWx() {
    if (!S.places.length) { S.placeWx = null; return; }
    const url = OM + `latitude=${S.places.map(p => p.lat.toFixed(3)).join(',')}&longitude=${S.places.map(p => p.lng.toFixed(3)).join(',')}&hourly=temperature_2m,precipitation,weather_code,snowfall&past_days=1&forecast_days=2&timezone=America%2FNew_York&temperature_unit=fahrenheit&precipitation_unit=inch`;
    try { const j = await jget(url); S.placeWx = Array.isArray(j) ? j : [j]; } catch (e) { S.placeWx = null; }
  }
  async function checkAlerts() {
    const L = window.Live && Live.st; const hits = [];
    let nwsFeats = [];
    try { const src = map.getSource('alerts'); if (src && src.getData) { const d = await src.getData(); nwsFeats = d.features || []; } } catch (e) { /* none */ }
    S.places.forEach((p, pi) => {
      const on = k => p.kinds.includes(k), push = (k, key, title, body, ll) => hits.push({ k, key: p.id + ':' + key, place: p, title, body, ll, t: Date.now() });
      if (on('creek') && L) {
        (L.gauges || []).forEach(g => {
          const d = km(g, p); if (d > Math.max(p.r, 3) + 6 || !g.ft24 || g.ft24.length < 6) return;
          const s = g.ft24, rise6 = s[s.length - 1] - s[Math.max(0, s.length - 7)], rise24 = s[s.length - 1] - Math.min(...s);
          if (rise6 >= 0.8 || rise24 >= 2) push('creek', 'g' + g.id + ':' + Math.round(s[s.length - 1] * 2), `${g.name.replace(/ (AT|NEAR|NR) .*/i, '').replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase())} is rising`, `Up ${rise6 >= 0.8 ? rise6.toFixed(1) + ' ft in the last few hours' : rise24.toFixed(1) + ' ft today'}, now ${s[s.length - 1].toFixed(1)} ft. ${d.toFixed(0)} km from ${p.name}.`, g);
        });
        reportsNear(p, ['flood']).forEach(r => push('creek', 'rf' + r.t, 'Flooding reported near ' + p.name, (r.text || r.place || '').slice(0, 120), r.ll));
      }
      if (on('fire')) {
        (L && L.fires || []).forEach(f => { const d = km(f, p); if (d <= Math.max(10, p.r * 3)) push('fire', 'f' + f.lat.toFixed(3) + f.lng.toFixed(3) + (f.date || ''), 'Satellite spotted a fire nearby', `A heat signature ${d.toFixed(1)} km from ${p.name}${f.date ? ' on ' + f.date : ''}. Could be a controlled burn; check local news.`, f); });
        reportsNear(p, ['smoke']).forEach(r => push('fire', 'rs' + r.t, 'Fire or smoke reported near ' + p.name, (r.text || r.place || '').slice(0, 120), r.ll));
      }
      if (on('power')) reportsNear(p, ['power']).forEach(r => push('power', 'rp' + r.t, 'Power out near ' + p.name, `A neighbor reported it ${r.place ? 'at ' + r.place : ''}. ${(r.text || '').slice(0, 100)}`, r.ll));
      if (on('road')) reportsNear(p, ['closed', 'tree', 'wreck', 'ice']).forEach(r => push('road', 'rr' + r.t, ({ closed: 'Road closed', tree: 'Tree down', wreck: 'Wreck', ice: 'Ice reported' })[r.tag.slice(2)] + ' near ' + p.name, (r.place || '') + (r.text ? ': ' + r.text.slice(0, 100) : ''), r.ll));
      if (on('ice') && S.placeWx && S.placeWx[pi]) {
        const h = S.placeWx[pi].hourly, i0 = h.time.indexOf(et().key);
        if (i0 >= 0) {
          const wetBefore = (i, n) => { let s = 0; for (let j = Math.max(0, i - n); j <= i; j++) s += h.precipitation[j] || 0; return s; };
          for (let i = i0; i < Math.min(h.time.length, i0 + 14); i++) {
            const T = h.temperature_2m[i], frz = [56, 57, 66, 67].includes(h.weather_code[i]), snow = h.snowfall[i] > 0.05;
            if (frz || (T <= 32 && (snow || wetBefore(i, 6) > 0.03))) { push('ice', 'ice' + h.time[i].slice(0, 10), frz ? 'Freezing rain on your road' : snow ? 'Snow and slick roads likely' : 'Black ice likely', `${frz ? 'Freezing rain' : snow ? 'Snow' : `Wet roads and ${Math.round(T)}°`} around ${clock(h.time[i])} at ${p.name}. Bridges and shady curves first.`, p); break; }
          }
        }
      }
      if (on('nws')) nwsFeats.forEach(f => { if (inPoly([p.lng, p.lat], f.geometry)) push('nws', 'n' + f.properties.event, f.properties.event, `The National Weather Service has a ${f.properties.event.toLowerCase()} covering ${p.name}.`, p); });
    });
    // dedupe and notify the new ones
    const seen = new Set(), list = hits.filter(h => !seen.has(h.key) && seen.add(h.key));
    const fresh = list.filter(h => !S.seen[h.key]);
    S.hits = list; badge();
    if (fresh.length) {
      fresh.forEach(h => { S.seen[h.key] = Date.now(); });
      const cutoff = Date.now() - 7 * 864e5; Object.keys(S.seen).forEach(k => { if (S.seen[k] < cutoff) delete S.seen[k]; });
      pref.set('seen', S.seen);
      notify(fresh);
    }
    if (S.open && S.tab === 'alerts') render();
  }
  async function notify(list) {
    const h = list[0], more = list.length > 1 ? ` (+${list.length - 1} more)` : '';
    const icon = (ALERT_KINDS.find(k => k[0] === h.k) || [])[2] || '⚠️';
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); const opts = { body: h.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: h.key, data: { url: location.href.split('#')[0] + '#local=alerts' } }; reg ? reg.showNotification(icon + ' ' + h.title + more, opts) : new Notification(icon + ' ' + h.title + more, opts); } catch (e) { /* not allowed here */ }
    }
    banner(icon, h.title + more, h.body);
  }
  function banner(icon, title, body) {
    let b = q('#lbanner'); if (!b) { b = document.createElement('button'); b.id = 'lbanner'; b.className = 'panel'; document.body.appendChild(b); b.onclick = () => { b.classList.remove('show'); openHub('alerts'); }; }
    b.innerHTML = `<span class="i">${icon}</span><span><b>${esc(title)}</b><small>${esc(body)}</small></span>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), 9000);
  }
  function badge() { const n = S.hits.length; document.querySelectorAll('.lbadge').forEach(el => { el.textContent = n; el.hidden = !n; }); }

  /* =====================================================================
     5. COMMUNITY LAYERS: sightings, memories, the business board.
     They are ordinary posts with a tag (W:bear, M:1940, B:deal), so they
     show in the feed, live in the same database and follow its rules.
     ===================================================================== */
  const KIND = {
    W: { name: 'Sightings', one: 'sighting', cats: { bear: ['Black bear', '🐻', 6], elk: ['Elk', '🦌', 6], deer: ['Deer', '🦌', 4], turkey: ['Wild turkey', '🦃', 4], owl: ['Other wildlife', '🦉', 6], fireflies: ['Fireflies', '✨', 30], flowers: ['Wildflowers', '🌸', 24 * 6], color: ['Fall color', '🍁', 24 * 5], ice: ['Rime ice or snow', '❄️', 24 * 2], falls: ['Waterfall running big', '💧', 30] } },
    M: { name: 'Memories', one: 'memory', cats: { m: ['Memory', '📜', 1e9] } },
    B: { name: 'Board', one: 'post', cats: { deal: ['Deal', '🏷️', 24 * 7], open: ['Open now', '🟢', 24], job: ['Hiring', '🧰', 24 * 30], event: ['Happening tonight', '🎶', 18] } },
  };
  const SEEDS = [ // a few memories to start the layer; locals add the rest
    { id: 'm1', y: '2016', name: 'Gatlinburg', lat: 35.7140, lng: -83.5120, text: 'The Chimney Tops 2 fire. It started on the Chimney Tops on Nov 23, 2016. On the night of Nov 28, winds over 80 mph drove it into Gatlinburg and up the ridges toward Pigeon Forge. Fourteen people died, about 2,400 buildings were damaged or destroyed, and more than 17,000 acres burned. Neighbors, volunteers and Dolly Parton\'s My People Fund helped families rebuild.' },
    { id: 'm2', y: '2016', name: 'Chimney Tops', lat: 35.6295, lng: -83.4778, text: 'Where the 2016 fire began. The trail reopened in 2017 with a new viewpoint below the burned pinnacles, which stay closed so the slope can heal.' },
    { id: 'm3', y: '1940', name: 'Newfound Gap', lat: 35.6108, lng: -83.4256, text: 'President Franklin D. Roosevelt dedicated Great Smoky Mountains National Park here on September 2, 1940, at the Rockefeller Memorial. Rockefeller money ($5 million) and pennies from schoolchildren helped buy the land from the families and lumber companies that owned it.' },
    { id: 'm4', y: '1908', name: 'Elkmont', lat: 35.6531, lng: -83.5808, text: 'Elkmont began as a Little River Lumber Company logging town around 1908, then became a summer retreat with the Appalachian Club and the Wonderland Hotel. Some cabins have been restored. It\'s also where the synchronous fireflies light up each June.' },
    { id: 'm5', y: '1887', name: 'Primitive Baptist Church, Cades Cove', lat: 35.6021, lng: -83.8137, text: 'The congregation formed in 1827; this white frame church went up in 1887. Many of the families who settled the cove are buried in the churchyard.' },
    { id: 'm6', y: '1886', name: 'Mingus Mill', lat: 35.5202, lng: -83.3098, text: 'Built in 1886, Mingus Mill turns a cast-iron turbine instead of a water wheel. A miller still grinds corn here in season.' },
    { id: 'm7', y: '1830', name: 'The Old Mill, Pigeon Forge', lat: 35.7885, lng: -83.5540, text: 'Built in 1830 on the Little Pigeon River, the Old Mill has ground grain for nearly two hundred years and is the heart of old Pigeon Forge.' },
    { id: 'm8', y: '1896', name: 'Sevier County Courthouse', lat: 35.8681, lng: -83.5617, text: 'The courthouse was finished in 1896. The bronze statue of Dolly Parton on the lawn was unveiled in 1987.' },
    { id: 'm9', y: '1912', name: 'Arrowmont, Gatlinburg', lat: 35.7129, lng: -83.5085, text: 'Pi Beta Phi opened a settlement school here in 1912, bringing a school and a nurse to Gatlinburg. It grew into the Arrowmont School of Arts and Crafts.' },
    { id: 'm10', y: '1959', name: 'Kuwohi', lat: 35.5629, lng: -83.4984, text: 'The observation tower opened in 1959. In 2024 the peak\'s Cherokee name, Kuwohi, "mulberry place", became its official name again.' },
    { id: 'm11', y: '2001', name: 'Cataloochee', lat: 35.6401, lng: -83.0801, text: 'Elk came home to the Smokies here in 2001, about 150 years after they were hunted out. Watch the fields at dawn and dusk.' },
    { id: 'm12', y: '1930s', name: 'Mount Cammerer', lat: 35.7635, lng: -83.1614, text: 'Stone fire lookout built by the Civilian Conservation Corps in the late 1930s, perched on a rock outcrop over the Pigeon River gorge.' },
  ];
  function itemsOf(K) {
    const SS = window.Social && Social.S; const out = [];
    const take = (tag, x) => {
      if (!tag || tag[0] !== K || tag[1] !== ':') return;
      let cat = tag.slice(2), until = null, year = null;
      if (K === 'M') { year = cat; cat = 'm'; }
      if (K === 'B' && cat.startsWith('open@')) { const hhmm = cat.slice(5); cat = 'open'; const t = new Date(x.t); const e = et(t); until = new Date(t.getTime() + ((+hhmm.slice(0, 2) * 60 + +hhmm.slice(2)) - (e.h * 60 + e.min) + (hhmm < String(e.h).padStart(2, '0') + String(e.min).padStart(2, '0') ? 1440 : 0)) * 60e3); }
      const def = KIND[K].cats[cat]; if (!def) return;
      const end = until ? +until : +new Date(x.t) + def[2] * 3600e3; if (end < Date.now()) return;
      out.push({ ...x, K, cat, def, year, until });
    };
    if (SS) {
      (SS.remote || []).forEach(r => r.lng != null && take(r.tag, { id: 's' + r.id, t: r.created_at, lng: r.lng, lat: r.lat, name: r.place_name, text: r.caption, img: r.image_url, who: r.name || r.handle }));
      (SS.posts || []).forEach(p => p.place && take(p.tag, { id: 'u' + p.id, t: p.t, lng: p.place.lng, lat: p.place.lat, name: p.place.name, text: p.caption, img: p.img, who: 'You', mine: true }));
    }
    if (K === 'M') SEEDS.forEach(s => out.push({ id: s.id, t: null, lng: s.lng, lat: s.lat, name: s.name, text: s.text, K, cat: 'm', def: KIND.M.cats.m, year: s.y, seed: true }));
    return out.sort((a, b) => (b.t ? +new Date(b.t) : 0) - (a.t ? +new Date(a.t) : 0));
  }
  const LAYER = { wild: 'W', memory: 'M', board: 'B' };
  function drawMarkers() {
    S.markers.forEach(m => m.remove()); S.markers = [];
    if (typeof maplibregl === 'undefined' || !map) return;
    let n = 0;
    Object.entries(LAYER).forEach(([lk, K]) => {
      if (!S.layers[lk]) return;
      itemsOf(K).slice(0, 80).forEach(it => {
        const el = document.createElement('button'); el.className = `lmk lmk-${K}${it.seed ? ' seed' : ''}`; // MapLibre positions this element with transform, so animate the inside
        el.innerHTML = `<div class="lmk-in" style="animation-delay:${(n++ % 30) * 25}ms"><span><em>${it.def[1]}</em></span>${K === 'M' && it.year ? `<i>${esc(it.year)}</i>` : ''}</div>`; el.setAttribute('aria-label', it.def[0] + ' at ' + (it.name || 'a spot'));
        el.onclick = e => { e.stopPropagation(); showItem(it); };
        S.markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([it.lng, it.lat]).addTo(map));
      });
    });
  }
  function showItem(it) {
    let c = q('#lcard2'); if (!c) { c = document.createElement('div'); c.id = 'lcard2'; c.className = 'panel'; document.body.appendChild(c); }
    const when = it.t ? (typeof it.t === 'string' ? new Date(it.t) : new Date(it.t)).toLocaleString('en-US', { timeZone: TZN, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    c.innerHTML = `<button class="x" aria-label="Close">✕</button><div class="k">${it.def[1]} ${esc(it.def[0])}${it.year ? ' · ' + esc(it.year) : ''}</div><h3>${esc(it.name || 'Pinned spot')}</h3>${it.img ? `<img src="${esc(it.img)}" alt="">` : ''}<p>${esc(it.text || '')}</p>
      <div class="m">${it.seed ? 'From the Smokies Live history notes' : `${esc(it.who || 'A neighbor')}${when ? ' · ' + when : ''}`}${it.until ? ' · open until ' + it.until.toLocaleTimeString('en-US', { timeZone: TZN, hour: 'numeric', minute: '2-digit' }) : ''}</div>
      ${it.K === 'W' && it.cat === 'bear' ? '<div class="tip">Give bears room: it is the law in the park to stay 50 yards (150 ft) away. Never feed them.</div>' : ''}
      ${it.K === 'W' && it.cat === 'elk' ? '<div class="tip">Stay 50 yards (150 ft) from elk, more during the fall rut.</div>' : ''}
      <div class="acts"><button class="btn" data-fly>Fly there</button>${it.K === 'M' ? '<button class="btn" data-add>Add your memory here</button>' : ''}</div>`;
    c.hidden = false; c.classList.remove('in'); void c.offsetWidth; c.classList.add('in');
    c.querySelector('.x').onclick = () => { c.classList.remove('in'); c.classList.add('out'); setTimeout(() => { c.hidden = true; c.classList.remove('out'); }, 240); };
    c.querySelector('[data-fly]').onclick = () => fly([it.lng, it.lat], 15.2, 60);
    const add = c.querySelector('[data-add]'); if (add) add.onclick = () => compose('M', 'm', { name: it.name, lng: it.lng, lat: it.lat });
  }
  function fly(ll, zoom = 14, pitch = 62, bearing) {
    stopOrbit();
    if (innerWidth <= 760) closeHub();
    map.flyTo({ center: ll, zoom, pitch, bearing: bearing ?? map.getBearing(), duration: 2800, curve: 1.45, easing: easeInOut, essential: true });
  }
  // what's out right now, by the calendar
  function seasonal() {
    const t = et(), md = t.m * 100 + t.d, out = [];
    if (md >= 301 && md <= 1215) out.push(['🐻', 'Bears are out', md >= 901 ? 'Fattening up on acorns before winter. Most active at dawn and dusk.' : 'Out of their dens and hungry. Lock up trash and coolers.']);
    if (md >= 901 && md <= 1031) out.push(['🦌', 'Elk rut', 'Bulls bugling in Cataloochee and the Oconaluftee fields at dawn and dusk.']); else out.push(['🦌', 'Elk', 'Fields near the Oconaluftee Visitor Center and Cataloochee, early and late in the day.']);
    if (md >= 520 && md <= 620) out.push(['✨', 'Synchronous fireflies', 'Late May to mid June at Elkmont. Viewing is by lottery through the park.']);
    if (md >= 320 && md <= 510) out.push(['🌸', 'Spring wildflowers', 'Trillium, phlox and lady slippers on the low trails.']);
    if (md >= 501 && md <= 630) out.push(['🌺', 'Rhododendron and laurel', 'Mountain laurel in May; flame azalea and Catawba rhododendron on the high balds in June.']);
    if (md >= 1001 && md <= 1110) out.push(['🍁', 'Fall color', md < 1015 ? 'High peaks first. Drive up Newfound Gap Rd.' : md < 1025 ? 'Mid elevations peaking.' : 'Low valleys and foothills peaking now.']);
    if (md >= 1115 || md <= 315) out.push(['❄️', 'Rime ice and long views', 'Cold clear mornings frost the high peaks white. Winter air gives the longest views of the year.']);
    return out;
  }

  /* ---------- composer for sightings, memories and board posts ---------- */
  let draft = null;
  function compose(K, cat, place) {
    const c = map.getCenter();
    draft = { K, cat: cat || Object.keys(KIND[K].cats)[0], text: '', img: null, year: '', until: '21:00', place: place || { name: 'Here on the map', lng: c.lng, lat: c.lat } };
    if (!place && navigator.geolocation && K === 'W') navigator.geolocation.getCurrentPosition(p => { if (!draft) return; draft.place = { name: 'Where you are', lng: p.coords.longitude, lat: p.coords.latitude }; drawCompose(); }, () => {}, { timeout: 6000, maximumAge: 120000 });
    let v = q('#lcompose'); if (!v) { v = document.createElement('div'); v.id = 'lcompose'; document.body.appendChild(v); }
    clearTimeout(v._t); v.hidden = false; v.classList.remove('out'); drawCompose();
  }
  function drawCompose() {
    const v = q('#lcompose'), K = draft.K, kd = KIND[K];
    const title = { W: 'Post a sighting', M: 'Pin a memory', B: 'Post to the local board' }[K];
    const hint = { W: 'What did you see? How many? Which way were they headed?', M: 'Tell the story. Who was there, what happened, what it looked like then.', B: 'Your business and the deal, opening or job. Keep it short.' }[K];
    v.innerHTML = `<div class="lc-box"><header><button class="ib" data-x aria-label="Cancel">✕</button><b>${title}</b><button class="send" data-send>Post</button></header>
      ${K !== 'M' ? `<div class="lc-cats">${Object.entries(kd.cats).map(([k, d], i) => `<button data-c="${k}" class="${draft.cat === k ? 'on' : ''}" style="animation-delay:${i * 30}ms"><span>${d[1]}</span>${esc(d[0])}</button>`).join('')}</div>` : ''}
      <label class="lc-photo">${draft.img ? `<img src="${draft.img}" alt="">` : '<span>📷 Add a photo</span>'}<input type="file" accept="image/*" hidden></label>
      <textarea maxlength="700" placeholder="${hint}">${esc(draft.text)}</textarea>
      ${K === 'M' ? `<label class="lc-row">Year or decade <input data-year maxlength="8" placeholder="1985 or 1950s" value="${esc(draft.year)}"></label>` : ''}
      ${K === 'B' && draft.cat === 'open' ? `<label class="lc-row">Open until <input data-until type="time" value="${draft.until}"></label>` : ''}
      <button class="lc-place" data-place><span>📍</span><span><b>${esc(draft.place.name)}</b><small>Tap to change where this goes on the map</small></span></button>
      <p class="fine">${window.Social && Social.Cloud && Social.Cloud.on ? 'Shared with everyone in Smokies Live. It shows on the map and in the feed.' : 'Saved on this device until accounts are switched on.'}</p></div>`;
    v.querySelector('[data-x]').onclick = () => { v.classList.add('out'); v._t = setTimeout(() => { v.hidden = true; v.innerHTML = ''; draft = null; }, 260); };
    v.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { draft.cat = b.dataset.c; drawCompose(); });
    v.querySelector('textarea').oninput = e => draft.text = e.target.value;
    const y = v.querySelector('[data-year]'); if (y) y.oninput = e => draft.year = e.target.value.replace(/[^0-9s]/g, '');
    const u = v.querySelector('[data-until]'); if (u) u.oninput = e => draft.until = e.target.value;
    v.querySelector('input[type=file]').onchange = async e => { const f = e.target.files[0]; if (!f) return; draft.img = await shrink(f); drawCompose(); };
    v.querySelector('[data-place]').onclick = async () => { if (!(window.Social && Social.pickPlace)) return; v.hidden = true; const p = await Social.pickPlace(draft.place, 'Where was this?'); v.hidden = false; if (p) { draft.place = p; drawCompose(); } };
    v.querySelector('[data-send]').onclick = post;
  }
  function shrink(file) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1080 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.84)); }; img.onerror = rej; img.src = URL.createObjectURL(file); }); }
  async function post() {
    const d = draft; if (!d) return;
    if (!d.text.trim() && !d.img) return toast('Add a few words or a photo first');
    if (d.K === 'M' && !d.year) return toast('Add a year or decade, even a rough one');
    const tag = d.K === 'M' ? 'M:' + d.year.slice(0, 8) : d.K === 'B' && d.cat === 'open' ? 'B:open@' + d.until.replace(':', '') : d.K + ':' + d.cat;
    const C = window.Social && Social.Cloud, b = q('#lcompose [data-send]');
    if (C && C.on) {
      if (!C.user) { toast('Sign in from your profile to share with everyone'); Social.setView && Social.setView('profile'); return; }
      b.disabled = true; b.textContent = 'Posting…';
      try {
        const id = (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36);
        const image_url = d.img ? await C.upload(d.img, id) : null;
        const { error } = await C.sb.from('posts').insert({ caption: d.text.trim().slice(0, 800), tag, image_url, place_name: (d.place.name || '').slice(0, 120), lng: d.place.lng, lat: d.place.lat });
        if (error) throw error; await C.loadFeed();
      } catch (e) { b.disabled = false; b.textContent = 'Post'; return toast('Could not post: ' + String(e.message || e).slice(0, 60)); }
    } else if (window.Social) {
      Social.S.posts.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), img: d.img, caption: d.text.trim().slice(0, 800), tag, place: d.place });
      await Social.Store.set('posts', Social.S.posts);
    }
    const v = q('#lcompose'); v.classList.add('out'); v._t = setTimeout(() => { v.hidden = true; v.innerHTML = ''; }, 260); draft = null;
    const lk = { W: 'wild', M: 'memory', B: 'board' }[d.K]; S.layers[lk] = true; pref.set('layers', S.layers);
    if (window.Social && Social.refresh) Social.refresh();
    drawMarkers(); render(); toast({ W: 'Sighting posted. Thanks!', M: 'Memory pinned to the map', B: 'Posted to the board' }[d.K]);
    fly([d.place.lng, d.place.lat], 14.5, 55);
  }

  /* =====================================================================
     UI: launcher, hub, and the views
     ===================================================================== */
  const TABS = [['sky', 'Sunrise'], ['go', 'Worth it?'], ['roads', 'Roads'], ['alerts', 'My alerts'], ['wild', 'Sightings'], ['memory', 'Memories'], ['board', 'Board']];
  const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="21" cy="10" r="4.2" fill="#ffc861"/><path d="M1 27 11 13l5 6 5-7 10 15z" fill="#3f7a55"/><path d="M1 27l6-6 4 3 6-5 4 3 5-3 5 8z" fill="#cfe3ef" opacity=".9"/></svg>';
  function shell() {
    // desktop: a card at the top of the layers rail
    const rail = q('#rail');
    if (rail) {
      const g = document.createElement('div'); g.className = 'group lrail';
      g.innerHTML = `<div class="eyebrow">Local</div><button class="lsum" data-open="sky"><span class="lsum-ic">${LOGO}</span><span class="lsum-t"><b id="lsumT">Sunrise forecast</b><small id="lsumS">Reading the mountains…</small></span><span class="lbadge" hidden></span></button>
        <button class="toggle" data-lmode aria-pressed="${S.localMode}"><span class="k">Local's mode</span><span class="sw"></span></button>
        <div class="lquick"><button data-open="go">Worth it?</button><button data-open="roads">Roads</button><button data-open="alerts">Alerts</button></div>
        ${Object.entries({ wild: 'Sightings', memory: 'Memories', board: 'Local board' }).map(([k, v]) => `<button class="toggle" data-layer="${k}" aria-pressed="${S.layers[k]}"><span class="k">${v}</span><span class="sw"></span></button>`).join('')}`;
      rail.insertBefore(g, rail.firstChild);
    }
    // phone: a button in the floating column
    const mb = q('#mobileBar');
    if (mb) { const b = document.createElement('button'); b.id = 'm-local'; b.setAttribute('aria-pressed', 'false'); b.dataset.open = 'sky'; b.innerHTML = 'Local<span class="lbadge" hidden></span>'; mb.insertBefore(b, mb.firstChild); }
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', e => { squish(b); openHub(b.dataset.open); }));
    document.querySelectorAll('[data-lmode]').forEach(b => b.addEventListener('click', () => setLocalMode(!S.localMode)));
    document.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.layer; S.layers[k] = !S.layers[k]; b.setAttribute('aria-pressed', S.layers[k]); pref.set('layers', S.layers); drawMarkers(); }));
    // the hub
    const h = document.createElement('section'); h.id = 'lhub'; h.className = 'panel'; h.hidden = true; h.setAttribute('aria-label', 'Local');
    h.innerHTML = `<div class="grab" aria-hidden="true"></div><header><span class="logo">${LOGO}</span><div><b>Smokies <em>Local</em></b><small id="lhubSub">For the people who live here</small></div>
      <button class="lmode" data-lmode aria-pressed="${S.localMode}" title="Local's mode hides tourist stuff"><span>Local's mode</span><i></i></button><button class="ib" data-close aria-label="Close">✕</button></header>
      <nav class="ltab2" role="tablist">${TABS.map(([k, v]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${v}${k === 'alerts' ? '<span class="lbadge" hidden></span>' : ''}</button>`).join('')}</nav><div id="lbody"></div>`;
    document.body.appendChild(h);
    h.querySelector('[data-close]').onclick = closeHub;
    h.querySelector('[data-lmode]').addEventListener('click', () => setLocalMode(!S.localMode));
    h.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; pref.set('tab', S.tab); h.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b)); b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); render(); });
    q('#lbody').addEventListener('click', onBody);
    swipeToClose(h);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.open) closeHub(); });
  }
  function squish(el) { el.classList.remove('lsq'); void el.offsetWidth; el.classList.add('lsq'); }
  function openHub(tab) {
    const h = q('#lhub'); if (tab) { S.tab = tab; pref.set('tab', tab); }
    h.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === S.tab));
    S.open = true; h.hidden = false; h.classList.remove('out'); document.body.classList.add('lhub-open');
    const m = q('#m-local'); if (m) m.setAttribute('aria-pressed', 'true');
    render(); const sel = h.querySelector(`[data-tab="${S.tab}"]`); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (!S.wx) refresh();
  }
  function closeHub() {
    const h = q('#lhub'); if (!S.open) return; S.open = false; h.classList.add('out'); document.body.classList.remove('lhub-open');
    const m = q('#m-local'); if (m) m.setAttribute('aria-pressed', 'false');
    setTimeout(() => { if (!S.open) { h.hidden = true; h.classList.remove('out'); } }, 320);
  }
  function swipeToClose(h) {
    let y0 = null, dy = 0; const grab = h.querySelector('.grab'), head = h.querySelector('header');
    const start = e => { if (innerWidth > 760) return; y0 = e.touches[0].clientY; dy = 0; h.style.transition = 'none'; };
    const move = e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); h.style.transform = `translateY(${dy}px)`; };
    const end = () => { if (y0 == null) return; y0 = null; h.style.transition = ''; h.style.transform = ''; if (dy > 90) closeHub(); };
    [grab, head].forEach(el => { el.addEventListener('touchstart', start, { passive: true }); el.addEventListener('touchmove', move, { passive: true }); el.addEventListener('touchend', end); });
  }
  const ring = (s, cls, size = 58) => { const r = size / 2 - 5, c = 2 * Math.PI * r; return `<svg class="ring ${cls}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="fg" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="--to:${c * (1 - s / 10)}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle">${s > 0 ? s.toFixed(s >= 10 ? 0 : 1) : '—'}</text></svg>`; };
  function fogArt(f) {
    // layered ridges, a fog sea at the forecast height, and the sun climbing on an arc
    const fogY = f ? 108 - clamp((f.topFt - 900) / 5800) * 80 : 112, dense = f ? f.p : 0;
    const sky = { fire: ['#2a2350', '#d9645a', '#ffb067'], clean: ['#1f3a5f', '#6f9fcf', '#ffd59a'], soft: ['#33405a', '#9a8fb0', '#f3c9a0'], grey: ['#3a4148', '#6c757e', '#9aa3a9'] }[f ? f.color[0] : 'clean'];
    return `<svg class="fogart" viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".72" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient><filter id="lblur"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
      <rect width="320" height="120" fill="url(#lsky)"/><g class="sun"><circle cx="248" cy="86" r="11" fill="#ffe2a6"/><circle cx="248" cy="86" r="22" fill="#ffd27a" opacity=".25"/></g>
      <path d="M0 78 L38 52 L62 66 L104 34 L140 58 L170 44 L214 70 L262 48 L320 66 V120 H0Z" fill="#2c3a4a" opacity=".75"/>
      <g class="fogsea" style="opacity:${0.25 + dense * 0.75}"><rect x="-40" y="${fogY}" width="420" height="${125 - fogY}" fill="#eef3f8" filter="url(#lblur)"/><ellipse cx="80" cy="${fogY}" rx="70" ry="6" fill="#f4f7fa" filter="url(#lblur)"/><ellipse cx="230" cy="${fogY + 2}" rx="80" ry="7" fill="#f4f7fa" filter="url(#lblur)"/></g>
      <path d="M0 106 L30 96 L58 102 L96 86 L126 100 L160 94 L196 106 L240 96 L284 104 L320 98 V120 H0Z" fill="#17222c"/>
      ${f && f.best ? '<g class="seat"><circle cx="96" cy="85" r="3.4" fill="#ffc861"/><circle cx="96" cy="85" r="8" fill="none" stroke="#ffc861" stroke-width="1.4"/></g>' : ''}</svg>`;
  }
  function render() {
    const el = q('#lbody'); if (!el || !S.open) return;
    const sub = q('#lhubSub'); if (sub) sub.textContent = S.localMode ? 'Local\'s mode is on' : 'For the people who live here';
    let h = '';
    const loading = `<div class="lempty"><div class="lspin"></div>Reading the mountains…</div>`;
    const blocked = window.Live && Live.st.blocked;
    if (S.tab === 'sky') {
      if (!S.fog) h = blocked ? `<div class="lempty">The forecast needs live weather, which this preview blocks. Open the full site.</div>` : loading;
      else {
        const f = S.fog[0], today = et().day;
        h = `<div class="lhero">${fogArt(f)}<div class="lhero-t"><small>${dayName(f.day, today)} · sunrise ${clock(f.sunrise)}</small><b>${f.socked ? 'Socked in' : f.sea >= 0.55 ? 'Sea of clouds likely' : f.sea >= 0.3 ? 'Sea of clouds possible' : f.p >= 0.45 ? 'Valley fog, no clear seat above it' : 'Clear valleys'}</b></div></div>
          <div class="lstats"><div><b>${pct(f.p)}</b><small>Valley fog</small></div><div><b>${f.p >= 0.3 && !f.socked ? fmtFt(f.topFt) : '—'}</b><small>Fog top</small></div><div><b>${pct(f.sea)}</b><small>Sea of clouds</small></div></div>
          <p class="lsay">${esc(fogWords(f))} ${esc(f.color[1])}.</p>
          ${f.best ? `<div class="lseat" data-seat="0"><div class="k">Best seat</div><b>${esc(f.best.s.n)}</b><span>${fmtFt(ft(f.best.e))} · faces ${esc(f.best.s.o.face)}</span><span class="w">${esc(f.best.s.o.walk)}${f.best.shut ? ' · road closed for winter, walk in' : ''}</span><button class="btn primary" data-preview="0">See it at sunrise</button></div>` : ''}
          <div class="lsub">Other overlooks</div><div class="llist">${f.looks.slice(1).map((o, i) => `<button class="lrow" data-look="${i + 1}" style="animation-delay:${i * 45}ms"><span class="dot ${o.clear > 0.6 && (f.p < 0.35 || o.above > 0.8) ? 'g' : o.clear > 0.3 ? 'y' : 'r'}"></span><span><b>${esc(o.s.n)}</b><small>${fmtFt(ft(o.e))} · ${o.clear < 0.3 ? 'in cloud or rain' : f.p >= 0.35 && o.above < 0.5 ? 'likely inside the fog' : 'clear air'}${o.shut ? ' · road closed' : ''}</small></span></button>`).join('')}</div>
          ${S.fog.length > 1 ? `<div class="lsub">Next mornings</div><div class="ldays">${S.fog.slice(1).map(x => `<div><small>${dayName(x.day, today)}</small><b>${pct(x.sea)}</b><span>sea of clouds</span><span>${pct(x.p)} fog · ${clock(x.sunrise)}</span></div>`).join('')}</div>` : ''}
          <p class="fine">Forecast from Open-Meteo weather models at ${SITES.length} spots from valley floor to Kuwohi. Fog forms after clear, calm, damp nights when cold air settles under warmer air. Best guess, not a promise.</p>`;
      }
    } else if (S.tab === 'go') {
      if (!S.worth) h = blocked ? `<div class="lempty">Needs live data, which this preview blocks.</div>` : loading;
      else h = `<div class="lgo">${S.worth.map((w, i) => { const [v, cls] = verdict(w.now.s); const why = w.now.shut ? [['closed', w.now.shut]] : w.now.why.slice(0, 3);
          return `<div class="lcardg ${cls}" style="animation-delay:${i * 70}ms" data-go="${i}">${ring(w.now.s, cls)}<div class="t"><b>${esc(w.D.n)}</b><small>${esc(w.D.sub)}</small><span class="v">${v}</span></div>
          <ul>${why.map(x => `<li class="w-${x[0]}">${esc(x[1])}</li>`).join('')}</ul>${w.best ? `<div class="better">Better ${w.best.t.day === et().day ? 'around' : 'tomorrow around'} ${hh(w.best.t.h)}: ${w.best.s.toFixed(1)}</div>` : ''}</div>`; }).join('')}</div>
          <p class="fine">${S.flow ? `Road speeds from TomTom, updated ${new Date(S.flow.updated).toLocaleTimeString('en-US', { timeZone: TZN, hour: 'numeric', minute: '2-digit' })}.` : 'Live road speeds load with the next feed refresh; until then traffic is estimated.'} Weather from Open-Meteo. Crowds and parking are estimated from season, holidays, day and hour. Closures from park alerts and seasonal schedules.</p>`;
    } else if (S.tab === 'roads') {
      const R = roadsNow(); const bar = x => { const r = clamp(x.cur / x.free); return `<div class="lroad" style="--r:${r}"><span class="n">${esc(x.name)}</span><span class="b"><i class="${x.closed ? 'x' : r < 0.5 ? 'r' : r < 0.75 ? 'y' : 'g'}"></i></span><span class="s">${x.closed ? 'Closed' : Math.round(x.cur) + ' mph'}</span></div>`; };
      h = `<div class="lmodebox ${S.localMode ? 'on' : ''}"><div><b>Local's mode</b><small>Hides tourist tours and puts the roads, the crowds and your alerts first.</small></div><button class="lmode" data-lmode2 aria-pressed="${S.localMode}"><i></i></button></div>
        ${R.tip ? `<div class="ltip">🚗 ${esc(R.tip)}</div>` : ''}
        <div class="lstats"><div><b>${R.c > 0.75 ? 'Heavy' : R.c > 0.45 ? 'Busy' : 'Light'}</b><small>Parkway crowds now</small></div><div><b>${R.thin ? (R.thin.dh === 0 ? 'Now' : hh(R.thin.t.h)) : 'Late'}</b><small>${R.thin && R.thin.dh === 0 ? 'Crowds are thin' : 'Crowds thin out'}</small></div><div><b>${R.worst ? Math.round(R.worst.cur) + ' mph' : '—'}</b><small>${R.worst ? 'Slowest: ' + esc(R.worst.name.replace('Parkway, ', '')) : 'Slowest spot'}</small></div></div>
        ${R.live ? `<div class="lsub">The Parkway</div>${R.pk.map(bar).join('')}<div class="lsub">Back roads</div>${R.back.map(bar).join('')}<div class="lsub">Park roads</div>${R.park.map(bar).join('')}<p class="fine">Live speeds from TomTom, ${new Date(R.updated).toLocaleTimeString('en-US', { timeZone: TZN, hour: 'numeric', minute: '2-digit' })}. Bars show speed compared with a clear road.</p>`
          : `<p class="lsay">Live road speeds start with the next feed refresh (every 20 minutes). The traffic colors on the map are live now.</p>`}`;
    } else if (S.tab === 'alerts') {
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      h = `${S.hits.length ? `<div class="lsub">Right now</div>${S.hits.map((x, i) => `<button class="lhit k-${x.k}" data-hit="${i}" style="animation-delay:${i * 50}ms"><span class="i">${(ALERT_KINDS.find(k => k[0] === x.k) || [])[2]}</span><span><b>${esc(x.title)}</b><small>${esc(x.body)}</small></span></button>`).join('')}` : S.places.length ? '<div class="lok">✓ All clear around your places</div>' : ''}
        <div class="lsub">Your places</div>
        ${S.places.map((p, i) => `<div class="lplace" style="animation-delay:${i * 50}ms"><div class="lp-top"><b>📍 ${esc(p.name)}</b><button class="lnk" data-delp="${i}">Remove</button></div>
          <div class="rad">Within ${[1, 3, 8].map(r => `<button data-rad="${i}:${r}" class="${p.r === r ? 'on' : ''}">${r} km</button>`).join('')}</div>
          <div class="kinds">${ALERT_KINDS.map(([k, l, ic]) => `<button data-kind="${i}:${k}" class="${p.kinds.includes(k) ? 'on' : ''}">${ic} ${l}</button>`).join('')}</div></div>`).join('')}
        <div class="lacts"><button class="btn primary" data-addp="gps">📍 Add where I am</button><button class="btn" data-addp="map">Pick on the map</button></div>
        ${S.places.length && perm === 'default' ? '<button class="btn wide" data-perm>Turn on notifications</button>' : ''}${perm === 'denied' ? '<p class="fine">Notifications are blocked for this site in your browser settings. Alerts still show here.</p>' : ''}
        <p class="fine">Watches creek gauges, satellite fire detections, the ice forecast for your exact spot, weather warnings and what neighbors report. Your places stay on this phone and are never uploaded. Alerts come in while Smokies Live is open; always-on push arrives with the app.</p>`;
    } else {
      const K = LAYER[S.tab], items = itemsOf(K), kd = KIND[K];
      const head = { W: ['Sightings', 'Bears, elk, fireflies, wildflowers and fall color, posted by people out there right now.', 'Post a sighting'], M: ['Memories', 'Old photos and stories pinned where they happened. Add your family\'s.', 'Pin a memory'], B: ['Local board', 'Deals, open-now status, jobs and tonight\'s music from local businesses.', 'Post to the board'] }[K];
      h = `<div class="lhead2"><div><b>${head[0]}</b><small>${head[1]}</small></div><button class="btn primary" data-new="${K}">${head[2]}</button></div>
        <button class="toggle" data-layer2="${S.tab}" aria-pressed="${S.layers[S.tab]}"><span class="k">Show on the map</span><span class="sw"></span></button>
        ${K === 'W' ? `<div class="lsub">Out right now</div><div class="lseason">${seasonal().map(([ic, t, d], i) => `<div style="animation-delay:${i * 50}ms"><span>${ic}</span><b>${t}</b><small>${d}</small></div>`).join('')}</div>` : ''}
        ${K === 'M' ? (() => { const t = et(); return t.m === 11 && t.d >= 21 && t.d <= 30 ? `<div class="lanniv">🕯️ <b>${t.d === 28 ? 'Ten years ago tonight' : t.d < 28 ? 'Ten years ago this week' : 'Ten years ago this week'}</b>, fire came down into Gatlinburg. <button class="lnk" data-memo="m1">Read and share your story</button></div>` : ''; })() : ''}
        ${K === 'B' && items.length ? `<div class="lbf">${Object.entries(kd.cats).map(([k, d]) => [d, items.filter(x => x.cat === k).length]).filter(x => x[1]).map(([d, n]) => `<span>${d[1]} ${n} ${esc(d[0].toLowerCase())}</span>`).join('')}</div>` : ''}
        <div class="lsub">${K === 'M' ? 'On the map' : 'Latest'}</div>
        ${items.length ? `<div class="litems">${items.slice(0, 40).map((it, i) => `<button class="litem" data-item="${K}:${i}" style="animation-delay:${Math.min(i, 12) * 40}ms"><span class="e">${it.def[1]}</span><span class="t"><b>${esc(it.K === 'M' ? it.name : it.def[0] + (it.name ? ' · ' + it.name : ''))}</b><small>${esc((it.text || '').slice(0, 90))}${(it.text || '').length > 90 ? '…' : ''}</small></span><span class="a">${it.year ? esc(it.year) : it.t ? esc(agoShort(it.t)) : ''}</span>${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : ''}</button>`).join('')}</div>`
          : `<div class="lempty">${{ W: 'No sightings yet today. Be the first: what did you see?', M: '', B: 'No posts yet. Own a business here? Post a deal, your hours or a job.' }[K]}</div>`}
        ${K === 'B' ? '<p class="fine">Business owners post for free. Featured spots on the map are coming for sponsors.</p>' : ''}`;
    }
    el.innerHTML = h;
    el.querySelectorAll('.ring .fg').forEach(c => requestAnimationFrame(() => requestAnimationFrame(() => c.style.strokeDashoffset = c.style.getPropertyValue('--to'))));
  }
  const agoShort = iso => { const s = (Date.now() - new Date(iso)) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
  function onBody(e) {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.preview != null || d.look != null) { const f = S.fog[0], o = f.looks[+(d.preview ?? d.look)]; previewSunrise(f, o); return; }
    if (d.go != null) { const w = S.worth[+d.go]; fly(w.D.ll, 13.2, 64); return; }
    if (d.lmode2 != null) { setLocalMode(!S.localMode); return; }
    if (d.addp) { addPlace(d.addp); return; }
    if (d.delp != null) { S.places.splice(+d.delp, 1); savePlaces(); render(); return; }
    if (d.rad) { const [i, r] = d.rad.split(':'); S.places[+i].r = +r; savePlaces(); render(); return; }
    if (d.kind) { const [i, k] = d.kind.split(':'), p = S.places[+i]; p.kinds = p.kinds.includes(k) ? p.kinds.filter(x => x !== k) : [...p.kinds, k]; savePlaces(); render(); return; }
    if (d.perm != null) { Notification.requestPermission().then(() => render()); return; }
    if (d.hit != null) { const x = S.hits[+d.hit]; if (x.ll) fly([x.ll.lng, x.ll.lat], 13.5, 55); return; }
    if (d.new) { compose(d.new); return; }
    if (d.layer2) { const k = d.layer2; S.layers[k] = !S.layers[k]; pref.set('layers', S.layers); document.querySelectorAll(`[data-layer="${k}"]`).forEach(x => x.setAttribute('aria-pressed', S.layers[k])); b.setAttribute('aria-pressed', S.layers[k]); drawMarkers(); return; }
    if (d.item) { const [K, i] = d.item.split(':'); const it = itemsOf(K)[+i]; showItem(it); fly([it.lng, it.lat], 14.5, 58); return; }
    if (d.memo) { const it = itemsOf('M').find(x => x.id === d.memo); if (it) { showItem(it); fly([it.lng, it.lat], 14, 60); } return; }
  }
  function savePlaces() { pref.set('places', S.places); loadPlaceWx().then(checkAlerts); }
  function addPlace(how) {
    const add = (p, name) => { S.places.push({ id: Date.now().toString(36), name: name || p.name || 'Home', lng: p.lng, lat: p.lat, r: 3, kinds: ALERT_KINDS.map(k => k[0]) }); savePlaces(); render(); toast('Watching ' + (name || p.name || 'your place')); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => render()); };
    if (how === 'gps') {
      if (!navigator.geolocation) return toast('Location is not available');
      navigator.geolocation.getCurrentPosition(p => add({ lng: p.coords.longitude, lat: p.coords.latitude }, S.places.length ? 'Place ' + (S.places.length + 1) : 'Home'), () => toast('Could not get your location'), { enableHighAccuracy: true, timeout: 10000 });
    } else if (window.Social && Social.pickPlace) {
      const c = map.getCenter(); q('#lhub').hidden = true;
      Social.pickPlace({ name: '', lng: c.lng, lat: c.lat }, 'Which road or hollow should we watch?').then(p => { q('#lhub').hidden = false; if (p) add(p, p.name); });
    }
  }

  /* ---------- map: sunrise preview and live road dots ---------- */
  const FOGBASE = [0, 'rgba(238,243,248,0.94)', 3, 'rgba(236,241,247,0.82)', 6, 'rgba(232,238,245,0.55)', 9, 'rgba(228,236,244,0.2)', 11.5, 'rgba(226,234,243,0)'];
  function previewSunrise(f, o) {
    // valley fog layer scaled to the forecast depth, camera at the overlook looking out, light set to sunrise
    const depthM = Math.max(40, (f.top - 300)) , k = clamp(depthM / 160, 0.45, 1.7);
    const ramp = ['interpolate', ['linear'], ['elevation']]; for (let i = 0; i < FOGBASE.length; i += 2) ramp.push(Math.min(19.9, FOGBASE[i] * k), FOGBASE[i + 1]);
    try {
      const tb = q('#t-fog'); if (f.p >= 0.3 && tb && tb.getAttribute('aria-pressed') !== 'true') tb.click();
      if (f.p >= 0.3 && map.getLayer('fog')) map.setPaintProperty('fog', 'color-relief-color', ramp);
    } catch (e) { /* fog layer not ready */ }
    const sk = q('#skyRange'); if (sk) { const [H, M] = f.sunrise.slice(11, 16).split(':').map(Number); sk.value = H * 60 + M + 12; sk.dispatchEvent(new Event('input', { bubbles: true })); }
    const bearing = { lr: 95, fhp: 175, nfg: 10, lec: 100, kuw: 30 }[o.s.k] ?? 60;
    fly([o.s.lng, o.s.lat], 12.3, 70, bearing);
    toast(`${o.s.n} at sunrise ${clock(f.sunrise)}${f.p >= 0.3 ? `: fog up to about ${fmtFt(f.topFt)}` : ''}`);
  }
  function drawFlow() {
    S.flowMarkers.forEach(m => m.remove()); S.flowMarkers = [];
    if (!S.localMode || !S.flow || typeof maplibregl === 'undefined') return;
    S.flow.items.filter(x => x.cur && x.free).forEach((x, i) => {
      const r = x.cur / x.free, el = document.createElement('div'); el.className = 'lflow-m';
      el.innerHTML = `<div class="lflow ${x.closed ? 'x' : r < 0.5 ? 'r' : r < 0.75 ? 'y' : 'g'}" style="animation-delay:${i * 40}ms"><b>${x.closed ? '✕' : Math.round(x.cur)}</b><span>${esc(x.name.replace(/^Parkway, /, ''))}</span></div>`;
      S.flowMarkers.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([x.lng, x.lat]).addTo(map));
    });
  }

  /* ---------- feed: friendly labels for these tags ---------- */
  function prettyTags(root) {
    (root || document).querySelectorAll('.ptag').forEach(t => {
      const m = t.textContent.match(/^#([wmb]):(.+)$/i); if (!m || t.dataset.lp) return;
      const K = m[1].toUpperCase(); let cat = m[2].toLowerCase(), label;
      if (K === 'M') label = `📜 Memory · ${m[2]}`; else { if (cat.startsWith('open@')) cat = 'open'; const d = KIND[K].cats[cat]; if (!d) return; label = `${d[1]} ${d[0]}${K === 'W' ? ' sighting' : ''}`; }
      t.textContent = label; t.dataset.lp = 1; t.classList.add('lptag');
    });
  }

  /* ---------- summary on the launcher ---------- */
  function summary() {
    const f = S.fog && S.fog[0]; const T = q('#lsumT'), Sb = q('#lsumS');
    if (!f || !T) return;
    T.textContent = `${dayName(f.day, et().day)} ${clock(f.sunrise)}`;
    Sb.textContent = f.socked ? 'Socked in, fog everywhere' : f.sea >= 0.55 ? `Sea of clouds ${pct(f.sea)} · ${f.best.s.n.split(',')[0].replace(/ \(.*/, '')}` : f.p >= 0.45 ? `Valley fog ${pct(f.p)}` : 'Clear valleys at sunrise';
  }

  /* ---------- refresh loop ---------- */
  let busy = false;
  async function refresh() {
    if (busy) return; busy = true;
    try {
      await Promise.allSettled([loadWx(), loadFlow(), loadNps(), loadPlaceWx()]);
      try { buildFog(); } catch (e) { console.warn('[locals] fog', e); }
      try { buildWorth(); } catch (e) { console.warn('[locals] worth', e); }
      summary(); drawFlow(); drawMarkers(); await checkAlerts(); render();
    } finally { busy = false; }
  }
  function ready() { map = window.__smokies && window.__smokies.map; return map && map.getLayer && window.Live && Live.st && window.Social && q('#rail') && q('#tabbar'); } // the social shell is built once the map has loaded
  function boot() {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'locals.css?v=1'; document.head.appendChild(css);
    const wait = setInterval(() => {
      if (!ready()) return; clearInterval(wait);
      shell(); setLocalMode(S.localMode, true); badge();
      setTimeout(refresh, 1500);
      setInterval(refresh, 5 * 60e3);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
      // keep community pins and feed labels in step with the social layer
      const feed = q('#socialView'); if (feed) new MutationObserver(() => prettyTags(feed)).observe(feed, { childList: true, subtree: true });
      setInterval(() => { const n = ((Social.S.remote || []).length) + ((Social.S.posts || []).length); if (n !== S._n) { S._n = n; drawMarkers(); } }, 4000);
      const hsh = decodeURIComponent(location.hash || ''); if (hsh.startsWith('#local')) openHub(hsh.split('=')[1] || 'sky');
    }, 400);
  }
  window.Locals = { S, openHub, closeHub, refresh, compose, setLocalMode, fogMorning, buildWorth };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
