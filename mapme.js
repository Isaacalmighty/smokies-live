/* =====================================================================
   MAP ME: the personal side of the map.
   1. Your location: a blue dot and a button that glides the map to you.
   2. Map briefing: what matters around you right now (traffic, closures,
      weather warnings, drive times, your family).
   3. Family on the map: group members who chose to share, visible only
      to that group. The database enforces it (supabase/07_locations.sql).
   Reaches the app through window.__smokies.map, Live, Social, UX, Locals.
   ===================================================================== */
const MapMe = (() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sl-me-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sl-me-' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const TZ = 'America/New_York';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const BOUNDS = [-86.5, 34.2, -80.5, 37.4];
  const inMap = ll => ll.lng > BOUNDS[0] && ll.lng < BOUNDS[2] && ll.lat > BOUNDS[1] && ll.lat < BOUNDS[3];
  const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const miles = k => { const m = k * 0.621371; return m < 0.1 ? 'right here' : m < 10 ? m.toFixed(1) + ' mi' : Math.round(m) + ' mi'; };
  const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' hr ago'; };
  const clock = d => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  let map = null;
  const onMap = () => document.body.dataset.view === 'map' && !document.hidden;
  function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 3000); }
  function press(el) { if (!el || reduce) return; el.classList.remove('mm-pop'); void el.offsetWidth; el.classList.add('mm-pop'); }
  const ICON = {
    locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6.5"/><circle class="core" cx="12" cy="12" r="2.6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="core" d="M12 3l7 18-7-4-7 4z"/></svg>',
    brief: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3.2"/><path d="M20.4 18.4L22 20"/></svg>',
  };

  /* =====================================================================
     1. YOUR LOCATION
     ===================================================================== */
  const Me = { watch: null, pos: null, marker: null, follow: false, wantCenter: false, first: true, denied: false };
  function locBtn() {
    const b = document.createElement('button'); b.id = 'mmLocate'; b.className = 'panel'; b.setAttribute('aria-label', 'Show my location'); b.dataset.state = 'off';
    b.innerHTML = ICON.locate;
    b.onclick = () => {
      press(b);
      if (!Me.watch) return startLocate(true);
      if (Me.pos) { if (Me.follow) { Me.follow = false; setState(); toast('Stopped following you'); return; } centerOnMe(); }
      else Me.wantCenter = true;
    };
    document.body.appendChild(b);
  }
  function setState() {
    const b = $('#mmLocate'); if (!b) return;
    b.dataset.state = !Me.watch ? 'off' : !Me.pos ? 'wait' : Me.follow ? 'follow' : 'on';
    b.setAttribute('aria-label', Me.follow ? 'Following you. Tap to stop.' : Me.watch ? 'Center on me' : 'Show my location');
  }
  function startLocate(center, quiet) {
    if (!navigator.geolocation) { if (!quiet) toast('Location is not available on this device'); return; }
    if (Me.watch) return;
    Me.wantCenter = center; store.set('on', true);
    Me.watch = navigator.geolocation.watchPosition(onPos, err => {
      if (err.code === 1) { stopLocate(); store.set('on', false); Me.denied = true; if (!quiet) toast('Location is off for Smokies Live. Turn it on in your phone settings to see yourself on the map.'); }
      else if (!Me.pos && !quiet) toast('Still looking for you…');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 25000 });
    setState();
  }
  function stopLocate() { if (Me.watch != null) navigator.geolocation.clearWatch(Me.watch); Me.watch = null; Me.follow = false; setState(); }
  function onPos(p) {
    const c = p.coords, ll = { lng: c.longitude, lat: c.latitude };
    const prev = Me.pos; Me.pos = { ...ll, acc: c.accuracy || 50, heading: c.heading, speed: c.speed, t: Date.now() };
    drawMe(prev);
    if (Me.wantCenter) { Me.wantCenter = false; if (inMap(ll)) centerOnMe(); else toast('You are outside the map area right now. Your dot will show up when you are in the region.'); }
    else if (Me.follow && onMap() && !map.isMoving()) map.easeTo({ center: [ll.lng, ll.lat], duration: 900, easing: easeOut, essential: true });
    setState();
    Fam.myMove();
    Brief.chip();
  }
  function circle(ll, m, n = 48) { // accuracy ring as a real-size circle on the ground
    const pts = [], dLat = m / 111320, dLng = m / (111320 * Math.cos(ll.lat * Math.PI / 180));
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push([ll.lng + Math.cos(a) * dLng, ll.lat + Math.sin(a) * dLat]); }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  }
  function drawMe(prev) {
    const P = Me.pos; if (!P || !map) return;
    const src = map.getSource('mm-acc'), data = { type: 'FeatureCollection', features: P.acc < 2000 ? [circle(P, P.acc)] : [] };
    if (src) src.setData(data);
    else {
      map.addSource('mm-acc', { type: 'geojson', data });
      const before = map.getLayer('lbl-water') ? 'lbl-water' : undefined;
      map.addLayer({ id: 'mm-acc', type: 'fill', source: 'mm-acc', paint: { 'fill-color': '#4aa3ff', 'fill-opacity': 0.13 } }, before);
      map.addLayer({ id: 'mm-acc-line', type: 'line', source: 'mm-acc', paint: { 'line-color': '#7cc0ff', 'line-width': 1.2, 'line-opacity': 0.55 } }, before);
    }
    if (!Me.marker) {
      const el = document.createElement('div'); el.className = 'mm-me'; el.innerHTML = '<i class="pulse"></i><i class="cone"></i><b></b>';
      el.onclick = e => { e.stopPropagation(); toast(`You are here${P.acc ? ` (within ${Math.round(P.acc * 3.28)} ft)` : ''}`); };
      Me.marker = new maplibregl.Marker({ element: el, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat([P.lng, P.lat]).addTo(map);
      requestAnimationFrame(() => el.classList.add('in'));
    } else if (prev && !reduce) glide(Me.marker, prev, P, 700);
    else Me.marker.setLngLat([P.lng, P.lat]);
    const moving = P.heading != null && !isNaN(P.heading) && (P.speed || 0) > 0.8;
    Me.marker.getElement().classList.toggle('moving', moving);
    if (moving) Me.marker.setRotation(P.heading);
  }
  function glide(mk, a, b, dur) { // slow in, slow out between fixes instead of a jump
    cancelAnimationFrame(mk._g); const t0 = performance.now();
    const step = now => { const t = Math.min(1, (now - t0) / dur), k = easeInOut(t); mk.setLngLat([a.lng + (b.lng - a.lng) * k, a.lat + (b.lat - a.lat) * k]); if (t < 1) mk._g = requestAnimationFrame(step); };
    mk._g = requestAnimationFrame(step);
  }
  function centerOnMe() {
    const P = Me.pos; if (!P) return;
    if (window.__smokies.stopOrbit) __smokies.stopOrbit();
    const z = Math.max(map.getZoom(), 14.6), far = km(map.getCenter(), P) > 30;
    // anticipation: a short settle back, then a smooth glide that lands softly
    map.flyTo({ center: [P.lng, P.lat], zoom: z, pitch: Math.min(map.getPitch(), 55), bearing: map.getBearing(), duration: reduce ? 0 : far ? 2600 : 1400, curve: 1.42, easing: easeInOut, essential: true });
    map.once('moveend', () => { Me.follow = true; setState(); const el = Me.marker && Me.marker.getElement(); if (el) { el.classList.remove('land'); void el.offsetWidth; el.classList.add('land'); } });
  }

  /* =====================================================================
     2. MAP BRIEFING
     ===================================================================== */
  const DEST = [
    { k: 'gat', n: 'Gatlinburg', ll: { lng: -83.5135, lat: 35.7125 } },
    { k: 'pf', n: 'Pigeon Forge', ll: { lng: -83.5560, lat: 35.8000 } },
    { k: 'sev', n: 'Sevierville', ll: { lng: -83.5640, lat: 35.8680 } },
    { k: 'park', n: 'Sugarlands (park)', ll: { lng: -83.5297, lat: 35.6855 } },
    { k: 'cc', n: 'Cades Cove', ll: { lng: -83.7712, lat: 35.6036 } },
    { k: 'knx', n: 'Knoxville airport', ll: { lng: -83.9940, lat: 35.8110 } },
  ];
  const Brief = { open: false, routes: store.get('routes', {}), route: null };
  function origin() { // where you are, or the home town you picked for weather
    if (Me.pos && inMap(Me.pos)) return { ll: Me.pos, n: 'you', live: true };
    const h = window.Live && Live.home ? Live.home() : { n: 'Gatlinburg', lat: 35.714, lng: -83.512 };
    return { ll: { lng: h.lng, lat: h.lat }, n: h.n, live: false };
  }
  function flowItems() { return (window.Locals && Locals.S.flow && Locals.S.flow.items) || []; }
  function slowdowns(o) {
    return flowItems().filter(x => x.cur && x.free && (x.closed || x.cur / x.free < 0.8))
      .map(x => ({ ...x, r: x.closed ? 0 : x.cur / x.free, d: km(o.ll, x), delay: x.tt && x.ftt ? Math.max(0, Math.round((x.tt - x.ftt) / 60)) : 0 }))
      .filter(x => x.d < 40).sort((a, b) => a.r - b.r || a.d - b.d);
  }
  function closures(o) {
    const inc = (window.Live && Live.st.traffic.incidents) || [];
    return inc.filter(n => /clos/i.test(n.title + ' ' + (n.desc || ''))).map(n => ({ ...n, d: n.lat ? km(o.ll, n) : 99 })).sort((a, b) => a.d - b.d);
  }
  function alerts() { return ((window.Live && Live.st.alerts) || []).filter(a => a.event); }
  function clockNow() { const c = window.Locals && Locals.S.flow && Locals.S.flow.clock; return c && c.sg && c.sg[0] ? c : null; }
  function chipText() {
    const o = origin(), sl = slowdowns(o), cl = closures(o), al = alerts(), c = clockNow();
    const bits = [];
    if (al.length) bits.push(['warn', `${al[0].event}`]);
    if (sl.length) { const w = sl[0]; bits.push([w.closed ? 'bad' : w.r < 0.5 ? 'bad' : 'mid', w.closed ? `${w.name} closed` : `Slow: ${w.name.replace(/^Parkway, /, 'Parkway ')}`]); }
    else if (c) bits.push([c.sg[0].delay >= 5 ? 'mid' : 'ok', `Parkway ${c.sg[0].min} min`]);
    else if (flowItems().length) bits.push(['ok', 'Roads moving']);
    if (cl.length) bits.push(['mid', `${cl.length} closure${cl.length > 1 ? 's' : ''}`]);
    const fam = Fam.visible().length; if (fam) bits.push(['fam', `${fam} family`]);
    return bits.slice(0, 2);
  }
  function chipEl() {
    const b = document.createElement('button'); b.id = 'mmBrief'; b.className = 'panel'; b.setAttribute('aria-label', 'Map briefing: what matters around you');
    b.innerHTML = `${ICON.brief}<span class="t"><b>Briefing</b><span class="s">Loading…</span></span>`;
    b.onclick = () => { press(b); Brief.open ? closeSheet() : openSheet(); };
    document.body.appendChild(b);
  }
  Brief.chip = function () {
    const b = $('#mmBrief'); if (!b) return;
    const bits = chipText();
    const s = bits.length ? bits.map(([k, t]) => `<i class="d ${k}"></i>${esc(t)}`).join('<em>·</em>') : 'All quiet around you';
    const el = b.querySelector('.s'); if (el.innerHTML !== s) { el.innerHTML = s; b.classList.remove('mm-new'); void b.offsetWidth; b.classList.add('mm-new'); }
    b.classList.toggle('alert', bits.some(x => x[0] === 'warn' || x[0] === 'bad'));
  };

  function sheetEl() {
    let s = $('#mmSheet'); if (s) return s;
    s = document.createElement('section'); s.id = 'mmSheet'; s.className = 'panel'; s.hidden = true; s.setAttribute('aria-label', 'Map briefing');
    s.innerHTML = '<div class="grab" aria-hidden="true"></div><div class="body"></div>';
    document.body.appendChild(s);
    // drag the handle down to put it away (follow-through: it keeps the speed you gave it)
    let y0 = null, dy = 0, t0 = 0;
    const grab = s.querySelector('.grab');
    const down = e => { y0 = e.clientY; dy = 0; t0 = performance.now(); s.style.transition = 'none'; grab.setPointerCapture(e.pointerId); };
    const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); s.style.transform = `translateY(${dy}px)`; };
    const up = () => { if (y0 == null) return; const v = dy / Math.max(1, performance.now() - t0); y0 = null; s.style.transition = ''; s.style.transform = ''; if (dy > 110 || v > 0.6) closeSheet(); };
    grab.addEventListener('pointerdown', down); grab.addEventListener('pointermove', move); grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
    s.addEventListener('click', onSheetClick);
    return s;
  }
  function openSheet() {
    if (window.UX && UX.closeSheet) UX.closeSheet();
    const s = sheetEl(); Brief.open = true; Fam.asking = null; s.classList.add('anim'); render(); s.hidden = false; document.body.classList.add('mm-open');
    clearTimeout(s._a); s._a = setTimeout(() => s.classList.remove('anim'), 900); // rows cascade in once, not on every refresh
    requestAnimationFrame(() => s.classList.add('in'));
    Fam.poll();
  }
  function closeSheet() {
    const s = $('#mmSheet'); if (!s || !Brief.open) return; Brief.open = false; document.body.classList.remove('mm-open');
    s.classList.remove('in'); setTimeout(() => { if (!Brief.open) s.hidden = true; }, 320);
  }
  const row = (attrs, ic, title, sub, right = '', cls = '') => `<button class="mmrow ${cls}" ${attrs}><span class="ic">${ic}</span><span class="tx"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right}</button>`;
  function render() {
    const s = $('#mmSheet'); if (!s || !Brief.open) return;
    const o = origin(), now = new Date(), sl = slowdowns(o), cl = closures(o), al = alerts(), c = clockNow();
    const trafficOn = !!(window.Live && Live.st.on.traffic);
    let h = `<header class="mmh"><div><small>${esc(now.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' }))} · ${esc(clock(now))}</small><b>Around ${o.live ? 'you' : esc(o.n)} right now</b></div><button class="mmx" data-x aria-label="Close">✕</button></header>`;
    // warnings first: they matter most
    if (al.length) h += `<div class="mmsec warn">${al.slice(0, 2).map(a => row('data-tab="today"', '⚠️', esc(a.event), esc((a.headline || '').replace(/ issued .*? by NWS.*$/i, '').slice(0, 110)), '', 'warn')).join('')}</div>`;
    // drive times
    h += `<div class="mmk">Drive times with traffic ${o.live ? 'from you' : 'from ' + esc(o.n)}</div><div class="mmdest">${DEST.filter(d => km(o.ll, d.ll) > 2).slice(0, 5).map(d => { const r = Brief.routes[d.k + '|' + key(o.ll)]; const fresh = r && Date.now() - r.t < 10 * 60e3; return `<button data-dest="${d.k}" class="${fresh ? (r.delay >= 10 ? 'bad' : r.delay >= 4 ? 'mid' : 'ok') : ''} ${Brief.route === d.k ? 'on' : ''}"><b>${fresh ? r.min + '<small>min</small>' : '›'}</b><span>${esc(d.n)}</span>${fresh ? `<em>${r.delay > 0 ? '+' + r.delay + ' min traffic' : 'no delays'}</em>` : '<em>tap for time</em>'}</button>`; }).join('')}</div>`;
    if (c) h += row('data-clock', '🕒', `Parkway: ${c.sg[0].min} min Sevierville → Gatlinburg`, c.sg[0].delay > 0 ? `+${c.sg[0].delay} min of traffic right now` : 'No delays right now', '<span class="go">›</span>');
    // slowdowns
    h += `<div class="mmk">Traffic near ${o.live ? 'you' : esc(o.n)}</div><div class="mmsec">`;
    h += sl.length ? sl.slice(0, 4).map(x => row(`data-fly="${x.lng},${x.lat}" data-traffic`, `<i class="spd ${x.closed ? 'x' : x.r < 0.5 ? 'r' : 'y'}">${x.closed ? '✕' : Math.round(x.cur)}</i>`, esc(x.name), x.closed ? 'Closed' : `${Math.round(x.cur)} mph, usually ${Math.round(x.free)}${x.delay ? ` · about ${x.delay} min slower` : ''} · ${miles(x.d)} away`, '<span class="go">›</span>')).join('')
      : row('data-traffic', '<i class="spd g">✓</i>', flowItems().length ? 'Roads near you are moving' : 'Road speeds are loading', flowItems().length ? 'No slowdowns on the main roads' : 'Live speeds come from TomTom every 15 minutes');
    h += `</div><button class="mmtoggle" data-traffic-toggle aria-pressed="${trafficOn}"><span>Show live traffic colors on the map</span><i class="sw"></i></button>`;
    // closures
    if (cl.length) h += `<div class="mmk">Closures and road reports</div><div class="mmsec">${cl.slice(0, 4).map(n => row(n.lat ? `data-fly="${n.lng},${n.lat}"` : '', '🚧', esc(n.title).slice(0, 90), esc(n.source || '') + (n.d < 99 ? ` · ${miles(n.d)} away` : ''), n.lat ? '<span class="go">›</span>' : '')).join('')}</div>`;
    // family
    h += Fam.section();
    h += `<p class="mmfine">Speeds and drive times from TomTom, closures from the park, TDOT and NCDOT, warnings from the National Weather Service.</p>`;
    s.querySelector('.body').innerHTML = h;
  }
  const key = ll => ll.lng.toFixed(2) + ',' + ll.lat.toFixed(2);
  async function driveTo(k) {
    const d = DEST.find(x => x.k === k); if (!d) return;
    const o = origin(), id = k + '|' + key(o.ll), have = Brief.routes[id];
    Brief.route = k;
    if (have && Date.now() - have.t < 10 * 60e3 && have.geo) { showRoute(have, d); render(); return; }
    const TT = window.Live && Live.liveTraffic && Live.liveTraffic() && Live.ttKey && Live.ttKey();
    if (!TT) { toast('Drive times need live traffic'); return; }
    const btn = $(`[data-dest="${k}"]`); if (btn) btn.classList.add('busy');
    try {
      const u = `https://api.tomtom.com/routing/1/calculateRoute/${o.ll.lat.toFixed(5)},${o.ll.lng.toFixed(5)}:${d.ll.lat},${d.ll.lng}/json?key=${TT}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all`;
      const r = await fetch(u).then(x => { if (!x.ok) throw new Error(x.status); return x.json(); });
      const sm = r.routes[0].summary, pts = r.routes[0].legs.flatMap(l => l.points.map(p => [p.longitude, p.latitude]));
      const step = Math.max(1, Math.floor(pts.length / 300)), geo = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      const out = { t: Date.now(), min: Math.round(sm.travelTimeInSeconds / 60), delay: Math.round((sm.trafficDelayInSeconds || 0) / 60), miles: +(sm.lengthInMeters / 1609).toFixed(1), geo };
      Brief.routes[id] = out;
      const slim = {}; Object.entries(Brief.routes).forEach(([kk, v]) => { if (Date.now() - v.t < 10 * 60e3) slim[kk] = { ...v, geo: null }; }); store.set('routes', slim);
      showRoute(out, d);
    } catch (e) { toast('Could not get a drive time right now'); Brief.route = null; }
    render();
  }
  function showRoute(r, d) {
    if (!r.geo) return;
    const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: r.geo }, properties: {} };
    const src = map.getSource('mm-route');
    if (src) src.setData(data);
    else {
      map.addSource('mm-route', { type: 'geojson', data });
      const before = map.getLayer('lbl-water') ? 'lbl-water' : undefined;
      map.addLayer({ id: 'mm-route-case', type: 'line', source: 'mm-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b2a48', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6, 15, 13], 'line-opacity': 0.85 } }, before);
      map.addLayer({ id: 'mm-route', type: 'line', source: 'mm-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4aa3ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 15, 8], 'line-opacity': 1 } }, before);
    }
    const color = r.delay >= 10 ? '#ff6a4d' : r.delay >= 4 ? '#ffb340' : '#4aa3ff';
    map.setPaintProperty('mm-route', 'line-color', color);
    const b = r.geo.reduce((bb, p) => [[Math.min(bb[0][0], p[0]), Math.min(bb[0][1], p[1])], [Math.max(bb[1][0], p[0]), Math.max(bb[1][1], p[1])]], [[180, 90], [-180, -90]]);
    const sheetH = Brief.open && $('#mmSheet') ? $('#mmSheet').getBoundingClientRect().height : 0;
    map.fitBounds(b, { padding: { top: 190, bottom: Math.min(innerHeight * 0.55, Math.max(160, sheetH + 30)), left: 50, right: 50 }, pitch: 40, duration: reduce ? 0 : 1600, easing: easeInOut, maxZoom: 14.5 });
    toast(`${r.min} min to ${d.n} (${r.miles} mi)${r.delay > 0 ? `, ${r.delay} min of that is traffic` : ', no traffic delays'}`);
    showClear();
  }
  function clearRoute() { ['mm-route', 'mm-route-case'].forEach(l => map.getLayer(l) && map.removeLayer(l)); if (map.getSource('mm-route')) map.removeSource('mm-route'); Brief.route = null; const c = $('#mmClear'); if (c) c.remove(); render(); }
  function showClear() {
    if ($('#mmClear')) return;
    const b = document.createElement('button'); b.id = 'mmClear'; b.className = 'panel'; b.textContent = '✕ Clear route';
    b.onclick = () => { press(b); clearRoute(); };
    document.body.appendChild(b);
  }
  function flyTo(lng, lat, z = 14.2) {
    if (window.__smokies.stopOrbit) __smokies.stopOrbit();
    Me.follow = false; setState();
    const sheetH = Brief.open && $('#mmSheet') ? $('#mmSheet').getBoundingClientRect().height : 0;
    map.flyTo({ center: [lng, lat], zoom: z, pitch: 52, duration: reduce ? 0 : 1800, curve: 1.42, easing: easeInOut, essential: true, padding: { top: 0, bottom: Math.min(innerHeight * 0.5, sheetH * 0.7), left: 0, right: 0 } });
  }
  function onSheetClick(e) {
    const t = e.target.closest('button'); if (!t) return;
    press(t);
    if (t.hasAttribute('data-x')) return closeSheet();
    if (t.dataset.dest) return driveTo(t.dataset.dest);
    if (t.hasAttribute('data-traffic-toggle')) { const on = !(Live.st.on.traffic); if (window.UX && UX.setLayer) UX.setLayer('traffic', on); else Live.setOn('traffic', on); t.setAttribute('aria-pressed', on); return; }
    if (t.dataset.fly) { const [lng, lat] = t.dataset.fly.split(',').map(Number); if (t.hasAttribute('data-traffic') && !Live.st.on.traffic) { if (window.UX && UX.setLayer) UX.setLayer('traffic', true); else Live.setOn('traffic', true); } return flyTo(lng, lat); }
    if (t.hasAttribute('data-clock')) { closeSheet(); return window.Social && Social.setView('today'); }
    if (t.dataset.tab) { closeSheet(); return window.Social && Social.setView(t.dataset.tab); }
    Fam.click(t);
  }

  /* =====================================================================
     3. FAMILY ON THE MAP
     ===================================================================== */
  const DUR = [['1h', 'For 1 hour', () => 3600e3], ['night', 'Until midnight', () => { const n = new Date(); const s = new Date(n.toLocaleString('en-US', { timeZone: TZ })); const left = (24 * 60 - (s.getHours() * 60 + s.getMinutes())) * 60e3; return Math.max(30 * 60e3, left); }], ['day', 'For 24 hours', () => 864e5], ['week', 'For a week', () => 7 * 864e5 - 60e3]];
  const Fam = { rows: [], off: false, mine: store.get('share', {}), markers: {}, last: 0, sent: null, timer: 0 };
  const C = () => window.Social && Social.Cloud;
  const signed = () => !!(C() && C().on && C().user);
  const groups = () => (window.Social && Social.S.groups) || [];
  const myId = () => C() && C().user && C().user.id;
  Fam.sharing = () => Object.entries(Fam.mine).filter(([gid, until]) => until > Date.now() && groups().some(g => g.id === gid));
  Fam.visible = () => Fam.rows.filter(r => r.user_id !== myId() && new Date(r.until) > Date.now());
  function memberOf(gid, uid) { const m = ((window.Social && Social.S.members) || {})[gid] || []; return m.find(x => x.id === uid) || { name: 'Family member', i: '?', c: '#5b7f6a' }; }
  Fam.poll = async function () {
    if (!signed() || Fam.off || !groups().length) { Fam.rows = []; drawFam(); return; }
    const { data, error } = await C().sb.from('member_locations').select('group_id,user_id,lng,lat,accuracy,heading,speed,until,updated_at').in('group_id', groups().map(g => g.id));
    if (error) { if (/member_locations|relation|schema cache|does not exist/i.test(error.message || '')) Fam.off = true; Fam.rows = []; }
    else {
      Fam.rows = data || [];
      // what the server says I share is the truth (another phone may have stopped it)
      const mine = {}; Fam.rows.filter(r => r.user_id === myId()).forEach(r => mine[r.group_id] = new Date(r.until).getTime());
      if (JSON.stringify(Object.keys(mine).sort()) !== JSON.stringify(Object.keys(Fam.mine).filter(k => Fam.mine[k] > Date.now()).sort())) { Fam.mine = mine; store.set('share', mine); }
    }
    Fam.last = Date.now(); drawFam(); banner(); Brief.chip(); if (Brief.open) render();
  };
  function drawFam() {
    if (!map) return;
    const seen = new Set();
    // one dot per person: if someone shares with two of your groups, show them once
    const byUser = {}; Fam.visible().forEach(r => { if (!byUser[r.user_id] || new Date(r.updated_at) > new Date(byUser[r.user_id].updated_at)) byUser[r.user_id] = r; });
    Object.values(byUser).forEach(r => {
      const id = r.user_id; seen.add(id);
      const who = memberOf(r.group_id, id), g = groups().find(x => x.id === r.group_id) || {};
      const stale = Date.now() - new Date(r.updated_at) > 15 * 60e3;
      let mk = Fam.markers[id];
      if (!mk) {
        const el = document.createElement('button'); el.className = 'mm-fam'; el.setAttribute('aria-label', who.name);
        el.onclick = e => { e.stopPropagation(); const rr = byUser[id] || r; toast(`${memberOf(rr.group_id, id).name} · ${ago(rr.updated_at)}${Me.pos ? ' · ' + miles(km(Me.pos, rr)) + ' from you' : ''}`); };
        mk = Fam.markers[id] = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lng, r.lat]).addTo(map);
        mk._ll = { lng: r.lng, lat: r.lat };
        requestAnimationFrame(() => el.classList.add('in'));
      } else if (mk._ll.lng !== r.lng || mk._ll.lat !== r.lat) { if (!reduce) glide(mk, mk._ll, r, 1200); else mk.setLngLat([r.lng, r.lat]); mk._ll = { lng: r.lng, lat: r.lat }; }
      const el = mk.getElement();
      el.style.setProperty('--c', g.color || who.c || '#3f8f4f');
      el.classList.toggle('stale', stale);
      const face = who.photo ? `<img src="${esc(who.photo)}" alt="">` : `<span>${esc(who.i || '?')}</span>`;
      const html = `<i class="face">${face}</i><b>${esc((who.name || '').split(' ')[0])}</b><small>${esc(ago(r.updated_at))}</small>`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    });
    Object.keys(Fam.markers).forEach(id => { if (!seen.has(id)) { const mk = Fam.markers[id]; mk.getElement().classList.add('out'); setTimeout(() => mk.remove(), 300); delete Fam.markers[id]; } });
  }
  Fam.section = function () {
    let h = `<div class="mmk">Family on the map</div><div class="mmsec fam">`;
    if (!C() || !C().on) return h + `<p class="mmnote">Family locations need the app's sign-in, which is not available right now.</p></div>`;
    if (!signed()) return h + row('data-signin', '👋', 'Sign in to see your family here', 'Then join or start a private family group') + '</div>';
    if (!groups().length) return h + row('data-newgroup', '🏡', 'Start a family group', 'Only people you invite can ever see each other') + '</div>';
    if (Fam.asking && groups().some(g => g.id === Fam.asking)) return h + askHTML(Fam.asking) + '</div>';
    if (Fam.off) return h + `<p class="mmnote">Family locations switch on after one database update (the same paste as videos and messages).</p></div>`;
    const vis = Fam.visible();
    h += vis.length ? vis.map(r => { const w = memberOf(r.group_id, r.user_id), g = groups().find(x => x.id === r.group_id) || {}; return row(`data-fly="${r.lng},${r.lat}"`, `<i class="av" style="--c:${esc(g.color || w.c)}">${w.photo ? `<img src="${esc(w.photo)}" alt="">` : esc(w.i)}</i>`, esc(w.name), `${esc(g.emoji || '')} ${esc(g.name || '')} · ${esc(ago(r.updated_at))}${Me.pos ? ' · ' + miles(km(Me.pos, r)) + ' away' : ''}`, '<span class="go">›</span>'); }).join('')
      : `<p class="mmnote">Nobody in your groups is sharing right now. People show up here only after they switch it on.</p>`;
    h += `<div class="mmk sm">Share where you are</div>`;
    h += groups().map(g => { const until = Fam.mine[g.id]; const on = until > Date.now(); return `<button class="mmtoggle grp" data-share="${esc(g.id)}" aria-pressed="${on}" style="--c:${esc(g.color)}"><span><b>${esc(g.emoji)} ${esc(g.name)}</b><small>${on ? `Sharing until ${esc(clock(until))}${until - Date.now() > 864e5 ? ' ' + esc(new Date(until).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })) : ''}` : 'Off. Only this group would see you.'}</small></span><i class="sw"></i></button>`; }).join('');
    if (Fam.sharing().length) h += `<button class="mmstop" data-stopall>Stop sharing everywhere</button>`;
    h += `<p class="mmfine">Your spot updates while Smokies Live is open on your phone. It is never shown to anyone outside the group, and it is deleted when you stop.</p>`;
    return h + '</div>';
  };
  Fam.click = function (t) {
    if (t.hasAttribute('data-signin')) { closeSheet(); return Social.setView('profile'); }
    if (t.hasAttribute('data-newgroup')) { closeSheet(); Social.setView('feed'); setTimeout(() => { const b = document.querySelector('[data-scope="new"]'); if (b) b.click(); }, 400); return; }
    if (t.dataset.share) { const gid = t.dataset.share; if (Fam.mine[gid] > Date.now()) stopShare(gid); else askDuration(gid); return; }
    if (t.hasAttribute('data-stopall')) return stopAll();
    if (t.dataset.dur) { Fam.asking = null; return startShare(t.dataset.gid, t.dataset.dur); }
    if (t.hasAttribute('data-durx')) { Fam.asking = null; return render(); }
  };
  function askHTML(gid) {
    const g = groups().find(x => x.id === gid); if (!g) return '';
    return `<div class="mmask"><b>Share your location with ${esc(g.emoji)} ${esc(g.name)}?</b><small>Only people in this group will see your dot. You can stop any time.</small>
      <div class="mmdur">${DUR.map(([k, n]) => `<button data-dur="${k}" data-gid="${esc(gid)}">${esc(n)}</button>`).join('')}</div><button class="mmlink" data-durx>Not now</button></div>`;
  }
  function askDuration(gid) { Fam.asking = gid; const box = $('#mmSheet .fam'); if (box) box.innerHTML = askHTML(gid); }
  async function startShare(gid, dk) {
    const d = DUR.find(x => x[0] === dk); const until = Date.now() + d[2]();
    if (!Me.watch) startLocate(false);
    const ok = await waitFix(15000); if (!ok) { toast('We need your location to share it. Check that location is on.'); render(); return; }
    const P = Me.pos;
    const { error } = await C().sb.from('member_locations').upsert({ group_id: gid, user_id: myId(), lng: +P.lng.toFixed(6), lat: +P.lat.toFixed(6), accuracy: Math.round(P.acc || 0), heading: validHeading(P.heading), speed: P.speed > 0 ? P.speed : null, until: new Date(until).toISOString() });
    if (error) { toast(/relation|schema/i.test(error.message) ? 'Family locations need the database update first' : 'Could not start sharing'); if (/relation|schema/i.test(error.message)) Fam.off = true; render(); return; }
    Fam.mine[gid] = until; store.set('share', Fam.mine); Fam.sent = { ...P, t: Date.now() };
    const g = groups().find(x => x.id === gid); toast(`Sharing with ${g ? g.name : 'your group'} until ${clock(until)}`);
    await Fam.poll(); render();
  }
  const validHeading = h => h != null && !isNaN(h) && h >= 0 && h < 360 ? Math.round(h) : null;
  function waitFix(ms) { return new Promise(res => { if (Me.pos && Date.now() - Me.pos.t < 120e3) return res(true); const t0 = Date.now(); const iv = setInterval(() => { if (Me.pos) { clearInterval(iv); res(true); } else if (Date.now() - t0 > ms) { clearInterval(iv); res(false); } }, 300); }); }
  async function stopShare(gid) {
    delete Fam.mine[gid]; store.set('share', Fam.mine); render(); banner();
    const { error } = await C().sb.from('member_locations').delete().eq('group_id', gid).eq('user_id', myId());
    if (error) toast('Could not reach the server. Try again in a moment.'); else toast('Stopped sharing your location');
    Fam.poll();
  }
  async function stopAll() {
    Fam.mine = {}; store.set('share', {}); render(); banner();
    const { error } = await C().sb.rpc('stop_sharing_all');
    if (error) await C().sb.from('member_locations').delete().eq('user_id', myId());
    toast('Stopped sharing your location everywhere'); Fam.poll();
  }
  Fam.myMove = async function () { // send my new spot to the groups I share with, gently (every 25 m or 2 minutes)
    const P = Me.pos, live = Fam.sharing(); if (!P || !live.length || !signed() || Fam.off || Fam.busy) return;
    const S0 = Fam.sent; if (S0 && km(S0, P) < 0.025 && Date.now() - S0.t < 120e3) return;
    if (S0 && Date.now() - S0.t < 15e3) return;
    Fam.busy = true;
    try {
      const rows = live.map(([gid, until]) => ({ group_id: gid, user_id: myId(), lng: +P.lng.toFixed(6), lat: +P.lat.toFixed(6), accuracy: Math.round(P.acc || 0), heading: validHeading(P.heading), speed: P.speed > 0 ? P.speed : null, until: new Date(until).toISOString() }));
      const { error } = await C().sb.from('member_locations').upsert(rows);
      if (!error) Fam.sent = { ...P, t: Date.now() };
    } finally { Fam.busy = false; }
  };
  function banner() { // while you share, a small strip says so, with a one-tap stop
    const live = Fam.sharing(); let b = $('#mmShare');
    if (!live.length) { if (b) { b.classList.add('out'); setTimeout(() => b && b.remove(), 260); } return; }
    if (!b) { b = document.createElement('button'); b.id = 'mmShare'; b.className = 'panel'; document.body.appendChild(b); b.onclick = () => { press(b); openSheet(); setTimeout(() => { const f = $('#mmSheet .fam'); if (f) f.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }, 350); }; }
    const names = live.map(([gid]) => (groups().find(g => g.id === gid) || {}).name).filter(Boolean);
    b.innerHTML = `<i class="live"></i><span>Sharing with ${esc(names.slice(0, 2).join(' & '))}${names.length > 2 ? ` +${names.length - 2}` : ''}</span><b>Manage</b>`;
    if (Brief.place) Brief.place();
  }

  /* =====================================================================
     4. SMOOTHER FEEL ON PHONES
     ===================================================================== */
  function feel() {
    // a drag that keeps gliding and settles softly (follow-through), instead of stopping dead
    try { map.dragPan.enable({ linearity: 0.25, easing: t => 1 - Math.pow(1 - t, 2.4), maxSpeed: 1800, deceleration: 1900 }); } catch (e) { }
    // touching the map hands control back to the person right away
    map.on('dragstart', () => { if (Me.follow) { Me.follow = false; setState(); } });
    // road-speed tags crowd each other when zoomed out: show them from town level in
    const flowVis = () => { const z = map.getZoom(), show = z >= 11.2; if (show !== flowVis.on) { flowVis.on = show; document.body.classList.toggle('mm-far', !show); } };
    map.on('zoomend', flowVis); flowVis();
    // and when two tags would overlap, the slower road keeps its spot
    const tidy = () => {
      const els = [...document.querySelectorAll('.lflow-m')]; if (!els.length) return;
      const box = els.map(el => { el.classList.remove('mm-hide'); const r = el.getBoundingClientRect(); const v = +(el.querySelector('b') || {}).textContent || 0; return { el, r, v: el.querySelector('.x') ? -1 : el.querySelector('.r') ? 0 : el.querySelector('.y') ? 1 : 2 }; }).sort((a, b) => a.v - b.v);
      const kept = [];
      box.forEach(b => { const hit = kept.some(k => !(b.r.right < k.left - 4 || b.r.left > k.right + 4 || b.r.bottom < k.top - 2 || b.r.top > k.bottom + 2)); if (hit) b.el.classList.add('mm-hide'); else kept.push(b.r); });
    };
    map.on('moveend', () => requestAnimationFrame(tidy)); setTimeout(tidy, 3000); setInterval(() => { if (onMap() && !map.isMoving()) tidy(); }, 15e3);
    // the briefing chip tucks right under the weather chip, whatever its height
    const place = () => { const l = $('#live'), b = $('#mmBrief'), sh = $('#mmShare'); if (!l || !b || innerWidth > 760) return; const r = l.getBoundingClientRect(); if (!r.height) return; b.style.top = Math.round(r.bottom + 8) + 'px'; if (sh) sh.style.top = Math.round(r.bottom + 8 + b.offsetHeight + 8) + 'px'; };
    place(); addEventListener('resize', place); setInterval(place, 2000); Brief.place = place;
  }

  /* ---------- speed meter: open the site with #perf to see real frame rates on a phone ---------- */
  function perfMeter() {
    if (!/perf/.test(location.hash) && !store.get('perf', false)) return;
    store.set('perf', !/noperf/.test(location.hash));
    if (/noperf/.test(location.hash)) return;
    let gpu = '?'; try { const gl = map.painter.context.gl, ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { }
    const el = document.createElement('div'); el.id = 'mmPerf'; document.body.appendChild(el);
    let frames = [], last = performance.now(), renders = 0; map.on('render', () => renders++);
    const tick = now => { frames.push(now - last); last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    setInterval(() => {
      const f = frames.splice(0), fps = f.length, worst = f.length ? Math.max(...f) : 0, slow = f.filter(x => x > 34).length;
      el.textContent = `${fps} fps · worst ${Math.round(worst)} ms · ${slow} slow · map ${renders}/s · ${map.getPixelRatio().toFixed(2)}x of ${(devicePixelRatio || 1).toFixed(2)}x · ${gpu}`; renders = 0;
    }, 1000);
  }

  /* ---------- start ---------- */
  function build() {
    map = window.__smokies.map;
    document.body.classList.add('mm');
    locBtn(); chipEl(); feel(); perfMeter();
    // came back with location already allowed: show the dot quietly, no fly-in
    if (store.get('on', false) && navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') startLocate(false, true); }).catch(() => { });
    Brief.chip(); setInterval(() => { Brief.chip(); if (Brief.open) render(); }, 30e3);
    setTimeout(Brief.chip, 4000); setTimeout(Brief.chip, 12000);
    // family dots: check every 20 seconds while the map is on screen, and once a minute otherwise
    const tick = () => { const due = onMap() ? 20e3 : 60e3; if (Date.now() - Fam.last >= due) Fam.poll(); };
    setInterval(tick, 5000); setTimeout(() => Fam.poll(), 3000);
    setInterval(() => { if (Fam.sharing().length && Me.pos) Fam.myMove(); banner(); }, 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { Fam.poll(); if (store.get('on', false) && !Me.watch && !Me.denied) startLocate(false, true); } });
    new MutationObserver(() => { if (document.body.dataset.view !== 'map') closeSheet(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
    banner();
  }
  function ready() { return window.__smokies && window.__smokies.map && (window.__smokies.map._loaded || window.__smokies.map.loaded()) && window.Live && window.Social && Social.S && document.getElementById('tabbar') && window.maplibregl; }
  const wait = setInterval(() => { if (ready()) { clearInterval(wait); try { build(); } catch (e) { console.error('[me]', e); } } }, 400);

  return { Me, Brief, Fam, startLocate, stopLocate, centerOnMe, openSheet, closeSheet, driveTo, clearRoute };
})();
window.MapMe = MapMe;
