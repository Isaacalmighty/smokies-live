/* ---------- UX: one calm shell over the map ----------
   The map starts clean (terrain, roads, names). Everything else is a switch in one
   "Show on map" sheet, with one-tap presets. Today is a short page that answers
   "what do I need to know right now", ordered for visitors, locals or explorers.
   One Share button holds every kind of post. Rare things live under More.
   Fires, road closures and weather warnings always show. */
const UX = (() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sl-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sl-' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const TZ = 'America/New_York';
  const phone = () => matchMedia('(max-width:760px)').matches;
  const toView = v => window.Social && Social.setView(v);

  /* ---------- the layer catalog ---------- */
  const btn = id => document.getElementById(id);
  const mapTog = id => ({ get: () => btn(id) && btn(id).getAttribute('aria-pressed') === 'true', set: on => { const b = btn(id); if (b && (b.getAttribute('aria-pressed') === 'true') !== on) b.click(); } });
  const live = k => ({ get: () => !!(window.Live && Live.st.on[k]), set: on => window.Live && Live.setOn(k, on) });
  const loc = k => ({ get: () => !!(window.Locals && Locals.S.layers[k]), set: on => window.Locals && Locals.setLayer(k, on) });
  const people = { get: () => !!(window.Social && Social.S.showPins), set: on => { if (!window.Social) return; Social.S.showPins = on; try { localStorage.setItem('sl-userpins', on ? '1' : '0'); } catch (e) { } Social.drawUserPins(); } };
  const both = (a, b) => ({ get: () => a.get() || b.get(), set: on => { a.set(on); b.set(on); } });
  const GROUPS = [
    ['Getting around', [
      ['traffic', '🚗', 'Traffic', 'Live road speeds and wrecks', live('traffic')],
      ['cams', '📷', 'Road cameras', 'Park and highway webcams', live('cams')],
    ]],
    ['Weather', [
      ['radar', '🌧️', 'Rain radar', 'The last two hours of rain', live('radar')],
      ['clouds', '☁️', '3D clouds', 'Real cloud cover, drifting with the wind', live('clouds')],
      ['fog', '🌫️', 'Valley fog', 'How morning fog fills the valleys', mapTog('t-fog')],
      ['rivers', '🌊', 'Rivers', 'Stream gauges, rising or falling', live('rivers')],
    ]],
    ['What\'s happening', [
      ['news', '📰', 'News and events', 'Local stories and what\'s on, by place', both(live('news'), loc('events'))],
      ['people', '📸', 'Posts and reports', 'Photos and road reports from people here', people],
      ['board', '🏪', 'Local businesses', 'Deals, open now, live music', loc('board')],
    ]],
    ['Outdoors', [
      ['trails', '🥾', 'Trail conditions', 'Mud, ice, trees down, from hikers', loc('trails')],
      ['wild', '🐻', 'Wildlife and blooms', 'Bears, elk, wildflowers, fall color', loc('wild')],
      ['memory', '🕰️', 'Old photos and stories', 'Memories pinned where they happened', loc('memory')],
    ]],
    ['Neighbors', [
      ['outages', '⚡', 'Power outages', 'Reported by neighbors', loc('outages')],
      ['pets', '🐾', 'Lost and found pets', 'Pinned where they went missing', loc('pets')],
    ]],
    ['Map', [
      ['buildings', '🏠', '3D buildings', '', mapTog('t-buildings')],
      ['labels', '🔤', 'Place names', '', mapTog('t-labels')],
      ['roads', '🛣️', 'Roads and trails', '', mapTog('t-trails')],
      ['water', '💧', 'Rivers and streams', '', mapTog('t-water')],
      ['lidar', '⛰️', 'LiDAR relief (Gatlinburg)', '', mapTog('t-lidar')],
    ]],
  ];
  const ALL = GROUPS.flatMap(g => g[1]);
  const BY = Object.fromEntries(ALL.map(x => [x[0], x]));
  const BASE = { clouds: true, buildings: true, labels: true, roads: true, water: true, lidar: true };
  const INFO = ALL.filter(x => !(x[0] in BASE) && x[0] !== 'fog').map(x => x[0]);
  const PRESETS = [
    ['clean', '✨', 'Clean map', []],
    ['drive', '🚗', 'Driving', ['traffic', 'cams']],
    ['weather', '🌦️', 'Weather watch', ['radar', 'rivers', 'fog']],
    ['happening', '🎪', 'What\'s happening', ['news', 'people', 'board']],
    ['outdoors', '🥾', 'Outdoors', ['trails', 'wild', 'rivers']],
  ];
  const want = () => ({ ...Object.fromEntries(ALL.map(x => [x[0], !!BASE[x[0]]])), ...store.get('show', {}) });
  function setLayer(k, on, save = true) {
    const x = BY[k]; if (!x) return; try { x[4].set(on); } catch (e) { console.warn('[ux]', k, e); }
    if (save) { const s = store.get('show', {}); s[k] = on; store.set('show', s); }
    sync();
  }
  function preset(id) {
    const p = PRESETS.find(x => x[0] === id); if (!p) return;
    const s = {}; ALL.forEach(([k]) => { const on = k in BASE ? want()[k] : p[3].includes(k); s[k] = on; if (BY[k][4].get() !== on) setLayer(k, on, false); });
    store.set('show', s); sync();
    if (id !== 'clean' && phone()) setTimeout(closeSheet, 380); // let the switches animate, then show the map
  }
  const activePreset = () => { const on = new Set(INFO.filter(k => BY[k][4].get())); BY.fog[4].get() && on.add('fog'); return (PRESETS.find(p => p[3].length === on.size && p[3].every(k => on.has(k))) || [null])[0]; };
  function sync() {
    const n = INFO.filter(k => BY[k][4].get()).length;
    const b = $('#uxshow'); if (b) { const c = b.querySelector('.n'); c.textContent = n; c.hidden = !n; }
    document.querySelectorAll('#uxsheet [data-k]').forEach(r => r.setAttribute('aria-pressed', BY[r.dataset.k][4].get()));
    const ap = activePreset(); document.querySelectorAll('#uxsheet [data-preset]').forEach(c => c.setAttribute('aria-pressed', c.dataset.preset === ap));
  }

  /* ---------- a sheet: bottom sheet on phones, floating panel on desktop ---------- */
  function sheet(kind, html) {
    let s = $('#uxsheet');
    if (!s) {
      s = document.createElement('section'); s.id = 'uxsheet'; s.className = 'panel'; s.hidden = true; s.setAttribute('role', 'dialog');
      const scrim = document.createElement('div'); scrim.id = 'uxscrim'; scrim.hidden = true; scrim.onclick = closeSheet;
      document.body.append(scrim, s);
      swipe(s);
    }
    s.dataset.kind = kind; s.innerHTML = `<div class="grab" aria-hidden="true"></div>${html}`;
    s.hidden = false; s.classList.remove('out'); $('#uxscrim').hidden = false; $('#uxscrim').classList.remove('out');
    document.body.classList.add('ux-sheet', 'ux-sheet-' + kind);
    s.querySelectorAll('[data-x]').forEach(b => b.onclick = closeSheet);
    s.scrollTop = 0; return s;
  }
  function closeSheet() {
    const s = $('#uxsheet'); if (!s || s.hidden || s.classList.contains('out')) return;
    s.classList.add('out'); $('#uxscrim').classList.add('out');
    document.body.classList.remove('ux-sheet', ...[...document.body.classList].filter(c => c.startsWith('ux-sheet-')));
    setTimeout(() => { if (s.classList.contains('out')) { s.hidden = true; s.classList.remove('out'); $('#uxscrim').hidden = true; $('#uxscrim').classList.remove('out'); } }, 280);
  }
  function swipe(s) { // drag the handle (or the top of the sheet) down to close
    let y0 = null, dy = 0;
    s.addEventListener('touchstart', e => { if (!phone() || s.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; s.style.transition = 'none'; }, { passive: true });
    s.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); s.style.transform = dy ? `translateY(${dy}px)` : ''; }, { passive: true });
    s.addEventListener('touchend', () => { if (y0 == null) return; y0 = null; s.style.transition = ''; s.style.transform = ''; if (dy > 90) closeSheet(); });
  }

  /* ---------- Show on map ---------- */
  function openShow() {
    const row = ([k, ic, n, d]) => `<button class="uxrow" data-k="${k}" aria-pressed="false"><span class="ic">${ic}</span><span class="t"><b>${esc(n)}</b>${d ? `<small>${esc(d)}</small>` : ''}</span><span class="sw"></span></button>`;
    const s = sheet('show', `<header class="uxh"><div><b>Show on map</b><small>Pick what you want to see. Everything else stays out of the way.</small></div><button class="uxx" data-x aria-label="Close">✕</button></header>
      <div class="uxpresets">${PRESETS.map(([id, ic, n]) => `<button data-preset="${id}" aria-pressed="false"><span>${ic}</span>${esc(n)}</button>`).join('')}</div>
      ${GROUPS.map(([g, items], gi) => `<div class="uxgroup${g === 'Map' ? ' fold' : ''}" style="--i:${gi}"><div class="uxeyebrow">${esc(g)}</div>${items.map(row).join('')}</div>`).join('')}
      <p class="uxfine">Wildfires, road closures and weather warnings always show, even on a clean map.</p>`);
    s.querySelectorAll('[data-k]').forEach(r => r.onclick = () => { const k = r.dataset.k; setLayer(k, !BY[k][4].get()); press(r); });
    s.querySelectorAll('[data-preset]').forEach(c => c.onclick = () => { press(c); preset(c.dataset.preset); });
    sync();
  }
  function press(el) { el.classList.remove('uxpress'); void el.offsetWidth; el.classList.add('uxpress'); }

  /* ---------- Share ---------- */
  const SHARE = [
    ['📸', 'Photo or video', 'Share a moment with everyone or your family group', () => Social.openCreate('post')],
    ['🚧', 'Road problem', 'Wreck, closure, tree down, ice', () => Social.openCreate('report')],
    ['🐻', 'Wildlife or bloom', 'Bears, elk, wildflowers, fall color', () => Locals.compose('W')],
    ['🥾', 'Trail conditions', 'Mud, ice, trees down on a trail', () => Locals.compose('T')],
    ['🐾', 'Lost or found pet', 'People nearby get an alert', () => Locals.compose('P')],
    ['⚡', 'Power outage', 'Let neighbors know', () => Locals.compose('O')],
    ['🎪', 'Local event', 'Games, church, community events', () => Locals.compose('E')],
    ['🏪', 'Business post', 'A deal, your hours, a job, live music', () => Locals.compose('B')],
    ['🕰️', 'Old photo or story', 'Pin a memory where it happened', () => Locals.compose('M')],
  ];
  function share() {
    const s = sheet('share', `<header class="uxh"><div><b>Share</b><small>What do you want to post?</small></div><button class="uxx" data-x aria-label="Close">✕</button></header>
      <div class="uxshare">${SHARE.map(([ic, n, d], i) => `<button data-s="${i}" style="--i:${i}"><span class="ic">${ic}</span><b>${esc(n)}</b><small>${esc(d)}</small></button>`).join('')}</div>`);
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { closeSheet(); const f = SHARE[+b.dataset.s][3]; const needsHub = f.toString().includes('Locals'); if (needsHub && document.body.dataset.view !== 'map') toView('map'); setTimeout(f, needsHub ? 260 : 0); });
  }

  /* ---------- Today ---------- */
  const WHO = [['visitor', '🧳', 'Visiting', 'Plan the day: weather, drive times, what\'s worth it'], ['local', '🏡', 'I live here', 'Roads, alerts, neighbors, the Parkway clock'], ['explorer', '🥾', 'Exploring', 'Hikes, sunrise, rivers, wildlife, photos']];
  const who = () => store.get('who', 'visitor');
  const TOWNS = [['Sevierville', 35.868, -83.562], ['Pigeon Forge', 35.788, -83.554], ['Gatlinburg', 35.714, -83.510], ['Wears Valley', 35.702, -83.665], ['Kodak', 35.971, -83.618], ['Seymour', 35.886, -83.775], ['Townsend', 35.675, -83.756], ['Cosby', 35.789, -83.210], ['Newport', 35.967, -83.188], ['Maryville', 35.757, -83.971], ['Knoxville', 35.961, -83.921], ['Cherokee', 35.484, -83.315], ['Bryson City', 35.431, -83.450], ['Maggie Valley', 35.518, -83.098], ['Waynesville', 35.489, -82.989]];
  const home = () => (window.Live && Live.home ? Live.home() : { n: 'Gatlinburg' });
  function nearestTown(lat, lng) { let b = TOWNS[0], d = 1e9; TOWNS.forEach(t => { const k = (t[1] - lat) ** 2 + ((t[2] - lng) * 0.81) ** 2; if (k < d) { d = k; b = t; } }); return b; }
  function setHome(t, quiet) {
    if (!window.Live || !Live.setHome) return;
    Promise.resolve(Live.setHome({ n: t[0], lat: t[1], lng: t[2] })).then(() => { if (document.body.dataset.view === 'today') today($('#sv-today')); });
    store.set('homeSet', true); if (!quiet) toast(`Weather and your brief now follow ${t[0]}`);
    if (document.body.dataset.view === 'today') today($('#sv-today'));
  }
  function askHome(first) {
    const w = who(), q = w === 'local' ? 'Where do you live?' : w === 'explorer' ? 'Where are you based?' : 'Where are you staying?';
    const s = sheet('home', `<header class="uxh"><div><b>${q}</b><small>Your weather, morning brief and drive times start from here.</small></div><button class="uxx" data-x aria-label="Close">✕</button></header>
      <button class="uxgps" data-gps>📍 Use my location</button>
      <div class="uxtowns">${TOWNS.map((t, i) => `<button data-town="${i}" aria-pressed="${t[0] === home().n}" style="--i:${i}">${esc(t[0])}</button>`).join('')}</div>
      ${first ? '<p class="uxfine">You can change this any time from the Today screen.</p>' : ''}`);
    s.querySelectorAll('[data-town]').forEach(b => b.onclick = () => { press(b); setHome(TOWNS[+b.dataset.town]); setTimeout(closeSheet, 200); });
    s.querySelector('[data-gps]').onclick = () => {
      if (!navigator.geolocation) return toast('Location is not available on this device');
      s.querySelector('[data-gps]').textContent = '📍 Finding you…';
      navigator.geolocation.getCurrentPosition(p => { const t = nearestTown(p.coords.latitude, p.coords.longitude); setHome(t); closeSheet(); }, () => { toast('Could not get your location. Pick your town instead.'); s.querySelector('[data-gps]').textContent = '📍 Use my location'; }, { timeout: 10000, maximumAge: 600000 });
    };
  }
  function greet() {
    const h = +new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
    return h < 4 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  function urgent() {
    const L = window.Live && Live.st; if (!L) return '';
    const out = [];
    (L.alerts || []).forEach((a, i) => out.push(`<button class="uxalert" data-alert="${i}"><span>⚠️</span><div><b>${esc(a.event)}</b><small>${esc((a.description || a.headline || '').replace(/^\*\s*/, '').replace(/\s*\*\s*/g, ' · '))}</small></div></button>${window.Hazards && Hazards.isFlood(a) ? `<button class="uxhz" data-hz="flood" data-i="${i}">🌊 What this means near you<i>›</i></button>` : ''}`));
    if ((L.fires || []).length) out.push(`<button class="uxalert fire" data-fly="fire"><span>🔥</span><div><b>${L.fires.length} fire${L.fires.length > 1 ? 's' : ''} spotted by satellite</b><small>Heat detections in the last 24 hours. Tap to see where.</small></div></button><button class="uxhz" data-hz="fire">🧭 Wind and possible spread<i>›</i></button>`);
    const closed = (L.traffic.incidents || []).filter(n => /clos/i.test(n.title + ' ' + (n.desc || '')));
    if (closed.length) out.push(`<button class="uxalert road" data-fly="closed"><span>🚧</span><div><b>${closed.length === 1 ? esc(closed[0].title) : closed.length + ' roads closed'}</b><small>${closed.slice(closed.length === 1 ? 0 : 0, 3).map(n => esc(closed.length === 1 ? (n.desc || '').slice(0, 120) : n.title)).join(' · ')}</small></div></button>`);
    return out.length ? `<div class="uxsec"><div class="uxeyebrow hot">Heads up</div>${out.join('')}</div>` : '';
  }
  function weather() {
    const L = window.Live && Live.st; const w = L && L.wx; if (!w) return `<div class="uxwx loading"><div class="uxspin"></div><span>${L && L.blocked ? 'Live weather needs the full site.' : 'Getting the weather…'}</span></div>`;
    const c = w.current, d = w.daily, hrs = w.hourly, now = Date.now();
    let k = hrs.time.findIndex(t => new Date(t + ':00-05:00').valueOf() > now - 3600e3); if (k < 0) k = 0;
    const strip = hrs.time.slice(k, k + 12).map((t, j) => { const i = k + j; const p = hrs.precipitation_probability[i] || 0; return `<div><small>${j ? new Date(t + ':00-05:00').toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric' }) : 'Now'}</small>${Live.icon(hrs.weather_code[i], hrs.is_day ? hrs.is_day[i] : 1).replace('id="wxIcon"', 'width="26" height="26"')}<b>${Math.round(hrs.temperature_2m[i])}°</b>${p >= 20 ? `<i>${p}%</i>` : '<i></i>'}</div>`; }).join('');
    const fmt = s => new Date(s + ':00-05:00').toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
    return `<div class="uxwx"><div class="big">${Live.icon(c.weather_code, c.is_day).replace('id="wxIcon"', 'width="64" height="64"')}<div><b>${Math.round(c.temperature_2m)}°</b><span>${esc(Live.WMO[c.weather_code] || '')} in ${esc(home().n)}</span><small>High ${Math.round(d.temperature_2m_max[0])}° · Low ${Math.round(d.temperature_2m_min[0])}° · Feels ${Math.round(c.apparent_temperature)}°${L.grid && L.grid.summit ? ` · Le Conte ${Math.round(L.grid.summit.temperature_2m)}°` : ''}</small></div></div>
      <div class="strip">${strip}</div><div class="sun">🌅 ${fmt(d.sunrise[0])} <span>·</span> 🌇 ${fmt(d.sunset[0])}</div></div>`;
  }
  function section(title, tab, body, more) {
    if (!body) return '';
    return `<div class="uxsec"><div class="uxeyebrow">${esc(title)}${more ? `<button class="uxmore" data-hub="${tab}">${esc(more)} ›</button>` : ''}</div>${body}</div>`;
  }
  const L$ = (tab) => { try { return window.Locals ? Locals.section(tab) : ''; } catch (e) { console.warn('[ux] section', tab, e); return ''; } };
  function worthTop(n) { // the best few places to go right now, closed ones last
    const h = L$('go'); if (!h || !/lcardg/.test(h)) return h;
    const W = (Locals.S.worth || []).map((w, i) => ({ i, s: w.now.shut ? -1 : w.now.s })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.i);
    const box = document.createElement('div'); box.innerHTML = h; const g = box.querySelector('.lgo');
    const cards = [...box.querySelectorAll('.lcardg')]; cards.forEach(c => c.remove());
    W.forEach((i, j) => { const c = cards.find(x => +x.dataset.go === i); if (c) { c.style.animationDelay = j * 70 + 'ms'; g.appendChild(c); } });
    box.querySelectorAll('.fine').forEach(f => f.remove()); return box.innerHTML;
  }
  function sunrise() { // the hero card from the sunrise forecast, without the long list
    const h = L$('sky'); if (!h || !/lhero/.test(h)) return '';
    const box = document.createElement('div'); box.innerHTML = h;
    [...box.children].forEach(el => { if (!el.matches('.lhero, .lstats, .lsay, .lseat')) el.remove(); });
    return box.innerHTML;
  }
  function brief() { // the locals brief minus what the weather card already says
    let h = ''; try { h = window.Locals ? Locals.brief() : ''; } catch (e) { return ''; }
    const box = document.createElement('div'); box.innerHTML = h; box.querySelectorAll('.lbrief, .wx, .fine, .lchips button:not(.has)').forEach(x => x.remove());
    const ch = box.querySelector('.lchips'); if (ch && !ch.children.length) { const sub = ch.previousElementSibling; ch.remove(); if (sub && sub.classList.contains('lsub')) sub.remove(); }
    return box.innerHTML;
  }
  function roads() {
    if (!window.Locals) return '';
    let clock = ''; try { clock = Locals.clockHTML(true); } catch (e) { }
    const R = Locals.roadsNow(), inc = (Live.st.traffic.incidents || []).length;
    return `${clock}<div class="lbx"><span class="i">🚗</span><div><b>${R.tip ? esc(R.tip) : R.worst && R.worst.cur / R.worst.free < 0.6 ? `Slow on ${esc(R.worst.name)} (${Math.round(R.worst.cur)} mph)` : R.live ? 'Roads are moving' : 'Road speeds loading'}</b><small>${inc ? `${inc} road report${inc > 1 ? 's' : ''} right now. ` : ''}<button class="uxlink" data-preset-go="drive">See traffic on the map</button></small></div></div>`;
  }
  function events() {
    if (!window.Locals) return '';
    const ev = Locals.feedEvents(0).slice(0, 4); if (!ev.length) return '';
    return `<div class="litems">${ev.map(e => `<a class="litem" href="${esc(e.link)}" target="_blank" rel="noopener"><span class="e">${e.kind === 'church' ? '⛪' : e.kind === 'sports' ? '🏈' : '🎪'}</span><span class="t"><b>${esc(e.title)}</b><small>${esc(e.source || '')}${e.ongoing ? ' · ongoing' : ''}</small></span></a>`).join('')}</div>`;
  }
  function rivers() {
    const g = (Live.st.gauges || []).filter(x => x.cfs24 && x.cfs24.length > 3).slice(0, 4); if (!g.length) return '';
    return `<div class="uxriv">${g.map(x => { const a = x.cfs24, r = a[a.length - 1] / Math.max(1, a[a.length - 4]); return `<div><b>${esc((x.name || '').replace(/\s+(NR|NEAR|AB|ABOVE|BL|BELOW|AT)\s.*$/i, '').replace(/,.*$/, '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim())}</b><span>${Math.round(a[a.length - 1]).toLocaleString()} cfs</span><small class="${r > 1.15 ? 'up' : ''}">${r > 1.15 ? '↑ rising' : r < 0.87 ? '↓ falling' : '→ steady'}</small></div>`; }).join('')}</div>`;
  }
  function sponsor() { // room for featured local businesses; honest placeholder until sponsors sign up
    return `<div class="uxsponsor"><span class="tag">Featured</span><b>Your restaurant or shop here</b><small>Local businesses will be able to feature a deal or tonight's special right here. Own one?</small><button class="uxlink" data-hub="board">Post to the local board for free ›</button></div>`;
  }
  function chips(list) { return `<div class="uxchips">${list.map(([tab, ic, l]) => `<button data-hub="${tab}">${ic} ${esc(l)}</button>`).join('')}</div>`; }
  function today(el) {
    const w = who(), date = new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
    const parts = {
      visitor: [section('Worth going right now', 'go', worthTop(3), 'All places'), section('Getting around', 'roads', roads(), 'Roads'), section('Tomorrow\'s sunrise', 'sky', sunrise(), 'Forecast'), section('Happening today', 'events', events(), 'Events'), sponsor()],
      local: [section('Your morning brief', 'today', brief(), 'Local hub'), section('Rivers', 'alerts', rivers(), 'My alerts'), sponsor()],
      explorer: [section('Sunrise and fog', 'sky', sunrise(), 'Forecast'), section('Best views now', 'go', worthTop(3), 'All places'), section('Rivers', 'alerts', rivers(), 'Alerts'), section('Out there', 'trails', chips([['trails', '🥾', 'Trail reports'], ['wild', '🐻', 'Sightings'], ['memory', '🕰️', 'Old photos']])), section('Happening today', 'events', events(), 'Events')],
    }[w];
    el.innerHTML = `<header class="uxtop"><div><small>${esc(date)}</small><b>${greet()}${w === 'local' ? ', neighbor' : ''}.</b></div><div class="uxchipsr"><button class="uxwho" data-home aria-label="Change your town">📍 ${esc(home().n)} ▾</button><button class="uxwho" data-who aria-label="Change who this is for">${WHO.find(x => x[0] === w)[1]} ${esc(WHO.find(x => x[0] === w)[2])} ▾</button></div></header>
      <div class="uxbody">${urgent()}${weather()}${parts.join('')}<p class="uxfine">Weather from Open-Meteo and the National Weather Service. Drive times from TomTom. Events from the town calendars.</p></div>`;
    if (window.Locals && Locals.rings) Locals.rings(el);
  }

  /* ---------- More ---------- */
  function more(el) {
    const S = window.Social && Social.S, w = who();
    const item = (attr, ic, n, d) => `<button class="uxitem" ${attr}><span class="ic">${ic}</span><span class="t"><b>${esc(n)}</b>${d ? `<small>${esc(d)}</small>` : ''}</span>${attr === 'data-dm' ? '<i class="cnt" hidden></i>' : ''}<i>›</i></button>`;
    const stops = [...document.querySelectorAll('#tourList .stop')].map((b, i) => `<button data-stop="${i}">${esc(b.querySelector('span:not(.dot)').textContent)}</button>`).join('');
    el.innerHTML = `<header class="uxtop"><div><b>More</b></div></header><div class="uxbody">
      <div class="uxsec"><div class="uxeyebrow">You</div>${item('data-v="profile"', '👤', 'Your profile', 'Posts, saved, sign in')}${item('data-v="profile" data-groups', '👪', 'Family groups', 'Private posts only your group can see')}${item('data-v="activity"', '🔔', 'Activity', 'Likes, comments, news since you last looked')}${item('data-dm', '💬', 'Messages', 'Private messages with people and family')}</div>
      <div class="uxsec"><div class="uxeyebrow">This app is for</div><div class="uxseg">${WHO.map(([k, ic, n]) => `<button data-setwho="${k}" aria-pressed="${k === w}">${ic} ${esc(n)}</button>`).join('')}</div><p class="uxfine" style="margin:8px 2px 0">Changes what Today shows first. ${w === 'local' ? 'Local\'s mode is on: tourist stuff is tucked away.' : ''}</p></div>
      <div class="uxsec"><div class="uxeyebrow">Plan</div>${item('data-hub="go"', '🎯', 'Is it worth going?', 'A 0 to 10 score for each spot right now')}${item('data-hub="sky"', '🌄', 'Sunrise and fog forecast', 'Sea of clouds, best overlook')}${item('data-hub="roads"', '🚗', 'Roads and the Parkway clock', 'Drive times and back roads')}${item('data-tour', '🎬', 'Grand tour', 'A flyover of the whole park')}<div class="uxstops">${stops}</div></div>
      <div class="uxsec"><div class="uxeyebrow">Neighbors</div>${item('data-hub="alerts"', '📍', 'Alerts for my places', 'Creeks, fire, ice, outages near home')}${item('data-hub="outages"', '⚡', 'Outages')}${item('data-hub="pets"', '🐾', 'Lost and found pets')}${item('data-hub="board"', '🏪', 'Local business board', 'Deals, open now, jobs, music')}${item('data-hub="events"', '🏈', 'Local events', 'Games, church, community')}${item('data-hub="memory"', '🕰️', 'Old photos and stories')}</div>
      <div class="uxsec"><div class="uxeyebrow">App</div>${Social.standalone && Social.standalone() ? '' : item('data-install', '📲', 'Get the app', 'Add Smokies Live to your home screen')}${item('data-about', 'ℹ️', 'About the data', 'Where everything comes from')}</div>
      <p class="uxfine">Smokies Live · made in Sevier County</p></div>`;
  }

  /* ---------- clicks inside Today and More ---------- */
  function onPane(e) {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.who != null) { askWho(true); return; }
    if (d.home != null) { askHome(false); return; }
    if (d.setwho) { setWho(d.setwho); more($('#sv-more')); return; }
    if (d.hub) { if (window.Locals) { toView('map'); setTimeout(() => Locals.openHub(d.hub), 120); } return; }
    if (d.v) { toView(d.v); if (d.groups != null) setTimeout(() => { const g = document.querySelector('.pgroups'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 250); return; }
    if (d.presetGo) { toView('map'); preset(d.presetGo); return; }
    if (d.hz) { const L = Live.st; if (d.hz === 'flood') Hazards.flood(L.alerts[+d.i]); else if (L.fires.length === 1) Hazards.fire(L.fires[0]); else { toView('map'); const m = window.__smokies.map, xs = L.fires.map(p => p.lng), ys = L.fires.map(p => p.lat); setTimeout(() => { m.fitBounds([[Math.min(...xs) - .03, Math.min(...ys) - .03], [Math.max(...xs) + .03, Math.max(...ys) + .03]], { padding: 80, pitch: 55, duration: 2200, maxZoom: 13 }); window.__smokies.showToast('Tap a fire to see the wind there and where it could spread'); }, 250); } return; }
    if (d.stop != null) { toView('map'); setTimeout(() => document.querySelectorAll('#tourList .stop')[+d.stop].click(), 200); return; }
    if (d.tour != null) { toView('map'); setTimeout(() => $('#grand').click(), 200); return; }
    if (d.install != null) { Social.install(); return; }
    if (d.about != null) { $('#aboutBtn').click(); return; }
    if (d.alert != null) { b.classList.toggle('open'); return; }
    if (d.fly) { toView('map'); const L = Live.st, m = window.__smokies.map; const pts = d.fly === 'fire' ? L.fires : L.traffic.incidents.filter(n => /clos/i.test(n.title + ' ' + (n.desc || ''))); if (pts.length && m) { const xs = pts.map(p => p.lng), ys = pts.map(p => p.lat); setTimeout(() => m.fitBounds([[Math.min(...xs) - .03, Math.min(...ys) - .03], [Math.max(...xs) + .03, Math.max(...ys) + .03]], { padding: 80, pitch: 55, duration: 2200, maxZoom: 13 }), 250); } return; }
    if (window.Locals && (d.go != null || d.preview != null || d.look != null || d.seat != null || d.item || d.hit != null || d.memo)) { toView('map'); setTimeout(() => Locals.onBody(e), 200); return; }
    if (d.goTab && window.Locals) { toView('map'); setTimeout(() => Locals.openHub(d.goTab), 120); }
  }

  /* ---------- who is this for (asked once, changeable in More) ---------- */
  function setWho(w) {
    store.set('who', w);
    if (window.Locals) Locals.setLocalMode(w === 'local', true);
    if (document.body.dataset.view === 'today') today($('#sv-today'));
  }
  function askWho(again) {
    const s = sheet('who', `<header class="uxh"><div><b>${again ? 'Who is this for?' : 'Welcome to Smokies Live'}</b><small>${again ? 'Today will show what matters to you first.' : 'The whole park, live. Tell us what brings you here and we\'ll keep it simple.'}</small></div>${again ? '<button class="uxx" data-x aria-label="Close">✕</button>' : ''}</header>
      <div class="uxwhos">${WHO.map(([k, ic, n, d], i) => `<button data-pick="${k}" style="--i:${i}"><span class="ic">${ic}</span><b>${esc(n)}</b><small>${esc(d)}</small></button>`).join('')}</div>
      ${again ? '' : '<p class="uxfine">You can change this any time under More. The map starts clean; tap <b>Show on map</b> to add traffic, radar, trails and more.</p>'}`);
    s.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { press(b); setWho(b.dataset.pick); if (again) { setTimeout(closeSheet, 220); return; } setTimeout(() => askHome(true), 260); });
  }
  function quietHome() { // already allowed location? pick the nearest town without asking
    if (store.get('homeSet', false) || !navigator.permissions || !navigator.geolocation) return;
    navigator.permissions.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') navigator.geolocation.getCurrentPosition(p => setHome(nearestTown(p.coords.latitude, p.coords.longitude), true), () => { }, { timeout: 10000, maximumAge: 600000 }); }).catch(() => { });
  }
  function labelPills() { // town and peak names sit on small dark tags, so they read over any imagery, cloud or haze
    const m = window.__smokies.map;
    try {
      if (!m.hasImage('lblpill')) {
        const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
        g.fillStyle = 'rgba(9,14,11,0.86)'; g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
        g.beginPath(); g.roundRect(3, 3, S - 6, S - 6, 14); g.fill(); g.stroke();
        m.addImage('lblpill', g.getImageData(0, 0, S, S), { pixelRatio: 2, stretchX: [[18, 46]], stretchY: [[18, 46]], content: [14, 12, 50, 52] });
      }
      [['lbl-place', [2, 6, 2, 6]], ['lbl-peak', [3, 6, 2, 6]], ['lbl-waterfall', [2, 6, 2, 6]], ['lbl-poi', [2, 5, 2, 5]]].forEach(([id, pad]) => {
        if (!m.getLayer(id)) return;
        m.setLayoutProperty(id, 'icon-image', 'lblpill'); m.setLayoutProperty(id, 'icon-text-fit', 'both'); m.setLayoutProperty(id, 'icon-text-fit-padding', pad);
        m.setPaintProperty(id, 'text-halo-width', 0.6); m.setPaintProperty(id, 'text-halo-color', 'rgba(0,0,0,0.6)');
      });
      // line labels (rivers, roads, trails) can't carry a tag: give them a heavy solid outline instead
      ['lbl-water', 'lbl-road', 'lbl-trail'].forEach(id => { if (!m.getLayer(id)) return; m.setPaintProperty(id, 'text-halo-width', 2.6); m.setPaintProperty(id, 'text-halo-blur', 0); m.setPaintProperty(id, 'text-halo-color', 'rgba(6,10,8,0.95)'); });
      // and every label draws last, above clouds, radar and pins' shadows
      m.getStyle().layers.filter(l => l.id.startsWith('lbl-')).forEach(l => m.moveLayer(l.id));
    } catch (e) { console.warn('[ux] labels', e); }
  }
  function phoneMap() { // phones: bigger labels, a lower top pitch (fewer far-off tiles), 3D buildings only up close
    if (!matchMedia('(max-width:760px)').matches) return;
    const m = window.__smokies.map;
    try {
      m.setMaxPitch(72);
      if (m.getLayer('buildings')) m.setLayerZoomRange('buildings', 13.5, 24);
      ['lbl-water', 'lbl-road', 'lbl-trail', 'lbl-poi', 'lbl-waterfall'].forEach(id => { if (!m.getLayer(id)) return; const v = m.getLayoutProperty(id, 'text-size'); if (typeof v === 'number') m.setLayoutProperty(id, 'text-size', +(v * 1.2).toFixed(1)); });
      if (m.getLayer('lbl-peak')) m.setLayoutProperty('lbl-peak', 'text-size', ['interpolate', ['linear'], ['zoom'], 9, 13.5, 14, 16.5]);
      if (m.getLayer('lbl-place')) { const v = m.getLayoutProperty('lbl-place', 'text-size'); if (v) m.setLayoutProperty('lbl-place', 'text-size', ['*', 1.18, v]); }
    } catch (e) { console.warn('[ux] phone map', e); }
  }
  function tabh() { const t = $('#tabbar'); if (!t) return; const r = t.getBoundingClientRect(); const h = r.top > innerHeight / 2 ? Math.max(0, innerHeight - r.top) : 0; document.body.style.setProperty('--tabh', h + 'px'); }
  function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 3000); }

  /* ---------- search: popular places before you type ---------- */
  function searchHelp() {
    const q = $('#q'), box = $('#results'); if (!q || !box) return;
    const show = () => {
      if (q.value.trim().length) return;
      const stops = [...document.querySelectorAll('#tourList .stop')];
      box.innerHTML = `<div class="uxsugg">Popular places</div>` + stops.map((b, i) => `<button data-stop="${i}"><span>${esc(b.querySelector('span:not(.dot)').textContent)}</span><small>${esc((b.querySelector('small') || {}).textContent || '')}</small></button>`).join('') + `<button data-tour><span>🎬 Grand tour of the park</span><small>flyover</small></button>`;
      box.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => { box.hidden = true; q.blur(); stops[+b.dataset.stop].click(); });
      box.querySelector('[data-tour]').onclick = () => { box.hidden = true; q.blur(); $('#grand').click(); };
      box.hidden = false;
    };
    q.addEventListener('focus', show);
    q.addEventListener('input', () => setTimeout(show, 220));
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#search')) box.hidden = true; });
  }

  /* ---------- start ---------- */
  function build() {
    document.body.classList.add('ux');
    const b = document.createElement('button'); b.id = 'uxshow'; b.className = 'panel';
    b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8.5l10 5.5 10-5.5z"/><path d="m2 13.5 10 5.5 10-5.5"/></svg><span>Show on map</span><b class="n" hidden>0</b>`;
    b.onclick = () => { press(b); $('#uxsheet') && !$('#uxsheet').hidden && $('#uxsheet').dataset.kind === 'show' ? closeSheet() : openShow(); };
    document.body.appendChild(b);
    // weather chip and alert bar lead to Today instead of the old panel
    const chip = $('#liveChip'); if (chip) chip.addEventListener('click', e => { e.stopImmediatePropagation(); e.preventDefault(); toView('today'); }, true);
    const ab = $('#alertBar'); if (ab) ab.addEventListener('click', e => { e.stopImmediatePropagation(); toView('today'); }, true);
    ['#sv-today', '#sv-more'].forEach(s => { const el = $(s); if (el) el.addEventListener('click', onPane); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
    labelPills(); phoneMap();
    searchHelp(); tabh(); addEventListener('resize', tabh); setTimeout(tabh, 1500); setInterval(tabh, 5000); quietHome();
    // apply what this person chose last time (or the clean defaults)
    const w = want(); ALL.forEach(([k, , , , io]) => { if (io.get() !== w[k]) try { io.set(w[k]); } catch (e) { } });
    if (window.Locals) Locals.setLocalMode(who() === 'local', true);
    sync(); setInterval(sync, 4000);
    setInterval(() => { const v = document.body.dataset.view; if (!document.hidden && v === 'today') today($('#sv-today')); }, 60e3);
    if (store.get('who', null) == null) {
      const ask = () => { if (!$('#uxsheet') || $('#uxsheet').hidden) askWho(false); };
      const t = setInterval(() => { if (document.body.classList.contains('sl-revealed') || window.__noIntro || $('#loader') && $('#loader').classList.contains('done')) { clearInterval(t); setTimeout(ask, window.__noIntro ? 600 : 2600); } }, 400);
    }
  }
  function ready() { return window.__smokies && window.__smokies.map && window.Live && Live.setOn && window.Social && Social.S && $('#tabbar') && window.Locals && Locals.section && $('#lhub'); }
  const wait = setInterval(() => { if (ready()) { clearInterval(wait); try { build(); } catch (e) { console.error('[ux]', e); } } }, 300);

  return {
    render(v, el) { if (v === 'today') today(el); else if (v === 'more') more(el); },
    share, openShow, closeSheet, preset, setLayer, askWho, askHome,
  };
})();
window.UX = UX;
