/* =====================================================================
   LIVE: weather, 3D clouds, radar, alerts, rivers, roads, cameras,
   news and events. Browser-friendly APIs are called directly; the rest
   come from the repo's feeds branch, refreshed every 10 minutes by a
   GitHub Action. Everything degrades quietly when a source is down.
   ===================================================================== */
const Live = (() => {
  const FEEDS = 'https://raw.githubusercontent.com/Isaacalmighty/smokies-live/feeds/live/';
  const SITE = 'https://isaacalmighty.github.io/smokies-live/';
  // TomTom key for real traffic speeds (free plan; a browser key, like a map key). Empty = modeled traffic.
  const TOMTOM = 'j81wnoR8SajwacDSKgn20e1SNEzZzf1r';
  const HOME_DEF = { n: 'Gatlinburg', lat: 35.714, lng: -83.512 };
  let home = (() => { try { const h = JSON.parse(localStorage.getItem('sl-home')); return h && h.lat ? h : HOME_DEF; } catch (e) { return HOME_DEF; } })();
  const st = { blocked: false, wx: null, grid: null, alerts: [], news: [], events: [], traffic: { incidents: [], cameras: [] }, gauges: [], fires: [], radar: null, iss: null, tab: 'now', markers: {}, on: { clouds: true, radar: false, traffic: false, cams: false, news: false, rivers: false }, updated: {} };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 0) return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }); if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' hr ago'; return Math.round(s / 86400) + ' d ago'; };
  async function jget(url, ms = 15000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal, cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const feed = name => jget(FEEDS + name + '?t=' + Math.floor(Date.now() / 120000));

  /* ---------- weather words and icons ---------- */
  const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms', 96: 'Storms with hail', 99: 'Storms with hail' };
  function icon(code, day) {
    const sun = '<circle cx="15" cy="15" r="5.5" fill="#ffc861"/><g stroke="#ffc861" stroke-width="2" stroke-linecap="round"><path d="M15 3v3M15 24v3M3 15h3M24 15h3M6.5 6.5l2 2M21.5 21.5l2 2M6.5 23.5l2-2M21.5 8.5l2-2"/></g>';
    const moon = '<path d="M19 5a10 10 0 1 0 6 15A8 8 0 0 1 19 5z" fill="#dfe6f5"/>';
    const cloud = (y = 0, c = '#dfe6ee') => `<path d="M8 ${22 + y}h14a5 5 0 0 0 0-10 7 7 0 0 0-13-1A5 5 0 0 0 8 ${22 + y}z" fill="${c}"/>`;
    const rain = '<g stroke="#6fb6ff" stroke-width="2" stroke-linecap="round"><path d="M10 25l-1 3M15 25l-1 3M20 25l-1 3"/></g>';
    const snow = '<g fill="#fff"><circle cx="10" cy="27" r="1.4"/><circle cx="15" cy="28" r="1.4"/><circle cx="20" cy="27" r="1.4"/></g>';
    const bolt = '<path d="M16 21l-3 5h3l-2 4 5-6h-3l2-3z" fill="#ffd34d"/>';
    const fog = '<g stroke="#cfd8e0" stroke-width="2" stroke-linecap="round"><path d="M5 12h20M7 17h18M5 22h16"/></g>';
    let b = '';
    if (code <= 1) b = day ? sun : moon;
    else if (code === 2) b = (day ? '<g transform="translate(4 -3) scale(.8)">' + sun + '</g>' : '<g transform="translate(5 -3) scale(.75)">' + moon + '</g>') + cloud(2);
    else if (code === 3) b = cloud(0, '#aab4bf') + cloud(3);
    else if (code === 45 || code === 48) b = fog;
    else if (code >= 95) b = cloud(-3, '#8d97a3') + bolt;
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) b = cloud(-3) + snow;
    else b = cloud(-3, '#b7c1cc') + rain;
    return `<svg viewBox="0 0 30 30" id="wxIcon" aria-hidden="true">${b}</svg>`;
  }
  const compass = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8];

  /* ---------- markup ---------- */
  function buildUI() {
    const sec = document.createElement('section'); sec.id = 'live'; sec.className = 'panel'; sec.setAttribute('aria-label', 'Live conditions');
    sec.innerHTML = `<button id="liveChip" aria-expanded="false">${icon(2, true)}<b id="wxTemp">--°</b><span id="wxDesc">Connecting to live data…</span><i class="chev"></i></button>
      <div id="alertBar" role="alert"></div>
      <div id="liveBody"><div>
        <nav class="ltabs" role="tablist">${[['now', 'Now'], ['news', 'News'], ['events', 'Events'], ['roads', 'Roads'], ['cams', 'Cams'], ['rivers', 'Rivers']].map(([k, v]) => `<button role="tab" data-t="${k}" aria-selected="${k === 'now'}">${v}<span class="n" hidden></span></button>`).join('')}</nav>
        <div id="lview"></div>
      </div></div>`;
    document.body.appendChild(sec);
    const card = document.createElement('div'); card.id = 'lcard'; card.className = 'panel'; card.hidden = true; document.body.appendChild(card);
    $('#liveChip').onclick = () => setOpen(!sec.classList.contains('open'));
    sec.querySelectorAll('.ltabs button').forEach(b => b.onclick = () => { st.tab = b.dataset.t; st.filter = null; sec.querySelectorAll('.ltabs button').forEach(x => x.setAttribute('aria-selected', x === b)); render(); });
    $('#alertBar').onclick = () => { setOpen(true); st.tab = 'now'; render(); };
    // live layer toggles in the rail
    const grp = document.createElement('div'); grp.className = 'group';
    grp.innerHTML = '<div class="eyebrow">Live</div>' + [['clouds', '3D clouds'], ['radar', 'Rain radar'], ['traffic', 'Traffic'], ['cams', 'Cameras'], ['news', 'News &amp; events'], ['rivers', 'Rivers &amp; fires']].map(([k, v]) => `<button class="toggle" data-live="${k}" aria-pressed="${st.on[k]}"><span class="k">${v}</span><span class="sw"></span></button>`).join('');
    $('#rail').insertBefore(grp, $('#rail').children[1]);
    grp.querySelectorAll('.toggle').forEach(b => b.onclick = () => { const k = b.dataset.live; if (k === 'radar') st.radarTouched = true; const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); st.on[k] = on; applyToggles(k); });
    // phones get a Live button in the bottom bar
    const mb = document.createElement('button'); mb.id = 'm-live'; mb.setAttribute('aria-pressed', 'false'); mb.textContent = 'Live';
    $('#mobileBar').prepend(mb);
    mb.onclick = () => { closeMobile(); setOpen(!sec.classList.contains('open')); };
  }
  function setOpen(on) {
    $('#live').classList.toggle('open', on); $('#liveChip').setAttribute('aria-expanded', on);
    document.body.classList.toggle('live-open', on);
    const mb = $('#m-live'); if (mb) mb.setAttribute('aria-pressed', on);
    if (on) render();
  }

  /* ---------- the panel ---------- */
  function counts() {
    const n = { news: st.news.length, events: st.events.length, roads: st.traffic.incidents.length, cams: st.traffic.cameras.length, rivers: st.gauges.length };
    document.querySelectorAll('.ltabs button').forEach(b => { const c = n[b.dataset.t]; const s = b.querySelector('.n'); if (c) { s.hidden = false; s.textContent = c; } else s.hidden = true; });
  }
  function item(o, i) {
    const img = o.img ? `<img class="th" loading="lazy" src="${esc(o.img)}" alt="" onerror="this.remove()">` : '';
    return `<div class="li" style="animation-delay:${Math.min(i, 12) * 40}ms" data-k="${o.k}" data-i="${o.i}">${img}<div class="tx"><h4>${esc(o.title)}</h4>${o.sum ? `<p>${esc(o.sum)}</p>` : ''}<div class="mt">${o.meta || ''}${o.place ? `<span class="pin-chip">${esc(o.place)}</span>` : ''}</div></div></div>`;
  }
  function render() {
    const v = $('#lview'); if (!v || !$('#live').classList.contains('open')) return;
    counts();
    let h = '';
    const blockedNote = `<div class="lempty">This preview runs in a sandbox that blocks outside data. Open the full site for live weather, radar, news, events, traffic, cameras and rivers:<br><a href="${SITE}" target="_blank" rel="noopener">${SITE.replace('https://', '')}</a></div>`;
    if (st.tab === 'now') {
      if (st.alerts.length) h += '<div class="lsec">Weather alerts</div>' + st.alerts.map((a, i) => item({ k: 'alert', i, title: a.event, sum: (a.description || a.headline || '').replace(/^\*\s*/, '').replace(/\s*\*\s*/g, ' · '), meta: `<span>${esc(a.severity)}</span><span>until ${esc(fmtWhen(a.ends || a.expires))}</span>` }, i)).join('');
      if (st.wx) {
        const c = st.wx.current, d = st.wx.daily;
        const summit = st.grid && st.grid.summit;
        h += `<div class="lsec">${esc(home.n)} now</div><div class="nowgrid">
          <div><span>Feels like</span><b>${Math.round(c.apparent_temperature)}°</b></div>
          <div><span>Wind</span><b>${Math.round(c.wind_speed_10m)}<small> mph ${compass(c.wind_direction_10m)}</small></b></div>
          <div><span>Humidity</span><b>${Math.round(c.relative_humidity_2m)}%</b></div>
          <div><span>Gusts</span><b>${Math.round(c.wind_gusts_10m)} mph</b></div>
          <div><span>Clouds</span><b>${Math.round(c.cloud_cover)}%</b></div>
          <div><span>${summit ? 'Le Conte' : 'Visibility'}</span><b>${summit ? Math.round(summit.temperature_2m) + '°' : Math.round((c.visibility || 0) / 1609) + ' mi'}</b></div></div>`;
        const hrs = st.wx.hourly; const now = Date.now(); let k = hrs.time.findIndex(t => new Date(t + ':00-05:00').valueOf() > now - 3600e3);
        if (k >= 0) {
          h += '<div class="hours">' + hrs.time.slice(k, k + 18).map((t, j) => { const i = k + j; const hr = new Date(t + ':00-05:00').toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric' }); const p = hrs.precipitation_probability[i] || 0; return `<div>${j ? hr : 'Now'}<b>${Math.round(hrs.temperature_2m[i])}°</b>${icon(hrs.weather_code[i], hrs.is_day ? hrs.is_day[i] : 1).replace('id="wxIcon"', 'width="22" height="22"')}<i style="opacity:${p / 100}"></i></div>`; }).join('') + '</div>';
        }
        if (d) h += `<div class="mt" style="padding:6px 6px 0">Sunrise ${fmtT(d.sunrise[0])} · Sunset ${fmtT(d.sunset[0])} · High ${Math.round(d.temperature_2m_max[0])}° Low ${Math.round(d.temperature_2m_min[0])}°</div>`;
      }
      if (st.grid && st.grid.low + st.grid.mid > 25) h += `<div style="padding:10px 4px 0"><button class="btn primary" id="intoClouds">Fly into the clouds</button></div>`;
      if (st.iss && st.iss.alt > 0) h += `<div class="lsec">Overhead</div><div class="lempty" style="padding-top:0">The International Space Station is ${Math.round(st.iss.alt)}° above the horizon to the ${compass(st.iss.az)} right now${sky.sun && sky.sun.alt < -6 ? '. Look for it in the sky view.' : '.'}</div>`;
      if (st.blocked) h += blockedNote;
      else h += `<div class="mt" style="padding:10px 6px 0">Weather: Open-Meteo, NWS · updated ${ago(st.updated.wx)}</div>`;
    } else if (st.blocked) h = blockedNote;
    else if (st.tab === 'news' && st.filter) {
      const f = st.filter; const ns = st.news.map((n, i) => [n, i]).filter(([n]) => n.place && n.place.name === f), es = st.events.map((n, i) => [n, i]).filter(([n]) => n.place && n.place.name === f);
      h = `<div class="lsec" style="display:flex;justify-content:space-between;align-items:center">${esc(f)} · ${ns.length + es.length} <button class="livebtn" id="clearF">Show all</button></div>`;
      if (ns.length) h += ns.map(([n, i], j) => item({ k: 'news', i, title: n.title, sum: n.summary, img: n.img, meta: `<span>${esc(n.source)}</span><span>${ago(n.published)}</span>` }, j)).join('');
      if (es.length) h += '<div class="lsec">Events</div>' + es.map(([n, i], j) => item({ k: 'event', i, title: n.title, sum: n.summary, img: n.img, meta: `<span>${esc(n.source)}</span>${n.start ? `<span>${esc(fmtWhen(n.start))}</span>` : ''}` }, j)).join('');
    }
    else if (st.tab === 'news') h = st.news.length ? st.news.map((n, i) => item({ k: 'news', i, title: n.title, sum: n.summary, img: n.img, place: n.place && n.place.name, meta: `<span>${esc(n.source)}</span><span>${ago(n.published)}</span>` }, i)).join('') : '<div class="lempty">No local stories yet.</div>';
    else if (st.tab === 'events') h = st.events.length ? st.events.map((n, i) => item({ k: 'event', i, title: n.title, sum: n.summary, img: n.img, place: n.place && n.place.name, meta: `<span>${esc(n.source)}</span>${n.start ? `<span>${esc(fmtWhen(n.start))}</span>` : ''}` }, i)).join('') : '<div class="lempty">No events listed right now.</div>';
    else if (st.tab === 'roads') {
      const inc = st.traffic.incidents;
      h = inc.length ? inc.map((n, i) => item({ k: 'traffic', i, title: n.title, sum: n.desc, place: n.road || (n.place && n.place.name), meta: `<span>${esc(n.source)}</span>${n.start ? `<span>${ago(n.start)}</span>` : ''}` }, i)).join('') : '<div class="lempty">No reported incidents or closures nearby.</div>';
      h += TOMTOM ? `<div class="lempty" style="font-size:11.5px">Road colors on the map are live speeds from TomTom, updated every 2 minutes. Green is moving, red is stopped.</div>` : `<div class="lempty" style="font-size:11.5px">Traffic lines on the map are modeled from typical patterns for this hour and day, not live speeds. Incidents and park road alerts are live.</div>`;
    } else if (st.tab === 'cams') {
      const cams = st.traffic.cameras;
      h = cams.length ? cams.map((c, i) => `<div class="li" style="display:block;animation-delay:${i * 50}ms" data-k="cam" data-i="${i}">${c.img ? `<div class="camwrap"><img loading="lazy" src="${esc(camSrc(c))}" alt="${esc(c.name)}" onerror="this.parentNode.remove()">${camTag(c)}</div>` : ''}<h4>${esc(c.name)}</h4><div class="mt"><span>${esc(c.source)}</span>${c.live ? '<span>Live video on nps.gov</span>' : c.still ? '<span>New image every few minutes</span>' : ''}</div></div>`).join('') : '<div class="lempty">No cameras available right now.</div>';
      h += `<div class="lempty" style="font-size:11.5px">TDOT traffic cameras can be added with a free TDOT data key.</div>`;
    } else if (st.tab === 'rivers') {
      h = st.gauges.length ? st.gauges.map((g, i) => { const tr = trend(g.cfs24); return item({ k: 'gauge', i, title: niceGauge(g.name), sum: '', meta: `<span>${g.cfs != null ? Math.round(g.cfs).toLocaleString() + ' cfs' : ''}</span><span>${g.ft != null ? g.ft.toFixed(2) + ' ft' : ''}</span><span>${tr}</span><span>${ago(g.t)}</span>` + (g.cfs24 ? spark(g.cfs24) : '') }, i); }).join('') : '<div class="lempty">River gauges are loading.</div>';
      if (st.fires.length) h = `<div class="lsec">Satellite fire detections, last 24 hours</div>` + st.fires.map((f, i) => item({ k: 'fire', i, title: `Heat detected by ${f.sat}`, sum: `${f.frp ? f.frp.toFixed(1) + ' MW fire radiative power. ' : ''}Confidence ${f.conf}.`, meta: `<span>${f.date} ${String(f.time).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')} UTC</span>` }, i)).join('') + '<div class="lsec">Rivers</div>' + h;
    }
    v.innerHTML = h;
    if (render.last !== st.tab + st.filter) { render.last = st.tab + st.filter; v.scrollTop = 0; v.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22,1.2,.36,1)' }); }
    v.querySelectorAll('.li').forEach(el => el.onclick = () => focus(el.dataset.k, +el.dataset.i));
    const ic = $('#intoClouds'); if (ic) ic.onclick = intoClouds;
    const cf = $('#clearF'); if (cf) cf.onclick = () => { st.filter = null; render(); };
  }
  const fmtT = s => new Date(s + ':00-05:00').toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const fmtWhen = s => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return s; return d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }); };
  const niceGauge = n => n.replace(/\b(NR|AB|BL|AT)\b/g, m => ({ NR: 'near', AB: 'above', BL: 'below', AT: 'at' }[m])).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/, (Tn|Nc)$/, (m, s) => ', ' + s.toUpperCase());
  const trend = a => { if (!a || a.length < 4) return ''; const r = a[a.length - 1] / Math.max(1, a[a.length - 4]); return r > 1.15 ? '↑ rising' : r < 0.87 ? '↓ falling' : '→ steady'; };
  function spark(a) { const mx = Math.max(...a), mn = Math.min(...a), n = a.length; const pts = a.map((v, i) => `${(i / (n - 1) * 100).toFixed(1)},${(26 - (v - mn) / Math.max(1e-6, mx - mn) * 22).toFixed(1)}`).join(' '); return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#4aa3ff" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`; }
  const camSrc = c => c.still ? c.img + (c.img.includes('?') ? '&' : '?') + 'r=' + Math.floor(Date.now() / 300000) : c.img;
  const camTag = c => `<span class="tag ${c.still || c.live ? 'live' : ''}">${c.still ? 'Live still' : c.live ? 'Live stream' : 'Photo'}</span>`;

  /* ---------- pins ---------- */
  const PIN_ICON = {
    news: '<path d="M3 4h12v12H3z M6 7h6M6 10h6M6 13h4" stroke="#fff" stroke-width="1.6" fill="none"/>',
    event: '<rect x="3" y="4" width="12" height="11" rx="2" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M3 8h12M6 2v3M12 2v3" stroke="#fff" stroke-width="1.6"/>',
    traffic: '<path d="M9 2l7 13H2z" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M9 7v4M9 13v.5" stroke="#fff" stroke-width="1.8"/>',
    cam: '<rect x="2" y="5" width="10" height="8" rx="1.5" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M12 8l4-2v6l-4-2" stroke="#fff" stroke-width="1.6" fill="none"/>',
    gauge: '<path d="M2 11c2-2 3-2 5 0s3 2 5 0 3-2 4 0M2 15c2-2 3-2 5 0s3 2 5 0 3-2 4 0" stroke="#fff" stroke-width="1.6" fill="none"/>',
    fire: '<path d="M9 2c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z" fill="#fff"/>',
    alert: '<path d="M9 2l7 13H2z" fill="#fff"/>',
  };
  function pin(kind, lng, lat, i, hot, count, onTap) {
    if (lng == null || lat == null) return null;
    // the marker positions the outer box; the inner pin is free to squash and stretch
    const box = document.createElement('div'); box.className = 'lpinbox';
    const el = document.createElement('div'); el.className = `lpin ${kind}${hot ? ' hot' : ''}`; el.dataset.i = i;
    el.innerHTML = `<svg viewBox="0 0 18 18">${PIN_ICON[kind] || PIN_ICON.news}</svg>`;
    el.style.animationDelay = (Math.random() * 400 | 0) + 'ms';
    if (count) { const b = document.createElement('b'); b.className = 'lcount'; b.textContent = count > 99 ? '99+' : count; el.appendChild(b); }
    box.appendChild(el);
    box.addEventListener('click', e => { e.stopPropagation(); onTap ? onTap() : focus(kind, i); });
    const mk = new maplibregl.Marker({ element: box, anchor: 'bottom', pitchAlignment: 'viewport' }).setLngLat([lng, lat]).addTo(map);
    mk._prio = ({ fire: 95, alert: 92, traffic: 70, news: 50, event: 40, cam: 30, gauge: 20 }[kind] || 10) + (hot ? 8 : 0) + Math.min(20, count || 0);
    return mk;
  }
  function clearPins(group) { (st.markers[group] || []).forEach(m => m && m.remove()); st.markers[group] = []; }
  function spread(list) { // fan out pins that share a spot so each stays tappable
    const seen = {};
    return list.map(p => { const k = p[0].toFixed(3) + ',' + p[1].toFixed(3); const n = seen[k] = (seen[k] || 0) + 1; if (n === 1) return p; const a = n * 2.4, r = 0.0016 * Math.sqrt(n); return [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r * 0.8]; });
  }
  function drawPins() {
    clearPins('news'); clearPins('traffic'); clearPins('cams'); clearPins('rivers');
    if (st.on.news) { // one pin per place, with a count, so a town full of stories stays readable
      const groups = new Map();
      const add = (kind, n, i) => { if (!n.place) return; const k = n.place.name; const g = groups.get(k) || { place: n.place, items: [], fresh: false }; g.items.push([kind, i]); if (kind === 'news' && Date.now() - new Date(n.published) < 6 * 3600e3) g.fresh = true; groups.set(k, g); };
      st.news.forEach((n, i) => Date.now() - new Date(n.published || Date.now()) < 4 * 864e5 && add('news', n, i));
      st.events.forEach((n, i) => add('event', n, i));
      const gs = [...groups.values()]; const pos = spread(gs.map(g => [g.place.lng, g.place.lat]));
      gs.forEach((g, j) => {
        const kind = g.items.some(x => x[0] === 'news') ? 'news' : 'event';
        const m = pin(kind, pos[j][0], pos[j][1], g.items.length === 1 ? g.items[0][1] : -1, g.fresh, g.items.length > 1 ? g.items.length : 0, g.items.length === 1 ? null : () => showPlace(g));
        if (m && g.items.length === 1) m.getElement().onclick = e => { e.stopPropagation(); focus(g.items[0][0], g.items[0][1]); };
        st.markers.news.push(m);
      });
    }
    // urgent things stay on the map even when their layer is off: road closures and active fires
    const closed = n => /clos/i.test(n.title + ' ' + (n.desc || ''));
    st.traffic.incidents.forEach((n, i) => { if (st.on.traffic || closed(n)) st.markers.traffic.push(pin('traffic', n.lng, n.lat, i, closed(n))); });
    if (st.on.cams) st.traffic.cameras.forEach((c, i) => st.markers.cams.push(pin('cam', c.lng, c.lat, i, c.live || c.still)));
    requestAnimationFrame(declutter);
    if (st.on.rivers) st.gauges.forEach((g, i) => st.markers.rivers.push(pin('gauge', g.lng, g.lat, i, trend(g.cfs24).includes('rising'))));
    st.fires.forEach((f, i) => st.markers.rivers.push(pin('fire', f.lng, f.lat, i, true)));
  }
  function showPlace(g) { // tapping a busy town lists everything there
    st.filter = g.place.name; st.tab = 'news';
    document.querySelectorAll('.ltabs button').forEach(x => x.setAttribute('aria-selected', x.dataset.t === 'news'));
    setOpen(true); render();
    stopOrbit(); map.flyTo({ center: [g.place.lng, g.place.lat], zoom: Math.max(map.getZoom(), 14), pitch: 60, duration: 2400, easing: easeInOut, essential: true });
  }
  // keep pins from piling up: when two would overlap on screen, the more important one stays
  function declutter() {
    const all = Object.values(st.markers).flat().filter(Boolean).sort((a, b) => b._prio - a._prio);
    const kept = []; const R = innerWidth < 760 ? 30 : 34;
    for (const m of all) {
      const p = map.project(m.getLngLat());
      const show = !kept.some(q => Math.abs(q.x - p.x) < R && Math.abs(q.y - p.y) < R * 1.1);
      if (show) kept.push(p);
      const el = m.getElement(); if (el._shown !== show) { el._shown = show; el.classList.toggle('tucked', !show); }
    }
  }
  function lookup(kind, i) {
    if (kind === 'news') return st.news[i]; if (kind === 'event') return st.events[i]; if (kind === 'traffic') return st.traffic.incidents[i];
    if (kind === 'cam') return st.traffic.cameras[i]; if (kind === 'gauge') return st.gauges[i]; if (kind === 'fire') return st.fires[i]; if (kind === 'alert') return st.alerts[i];
  }
  function fireWhen(o) { const t = String(o.time || '0000').padStart(4, '0'); const d = new Date(`${o.date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`); return isNaN(d) ? `${o.date} ${o.time} UTC` : d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
  function focus(kind, i) {
    const o = lookup(kind, i); if (!o) return;
    const ll = o.place ? [o.place.lng, o.place.lat] : o.lng != null ? [o.lng, o.lat] : o.center || null;
    const c = $('#lcard'); const label = { news: 'News', event: 'Event', traffic: 'Roads', cam: 'Camera', gauge: 'River gauge', fire: 'Fire detection', alert: 'Weather alert' }[kind];
    let body = '';
    if (kind === 'cam') body = o.img ? `<div class="camwrap"><img src="${esc(camSrc(o))}" alt="">${camTag(o)}</div>` : '';
    else if (o.img) body = `<div class="camwrap"><img src="${esc(o.img)}" alt="" onerror="this.parentNode.remove()"></div>`;
    const title = o.title || o.event || o.name && (kind === 'gauge' ? niceGauge(o.name) : o.name) || (kind === 'fire' ? 'Heat detected by ' + o.sat : '');
    const text = o.summary || o.desc || o.description || (kind === 'gauge' ? `${o.cfs != null ? Math.round(o.cfs).toLocaleString() + ' cubic feet per second' : ''}${o.ft != null ? ', gauge height ' + o.ft.toFixed(2) + ' ft' : ''}. ${trend(o.cfs24)}.` : '') || (kind === 'fire' ? `Spotted ${fireWhen(o)}. Satellite confidence: ${({ l: 'low', n: 'medium', h: 'high' }[String(o.conf).toLowerCase()] || o.conf)}. Heat detections can include controlled burns and industrial heat.` : '');
    const where = o.place ? `<span class="pin-chip">${esc(o.place.name)}</span>` : '';
    const link = o.link || o.page || (kind === 'gauge' ? `https://waterdata.usgs.gov/monitoring-location/${o.id}/` : null);
    c.innerHTML = `<button class="close" aria-label="Close">✕</button><div class="eyebrow c-${kind}">${label}${o.source ? ' · ' + esc(o.source) : ''}</div><h3>${esc(title)}</h3>${body}${text ? `<p>${esc(String(text).slice(0, 600))}</p>` : ''}<div class="mt">${where}${o.published ? `<span>${ago(o.published)}</span>` : ''}</div>
      ${kind === 'fire' ? '<button class="btn hzgo" id="lcHz">🧭 Wind and possible spread</button>' : kind === 'alert' && window.Hazards && Hazards.isFlood(o) ? '<button class="btn hzgo" id="lcHz">🌊 What this means near you</button>' : ''}
      <div class="acts">${ll ? '<button class="btn" id="lcFly">Fly here</button>' : ''}${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">${kind === 'news' ? 'Read story' : kind === 'cam' && o.live ? 'Watch live' : 'Open source'}</a>` : ''}</div>
      ${o.place && o.place.kind !== 'nps' ? '<div class="mt" style="margin-top:8px">Location matched from place names in the story, so it can be approximate.</div>' : ''}`;
    c.hidden = false;
    c.querySelector('.close').onclick = () => c.hidden = true;
    const fly = () => { if (!ll) return; stopOrbit(); map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), kind === 'gauge' || kind === 'fire' ? 13.2 : 15), pitch: 62, duration: 2600, curve: 1.4, easing: easeInOut, essential: true }); bounce(kind, i); };
    const fb = $('#lcFly'); if (fb) fb.onclick = fly;
    const hz = $('#lcHz'); if (hz) hz.onclick = () => { c.hidden = true; kind === 'fire' ? Hazards.fire(o) : Hazards.flood(o); };
    if (innerWidth <= 760) setOpen(false);
    fly();
  }
  function bounce(kind, i) {
    const grp = { news: 'news', event: 'news', traffic: 'traffic', cam: 'cams', gauge: 'rivers', fire: 'rivers' }[kind]; const ms = st.markers[grp] || [];
    ms.forEach(m => { if (!m) return; const el = m.getElement().firstChild; if (el.classList.contains(kind) && +el.dataset.i === i) { el.classList.remove('focus'); void el.offsetWidth; el.classList.add('focus'); } });
  }

  // animated layers only redraw while the map is what you are looking at
  const mapOnScreen = () => !document.hidden && (!document.body.dataset.view || document.body.dataset.view === 'map' || document.body.classList.contains('picking'));

  /* ---------- weather and the 3D cloud field ---------- */
  const GRID = (() => { const pts = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) pts.push([-84.10 + i * (1.22 / 6), 35.33 + j * (0.70 / 5)]); return pts; })();
  async function loadWeather() {
    const pts = [...GRID, [-83.4357, 35.6545]];
    const base = 'https://api.open-meteo.com/v1/forecast?';
    const gridURL = base + `latitude=${pts.map(p => p[1].toFixed(3)).join(',')}&longitude=${pts.map(p => p[0].toFixed(3)).join(',')}&current=temperature_2m,dew_point_2m,relative_humidity_2m,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const ptURL = base + `latitude=${home.lat.toFixed(3)}&longitude=${home.lng.toFixed(3)}&` + 'current=temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,precipitation&hourly=temperature_2m,weather_code,precipitation_probability,is_day&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=2';
    const [g, w] = await Promise.allSettled([jget(gridURL), jget(ptURL)]);
    if (w.status === 'fulfilled') { st.wx = w.value; st.updated.wx = new Date().toISOString(); chip(); }
    if (g.status === 'fulfilled') {
      const arr = g.value; const cells = arr.slice(0, GRID.length).map(r => ({ ...r.current, elev: r.elevation }));
      const mean = k => cells.reduce((s, c) => s + (c[k] || 0), 0) / cells.length;
      st.grid = { cells, summit: arr[GRID.length] && arr[GRID.length].current, low: mean('cloud_cover_low'), mid: mean('cloud_cover_mid'), high: mean('cloud_cover_high'), wind: mean('wind_speed_10m'), dir: cells[20].wind_direction_10m };
      sky.cloud = Math.max(st.grid.low, st.grid.mid, st.grid.high * 0.6) / 100; drawSkyCanvas();
      Clouds.build(st.grid);
      Rain.update(st.grid, st.wx);
      if (Rain.rate > 0.05 && !st.radarTouched && !st.on.radar) { st.on.radar = true; const b = document.querySelector('[data-live="radar"]'); if (b) b.setAttribute('aria-pressed', 'true'); loadRadar().catch(() => {}); }
      autoFog();
    }
    if (g.status === 'rejected' && w.status === 'rejected') throw g.reason;
    render();
  }
  function chip() {
    const c = st.wx.current;
    $('#liveChip').querySelector('svg').outerHTML = icon(c.weather_code, c.is_day);
    $('#wxTemp').textContent = Math.round(c.temperature_2m) + '°';
    $('#wxDesc').innerHTML = `<b>${WMO[c.weather_code] || ''}</b> in ${esc(home.n)} · wind ${Math.round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}${st.grid && st.grid.summit ? `<br><span>Le Conte summit ${Math.round(st.grid.summit.temperature_2m)}°</span>` : ''}`;
  }
  let fogAuto = false;
  function autoFog() { // turn on valley fog when the valleys are saturated and calm
    const g = st.grid; if (!g || fogAuto) return;
    const valley = g.cells.filter(c => c.elev < 700);
    const wet = valley.length && valley.filter(c => c.relative_humidity_2m >= 95 && c.wind_speed_10m < 6).length / valley.length > 0.4;
    const b = $('#t-fog');
    if (wet && b && b.getAttribute('aria-pressed') !== 'true') { fogAuto = true; b.click(); showToast('Fog is settling in the valleys right now'); }
  }
  function intoClouds() {
    const g = st.grid; const lowBase = g.cells.reduce((s, c) => s + c.elev + Math.max(150, (c.temperature_2m - c.dew_point_2m) * 0.5556 * 125), 0) / g.cells.length;
    stopOrbit(); setOpen(false);
    map.flyTo({ center: [-83.47, 35.64], zoom: lowBase < 1600 ? 13.2 : 12.2, pitch: 80, bearing: map.getBearing() + 40, duration: 5200, curve: 1.6, easing: easeInOut, essential: true });
    map.once('moveend', () => orbit(0.35));
  }

  /* custom WebGL layer: thousands of soft billboards, lit by the real sun, drifting with the real wind */
  const Clouds = {
    id: 'clouds3d', type: 'custom', renderingMode: '3d', puffs: [], n: 0, dirty: true, lastSort: 0, opacity: 1, t0: performance.now(),
    light: { top: [1, 1, 1], bot: [0.6, 0.64, 0.7] }, wind: [[0, 0], [0, 0], [0, 0]],
    build(g) {
      const [w, s, e, n] = [-84.25, 35.25, -82.85, 36.10];
      const O = maplibregl.MercatorCoordinate.fromLngLat([w, n], 0); const B = maplibregl.MercatorCoordinate.fromLngLat([e, s], 0);
      this.origin = [O.x, O.y]; this.dom = [B.x - O.x, B.y - O.y];
      const mpu = O.meterInMercatorCoordinateUnits();
      let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const cover = (lng, lat, key) => { // bilinear over the 7x6 grid
        const fx = Math.max(0, Math.min(5.999, (lng + 84.10) / (1.22 / 6))), fy = Math.max(0, Math.min(4.999, (lat - 35.33) / (0.70 / 5)));
        const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j; const c = (a, b) => g.cells[b * 7 + a] || g.cells[0];
        const v = (k) => (c(i, j)[k] * (1 - tx) + c(i + 1, j)[k] * tx) * (1 - ty) + (c(i, j + 1)[k] * (1 - tx) + c(i + 1, j + 1)[k] * tx) * ty;
        return typeof key === 'function' ? key(v) : v(key);
      };
      const small = innerWidth < 760 ? 0.32 : 1; // phones: fewer, slightly bolder puffs (big alpha sprites are the costliest thing on a phone GPU)
      const LAYERS = [
        // kept above the highest peaks (Kuwohi is 2,025 m) so the map stays readable under an overcast sky
        { key: 'cloud_cover_low', count: 2600, size: [1300, 2800], alpha: 0.4, thick: 600, base: (lng, lat) => Math.max(2350, cover(lng, lat, v => v('elev') + Math.max(150, (v('temperature_2m') - v('dew_point_2m')) * 0.5556 * 125))) },
        { key: 'cloud_cover_mid', count: 1200, size: [2200, 4200], alpha: 0.32, thick: 1200, base: () => 3800 },
        { key: 'cloud_cover_high', count: 380, size: [5000, 9000], alpha: 0.2, thick: 400, base: () => 8200 },
      ];
      const P = [];
      LAYERS.forEach((L, li) => {
        const mean = g.cells.reduce((s2, c) => s2 + c[L.key], 0) / g.cells.length;
        const N = Math.round(L.count * small * Math.min(1, mean / 100 + 0.08));
        if (mean < 3) return;
        for (let k = 0, tries = 0; k < N && tries < N * 6; tries++) {
          const lng = w + r() * (e - w), lat = s + r() * (n - s);
          const cv = cover(lng, lat, L.key) / 100; if (r() > cv * 1.15) continue;
          k++;
          const m = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
          const alt = (L.base(lng, lat) + Math.pow(r(), 1.6) * L.thick * (0.4 + cv)) * EXAG;
          const size = (L.size[0] + r() * (L.size[1] - L.size[0])) * mpu * (li === 2 ? 1 : 0.6 + 0.6 * cv);
          P.push({ x: m.x - O.x, y: m.y - O.y, z: alt * mpu, s: size, a: Math.min(0.6, L.alpha * (0.45 + 0.55 * cv) * (small < 1 ? 1.35 : 1)), l: li, r: r() });
        }
      });
      this.puffs = P; this.n = P.length; this.dirty = true;
      const toVec = (mph, from) => { const ms = mph * 0.447 * 14 /* drift sped up 14x so motion reads */; const to = (from + 180) * RAD; return [Math.sin(to) * ms * mpu, -Math.cos(to) * ms * mpu]; };
      const dir = g.dir ?? 225; this.wind = [toVec(g.wind, dir), toVec(g.wind * 2.2, dir + 15), toVec(g.wind * 4, dir + 25)];
      // phones: clouds hold still. A drift that redraws once a second reads as stutter, and a smooth one keeps the GPU busy nonstop
      if (PHONE) this.wind = [[0, 0], [0, 0], [0, 0]];
      this.t0 = performance.now();
      if (map.getLayer(this.id)) map.triggerRepaint(); else if (st.on.clouds) addCloudLayer();
    },
    onAdd(m, gl) {
      const vs = `precision highp float;
        uniform mat4 u_m; uniform vec3 u_right, u_up; uniform float u_t, u_near; uniform vec2 u_dom; uniform vec2 u_w0, u_w1, u_w2;
        attribute vec3 a_c; attribute vec2 a_q; attribute vec4 a_p;
        varying vec2 v_uv; varying float v_a, v_sh, v_l;
        void main(){
          vec2 w = a_p.z < 0.5 ? u_w0 : (a_p.z < 1.5 ? u_w1 : u_w2);
          vec2 xy = mod(a_c.xy + w * u_t, u_dom);
          vec2 nn = xy / u_dom;
          float edge = smoothstep(0.0, 0.1, nn.x) * smoothstep(1.0, 0.9, nn.x) * smoothstep(0.0, 0.1, nn.y) * smoothstep(1.0, 0.9, nn.y);
          vec3 pos = vec3(xy, a_c.z) + (u_right * a_q.x + u_up * a_q.y * 0.62) * a_p.x;
          gl_Position = u_m * vec4(pos, 1.0);
          float ang = a_p.w * 6.2831; mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
          v_uv = R * a_q * 0.5 + 0.5; v_sh = a_q.y * 0.5 + 0.5; v_l = a_p.z;
          v_a = a_p.y * edge * smoothstep(u_near * 0.12, u_near * 0.55, gl_Position.w);
        }`;
      const fs = `precision mediump float;
        uniform sampler2D u_tex; uniform vec3 u_top, u_bot; uniform float u_op;
        varying vec2 v_uv; varying float v_a, v_sh, v_l;
        void main(){
          float a = texture2D(u_tex, v_uv).a * v_a * u_op;
          if (a < 0.004) discard;
          vec3 c = mix(u_bot, u_top, smoothstep(0.05, 0.95, v_sh));
          if (v_l > 1.5) c = mix(c, u_top, 0.65);
          gl_FragColor = vec4(c * a, a);
        }`;
      const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
      const p = this.prog = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      this.loc = {}; ['u_m', 'u_right', 'u_up', 'u_t', 'u_near', 'u_dom', 'u_w0', 'u_w1', 'u_w2', 'u_tex', 'u_top', 'u_bot', 'u_op'].forEach(k => this.loc[k] = gl.getUniformLocation(p, k));
      ['a_c', 'a_q', 'a_p'].forEach(k => this.loc[k] = gl.getAttribLocation(p, k));
      this.buf = gl.createBuffer();
      // a lumpy, soft cloud puff texture
      const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d');
      let sd = 3; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) { const x = N / 2 + (r() - 0.5) * N * 0.42, y = N / 2 + (r() - 0.5) * N * 0.3, rad = N * (0.12 + r() * 0.2); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, N, N); }
      const id = g.getImageData(0, 0, N, N); for (let i = 0; i < N * N; i++) { const x = i % N, y = i / N | 0; const d = Math.hypot(x - N / 2, y - N / 2) / (N / 2); const fall = Math.max(0, 1 - d * d); id.data[i * 4 + 3] = Math.min(255, id.data[i * 4 + 3] * fall * (0.8 + 0.4 * r())); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; }
      g.putImageData(id, 0, 0);
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.dirty = true;
    },
    render(gl, args) {
      if (!this.n || this.opacity <= 0.01) return;
      const M = args.defaultProjectionData ? args.defaultProjectionData.mainMatrix : args.modelViewProjectionMatrix || args;
      const ox = this.origin[0], oy = this.origin[1];
      const Mm = new Float32Array(16); for (let i = 0; i < 16; i++) Mm[i] = M[i];
      for (let i = 0; i < 4; i++) Mm[12 + i] = M[i] * ox + M[4 + i] * oy + M[12 + i];
      const t = (performance.now() - this.t0) / 1000;
      const now = performance.now();
      if (this.dirty || now - this.lastSort > (PHONE ? 450 : 280)) { this.sort(Mm, t); this.lastSort = now; this.dirty = false; this.upload(gl); }
      const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const right = norm([M[0], M[4], M[8]]), up = norm([M[1], M[5], M[9]]);
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.loc.u_m, false, Mm);
      gl.uniform3fv(this.loc.u_right, right); gl.uniform3fv(this.loc.u_up, up);
      gl.uniform1f(this.loc.u_t, t); gl.uniform1f(this.loc.u_near, map.transform.cameraToCenterDistance || 800);
      gl.uniform2f(this.loc.u_dom, this.dom[0], this.dom[1]);
      gl.uniform2fv(this.loc.u_w0, this.wind[0]); gl.uniform2fv(this.loc.u_w1, this.wind[1]); gl.uniform2fv(this.loc.u_w2, this.wind[2]);
      gl.uniform3fv(this.loc.u_top, this.light.top); gl.uniform3fv(this.loc.u_bot, this.light.bot); gl.uniform1f(this.loc.u_op, this.opacity * zoomFade(map.getZoom()));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(this.loc.u_tex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const F = 4 * 9;
      gl.enableVertexAttribArray(this.loc.a_c); gl.vertexAttribPointer(this.loc.a_c, 3, gl.FLOAT, false, F, 0);
      gl.enableVertexAttribArray(this.loc.a_q); gl.vertexAttribPointer(this.loc.a_q, 2, gl.FLOAT, false, F, 12);
      gl.enableVertexAttribArray(this.loc.a_p); gl.vertexAttribPointer(this.loc.a_p, 4, gl.FLOAT, false, F, 20);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, this.n * 6);
      gl.disableVertexAttribArray(this.loc.a_c); gl.disableVertexAttribArray(this.loc.a_q); gl.disableVertexAttribArray(this.loc.a_p);
      // gentle drift without burning the battery; no drift at all while the feed or another screen covers the map
      if (!PHONE && !this._rq && mapOnScreen()) this._rq = setTimeout(() => { this._rq = 0; if (mapOnScreen()) map.triggerRepaint(); }, 66); // phones: no idle redraws at all (clouds hold still)
    },
    sort(Mm, t) {
      const P = this.puffs, dx = this.dom[0], dy = this.dom[1];
      for (const p of P) { const w = this.wind[p.l]; let x = (p.x + w[0] * t) % dx; if (x < 0) x += dx; let y = (p.y + w[1] * t) % dy; if (y < 0) y += dy; p.d = Mm[3] * x + Mm[7] * y + Mm[11] * p.z + Mm[15]; }
      P.sort((a, b) => b.d - a.d);
    },
    upload(gl) {
      const P = this.puffs; const arr = this.arr && this.arr.length === P.length * 54 ? this.arr : (this.arr = new Float32Array(P.length * 54));
      const Q = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]; let o = 0;
      for (const p of P) for (let v = 0; v < 6; v++) { arr[o++] = p.x; arr[o++] = p.y; arr[o++] = p.z; arr[o++] = Q[v * 2]; arr[o++] = Q[v * 2 + 1]; arr[o++] = p.s; arr[o++] = p.a; arr[o++] = p.l; arr[o++] = p.r; }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    },
  };
  // clouds read as a sky from far out and get out of the way as you zoom in
  const zoomFade = z => z <= 9.5 ? 0.85 : z >= 14 ? 0.32 : 0.85 - (z - 9.5) / 4.5 * 0.53;
  function addCloudLayer() { if (!map.getLayer(Clouds.id) && Clouds.n) map.addLayer(Clouds, 'lbl-water'); }
  // cloud color follows the same sun as the rest of the scene
  const CLOUD_STOPS = [[-18, '#3a4258', '#161b27'], [-9, '#454b69', '#1d2031'], [-3, '#b98c9e', '#5a5470'], [2, '#ffc994', '#8b808e'], [10, '#fff2e0', '#a2a3ad'], [28, '#ffffff', '#aeb6c0']];
  function cloudLight(alt, moonLift) {
    let i = 0; while (i < CLOUD_STOPS.length - 2 && alt > CLOUD_STOPS[i + 1][0]) i++;
    const A = CLOUD_STOPS[i], B = CLOUD_STOPS[i + 1]; const t = Math.max(0, Math.min(1, (alt - A[0]) / (B[0] - A[0])));
    const rgb = h => hex(h).map(v => v / 255); const mix = (a, b) => rgb(a).map((v, k) => v + (rgb(b)[k] - v) * t);
    const lift = 1 + moonLift * 1.3;
    Clouds.light = { top: mix(A[1], B[1]).map(v => Math.min(1, v * lift)), bot: mix(A[2], B[2]).map(v => Math.min(1, v * lift)) };
  }

  /* 3D rain or snow: streaks fall from the cloud base onto the terrain around wherever you are looking.
     Driven by live precipitation; only drawn when zoomed in, where it can be seen. */
  const Rain = {
    id: 'rain3d', type: 'custom', renderingMode: '3d', rate: 0, snow: false, n: 0, t0: performance.now(),
    update(g, wx) {
      const c = map.getCenter();
      // nearest grid cells, weighted by distance, give the rate where you are looking
      let sw = 0, sr = 0, st2 = 0;
      g.cells.forEach((cell, i) => { const p = GRID[i]; const d = Math.hypot((p[0] - c.lng) * 0.81, p[1] - c.lat) + 0.03; const w = 1 / (d * d); sw += w; sr += w * (cell.precipitation || 0) * 4; st2 += w * cell.temperature_2m; });
      let rate = sr / sw; const temp = st2 / sw;
      if (wx && wx.current && wx.current.precipitation > 0) rate = Math.max(rate, wx.current.precipitation * 4); // mm per hour
      this.rate = rate; this.snow = temp <= 33.5;
      this.windDir = g.dir ?? 225; this.wind = g.wind || 5;
      if (this.rate > 0.03) { if (!map.getLayer(this.id)) map.addLayer(this, 'lbl-water'); } else if (map.getLayer(this.id)) map.removeLayer(this.id);
    },
    onAdd(m, gl) {
      const vs = `precision highp float;
        uniform mat4 u_m; uniform float u_half, u_bot, u_h, u_t, u_len, u_snow; uniform vec2 u_slant;
        attribute vec4 a_s; attribute float a_e;
        varying float v_a;
        void main(){
          float z = u_bot + u_h - mod(u_t * (u_snow > 0.5 ? 0.22 : 1.0) * (0.85 + a_s.w * 0.3) * u_h / 1.4 + a_s.z * u_h, u_h);
          vec2 xy = (a_s.xy * 2.0 - 1.0) * u_half;
          xy += u_slant * (u_bot + u_h - z) / u_h;
          if (u_snow > 0.5) xy += vec2(sin(u_t * 1.3 + a_s.z * 40.0), cos(u_t * 1.1 + a_s.w * 30.0)) * u_half * 0.012;
          float len = u_snow > 0.5 ? u_len * 0.06 : u_len;
          vec3 p = vec3(xy, z + a_e * len);
          p.xy -= a_e * u_slant * len / u_h;
          gl_Position = u_m * vec4(p, 1.0);
          gl_PointSize = 2.0;
          float r = length(a_s.xy * 2.0 - 1.0);
          float top = (z - u_bot) / u_h;
          v_a = smoothstep(1.0, 0.55, r) * smoothstep(1.0, 0.8, top) * smoothstep(0.0, 0.06, top) * (a_e > 0.5 ? 0.15 : 1.0);
        }`;
      const fs = `precision mediump float; uniform vec3 u_col; uniform float u_alpha; varying float v_a;
        void main(){ float a = v_a * u_alpha; gl_FragColor = vec4(u_col * a, a); }`;
      const sh = (t, src) => { const s2 = gl.createShader(t); gl.shaderSource(s2, src); gl.compileShader(s2); if (!gl.getShaderParameter(s2, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s2)); return s2; };
      const p = this.prog = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      this.loc = {}; ['u_m', 'u_half', 'u_bot', 'u_h', 'u_t', 'u_len', 'u_snow', 'u_slant', 'u_col', 'u_alpha'].forEach(k => this.loc[k] = gl.getUniformLocation(p, k));
      this.loc.a_s = gl.getAttribLocation(p, 'a_s'); this.loc.a_e = gl.getAttribLocation(p, 'a_e');
      const N = this.n = PHONE ? 3500 : 11000; const arr = new Float32Array(N * 2 * 5);
      let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647; let o = 0;
      for (let i = 0; i < N; i++) { const x = r(), y = r(), ph = r(), sp = r(); for (let e = 0; e < 2; e++) { arr[o++] = x; arr[o++] = y; arr[o++] = ph; arr[o++] = sp; arr[o++] = e; } }
      this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    },
    render(gl, args) {
      const z = map.getZoom(); const zf = Math.max(0, Math.min(1, (z - 10.8) / 1.6)); if (zf <= 0 || this.rate <= 0.03) return;
      const M = args.defaultProjectionData ? args.defaultProjectionData.mainMatrix : args.modelViewProjectionMatrix || args;
      const c = map.getCenter(); const O = maplibregl.MercatorCoordinate.fromLngLat(c, 0); const mpu = O.meterInMercatorCoordinateUnits();
      const Mm = new Float32Array(16); for (let i = 0; i < 16; i++) Mm[i] = M[i];
      for (let i = 0; i < 4; i++) Mm[12 + i] = M[i] * O.x + M[4 + i] * O.y + M[12 + i];
      const halfM = 2600 * Math.pow(2, 13 - z); // the column covers the view at any zoom
      const ground = (map.queryTerrainElevation(c) ?? 600 * EXAG);
      const H = Math.min(2350 * EXAG - ground + 400, halfM * 2.2);
      const intensity = Math.min(1, 0.42 + Math.sqrt(this.rate) * 0.35); // even drizzle should read
      const lit = sky.sun ? Math.max(0.25, Math.min(1, (sky.sun.alt + 6) / 16)) : 1;
      const t = (performance.now() - this.t0) / 1000;
      const to = (this.windDir + 180) * RAD, slantM = H * Math.min(0.5, this.wind / 40) * (this.snow ? 1.4 : 1);
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.loc.u_m, false, Mm);
      gl.uniform1f(this.loc.u_half, halfM * mpu); gl.uniform1f(this.loc.u_bot, (ground - 250) * mpu); gl.uniform1f(this.loc.u_h, Math.max(300, H) * mpu);
      gl.uniform1f(this.loc.u_t, t); gl.uniform1f(this.loc.u_len, (this.snow ? 1 : 0.045) * Math.max(300, H) * mpu); gl.uniform1f(this.loc.u_snow, this.snow ? 1 : 0);
      gl.uniform2f(this.loc.u_slant, Math.sin(to) * slantM * mpu, -Math.cos(to) * slantM * mpu);
      gl.uniform3fv(this.loc.u_col, this.snow ? [lit, lit, lit] : [0.72 * lit + 0.1, 0.8 * lit + 0.1, 0.9 * lit + 0.1]);
      gl.uniform1f(this.loc.u_alpha, zf * intensity * (this.snow ? 0.95 : 0.5));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(this.loc.a_s); gl.vertexAttribPointer(this.loc.a_s, 4, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(this.loc.a_e); gl.vertexAttribPointer(this.loc.a_e, 1, gl.FLOAT, false, 20, 16);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
      const count = Math.round(this.n * Math.min(1, 0.42 + this.rate / 4));
      if (this.snow) gl.drawArrays(gl.POINTS, 0, count * 2); else gl.drawArrays(gl.LINES, 0, count * 2);
      gl.disableVertexAttribArray(this.loc.a_s); gl.disableVertexAttribArray(this.loc.a_e);
      if (!this._rq && mapOnScreen()) this._rq = setTimeout(() => { this._rq = 0; if (mapOnScreen()) map.triggerRepaint(); }, 33); // rain falls at a steady 30 frames a second everywhere: 15 looked choppy
    },
  };

  /* ---------- rain radar (RainViewer), animated loop of the last two hours ---------- */
  let radarTimer = 0;
  async function loadRadar() {
    const j = await jget('https://api.rainviewer.com/public/weather-maps.json');
    const frames = (j.radar && j.radar.past || []).slice(-10);
    st.radar = { host: j.host, frames };
    if (st.on.radar) showRadar();
  }
  function showRadar() {
    hideRadar(); const R = st.radar; if (!R || !R.frames.length) return;
    R.frames.forEach((f, i) => {
      const id = 'radar' + i;
      map.addSource(id, { type: 'raster', tiles: [`${R.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7, attribution: 'RainViewer' });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 600 }, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, 'park-glow');
    });
    let k = 0; const n = R.frames.length;
    const step = () => { for (let i = 0; i < n; i++) map.setPaintProperty('radar' + i, 'raster-opacity', i === k ? ['interpolate', ['linear'], ['zoom'], 10.5, 0.7, 12.5, 0] : 0); const d = new Date(R.frames[k].time * 1000); showToastQuiet(`Radar ${d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}`); k = (k + 1) % n; radarTimer = setTimeout(step, k === 0 ? 1800 : 650); };
    step();
  }
  function hideRadar() { clearTimeout(radarTimer); for (let i = 0; i < 16; i++) { if (map.getLayer('radar' + i)) map.removeLayer('radar' + i); if (map.getSource('radar' + i)) map.removeSource('radar' + i); } }
  let quietT = 0; function showToastQuiet(msg) { const el = $('#radarStamp'); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(quietT); quietT = setTimeout(() => el.hidden = true, 3000); }

  /* ---------- NWS alerts, drawn as glowing outlines ---------- */
  const ALERT_POINTS = [[35.714, -83.512], [35.868, -83.562], [35.563, -83.498], [35.675, -83.756], [35.475, -83.315]];
  const zoneCache = {};
  async function loadAlerts() {
    const res = await Promise.allSettled(ALERT_POINTS.map(p => jget(`https://api.weather.gov/alerts/active?point=${p[0]},${p[1]}`)));
    const seen = new Map();
    res.forEach(r => r.status === 'fulfilled' && (r.value.features || []).forEach(f => seen.set(f.id, f)));
    if (res.every(r => r.status === 'rejected')) throw res[0].reason;
    const feats = [];
    for (const f of seen.values()) {
      let geom = f.geometry;
      if (!geom && f.properties.affectedZones) {
        const zs = await Promise.allSettled(f.properties.affectedZones.slice(0, 6).map(u => zoneCache[u] || (zoneCache[u] = jget(u))));
        const polys = zs.filter(z => z.status === 'fulfilled' && z.value.geometry).map(z => z.value.geometry);
        if (polys.length) geom = { type: 'GeometryCollection', geometries: polys };
      }
      feats.push({ type: 'Feature', geometry: geom, properties: { event: f.properties.event, severity: f.properties.severity } });
    }
    const uniq = new Map(); [...seen.values()].forEach(f => { const p = f.properties; const k = p.event + '|' + (p.ends || p.expires); if (!uniq.has(k)) uniq.set(k, p); });
    st.alerts = [...uniq.values()].sort((a, b) => ({ Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 }[a.severity] ?? 4) - ({ Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 }[b.severity] ?? 4));
    const src = map.getSource('alerts'); const fc = { type: 'FeatureCollection', features: feats.filter(f => f.geometry) };
    if (src) src.setData(fc);
    else {
      map.addSource('alerts', { type: 'geojson', data: fc });
      map.addLayer({ id: 'alerts-fill', type: 'fill', source: 'alerts', paint: { 'fill-color': ['match', ['get', 'severity'], ['Extreme', 'Severe'], '#ff3b30', '#ff9f0a'], 'fill-opacity': 0.08 } }, 'park-glow');
      map.addLayer({ id: 'alerts-line', type: 'line', source: 'alerts', paint: { 'line-color': ['match', ['get', 'severity'], ['Extreme', 'Severe'], '#ff5a4f', '#ffb340'], 'line-width': 2.2, 'line-blur': 1.5, 'line-opacity': 0.9 } }, 'park-glow');
    }
    const bar = $('#alertBar');
    if (st.alerts.length) { const a = st.alerts[0]; bar.innerHTML = `<b>${esc(a.event)}</b>until ${esc(fmtWhen(a.ends || a.expires))}${a.senderName ? ' · ' + esc(a.senderName.replace(/^NWS /, 'NWS ')) : ''}${st.alerts.length > 1 ? ` · +${st.alerts.length - 1} more` : ''}`; bar.classList.add('on'); }
    else bar.classList.remove('on');
  }

  /* ---------- rivers ---------- */
  const GAUGES = '03469000,03470000,03469175,03471500,03497300,03498500,03512000,03460000,03461500,03463300,03465500,03513000,03503000';
  async function loadGauges() {
    try {
      const j = await jget(`https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${GAUGES}&parameterCd=00060,00065&period=PT24H&siteStatus=active`, 20000);
      const sites = {};
      for (const ts of j.value.timeSeries) {
        const si = ts.sourceInfo, code = si.siteCode[0].value, g = si.geoLocation.geogLocation;
        const s = sites[code] || (sites[code] = { id: code, name: si.siteName, lng: g.longitude, lat: g.latitude });
        const p = ts.variable.variableCode[0].value; const vals = ts.values[0].value.filter(v => v.value !== '' && v.value !== '-999999').map(v => [v.dateTime, +v.value]);
        if (!vals.length) continue; const k = p === '00060' ? 'cfs' : 'ft';
        s[k] = vals[vals.length - 1][1]; s.t = vals[vals.length - 1][0]; s[k + '24'] = vals.filter((_, i) => i % 4 === 0).map(v => v[1]);
      }
      st.gauges = Object.values(sites);
    } catch (e) { const j = await feed('gauges.json'); st.gauges = j.items; }
  }

  /* ---------- ISS in the night sky ---------- */
  async function loadISS() {
    const j = await jget('https://api.wheretheiss.at/v1/satellites/25544', 8000);
    const c = map.getCenter();
    const toECEF = (lat, lng, h) => { const R = 6371 + h, a = lat * RAD, b = lng * RAD; return [R * Math.cos(a) * Math.cos(b), R * Math.cos(a) * Math.sin(b), R * Math.sin(a)]; };
    const o = toECEF(c.lat, c.lng, 0.4), s = toECEF(j.latitude, j.longitude, j.altitude);
    const d = [s[0] - o[0], s[1] - o[1], s[2] - o[2]]; const la = c.lat * RAD, lo = c.lng * RAD;
    const east = -Math.sin(lo) * d[0] + Math.cos(lo) * d[1];
    const north = -Math.sin(la) * Math.cos(lo) * d[0] - Math.sin(la) * Math.sin(lo) * d[1] + Math.cos(la) * d[2];
    const up = Math.cos(la) * Math.cos(lo) * d[0] + Math.cos(la) * Math.sin(lo) * d[1] + Math.sin(la) * d[2];
    st.iss = { alt: Math.atan2(up, Math.hypot(east, north)) / RAD, az: (Math.atan2(east, north) / RAD + 360) % 360, vis: j.visibility };
  }
  window.skyExtras = (g, project) => { // drawn by the sky canvas
    const s = st.iss; if (!s || s.alt < 0) return; const p = project(s.az, s.alt); if (!p) return;
    const lit = s.vis === 'daylight';
    g.globalAlpha = lit ? 1 : 0.5; g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0], p[1], 2.6, 0, 7); g.fill();
    g.globalAlpha = 0.8; g.font = '600 11px Barlow, sans-serif'; g.fillText('ISS', p[0] + 7, p[1] + 4);
  };

  /* ---------- feeds from the GitHub Action ---------- */
  async function loadFeeds() {
    const [n, e, t, f] = await Promise.allSettled([feed('news.json'), feed('events.json'), feed('traffic.json'), feed('fires.json')]);
    if (n.status === 'fulfilled') st.news = n.value.items || [];
    if (e.status === 'fulfilled') st.events = e.value.items || [];
    if (t.status === 'fulfilled') st.traffic = { incidents: (t.value.incidents || []).filter(x => x.lng != null), cameras: (t.value.cameras || []).filter(x => x.lng != null) };
    if (f.status === 'fulfilled') st.fires = f.value.items || [];
    if ([n, e, t, f].every(r => r.status === 'rejected')) throw n.reason;
  }

  /* ---------- modeled traffic flow ---------- */
  let flowT = 0, flowStep = 0;
  const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
  function busyness(d = sky.date || new Date()) { // typical weekday/weekend curves, heavier on holiday weekends and in October
    const m = localMinutes(d) / 60; const dow = new Date(d.toLocaleString('en-US', { timeZone: TZ })).getDay();
    const wk = dow === 0 || dow === 6; const mo = +d.toLocaleString('en-US', { timeZone: TZ, month: 'numeric' });
    const peak = (h, c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
    let b = wk ? 0.15 + 0.8 * peak(m, 14, 3.4) + 0.3 * peak(m, 19, 2) : 0.12 + 0.55 * peak(m, 8, 1.3) + 0.5 * peak(m, 13, 2.5) + 0.65 * peak(m, 17.3, 1.6);
    if (mo === 10 || mo === 7) b *= 1.3; if (mo === 11 && dow >= 4) b *= 1.25; if (mo === 12) b *= 1.15;
    return Math.min(1, b);
  }
  // real traffic: TomTom flow (green/yellow/red by speed) and incident tiles draped on the terrain
  let ttT = 0;
  const ttTiles = (kind, t) => [`https://api.tomtom.com/traffic/map/4/tile/${kind}/{z}/{x}/{y}.png?key=${TOMTOM}&tileSize=256&t=${t}`];
  function addLiveFlow() {
    if (map.getLayer('tt-flow')) return;
    const t = Math.floor(Date.now() / 120e3);
    map.addSource('tt-flow', { type: 'raster', tiles: ttTiles('flow/relative0', t), tileSize: 256, minzoom: 6, maxzoom: 18, attribution: '© TomTom traffic' });
    map.addSource('tt-inc', { type: 'raster', tiles: ttTiles('incidents/s3', t), tileSize: 256, minzoom: 6, maxzoom: 18 });
    map.addLayer({ id: 'tt-flow', type: 'raster', source: 'tt-flow', minzoom: 9, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 13, 0.95], 'raster-fade-duration': 400 } }, 'buildings');
    map.addLayer({ id: 'tt-inc', type: 'raster', source: 'tt-inc', minzoom: 11, paint: { 'raster-opacity': 0.95 } }, 'buildings');
    clearInterval(ttT);
    ttT = setInterval(() => { const t = Math.floor(Date.now() / 120e3); ['flow/relative0', 'incidents/s3'].forEach((k, i) => { const src = map.getSource(i ? 'tt-inc' : 'tt-flow'); if (src && src.setTiles) src.setTiles(ttTiles(k, t)); }); }, 120e3);
  }
  function addFlow() {
    if (TOMTOM) return addLiveFlow();
    if (map.getLayer('traffic-flow')) return;
    map.addLayer({ id: 'traffic-flow', type: 'line', source: 'vec', 'source-layer': 'roads', minzoom: 10, filter: ['in', ['get', 'c'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]], layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, 1, 14, 3, 17, 7], 'line-opacity': 0.9, 'line-dasharray': DASH[0], 'line-color': '#7be08a' } }, 'buildings');
    flowColor();
    const tick = () => { if (!map.getLayer('traffic-flow')) return; flowStep = (flowStep + 1) % DASH.length; map.setPaintProperty('traffic-flow', 'line-dasharray', DASH[flowStep]); flowT = setTimeout(tick, 110); };
    tick();
  }
  function flowColor() {
    if (!map.getLayer('traffic-flow')) return; const b = busyness();
    const parkway = ['match', ['get', 'c'], ['trunk', 'primary'], 1, 0.7];
    const col = b > 0.75 ? '#ff6a4d' : b > 0.5 ? '#ffb340' : '#7be08a';
    map.setPaintProperty('traffic-flow', 'line-color', sky.lightsOn ? ['match', ['get', 'c'], ['trunk', 'primary', 'motorway'], b > 0.5 ? '#ff7b5c' : '#fff1c9', '#ffd89a'] : col);
    map.setPaintProperty('traffic-flow', 'line-opacity', ['*', parkway, 0.35 + 0.6 * b]);
  }
  function removeFlow() { clearTimeout(flowT); clearInterval(ttT); ['traffic-flow', 'tt-flow', 'tt-inc'].forEach(id => map.getLayer(id) && map.removeLayer(id)); ['tt-flow', 'tt-inc'].forEach(id => map.getSource(id) && map.removeSource(id)); }

  function applyToggles(k) {
    if (k === 'clouds') { if (st.on.clouds) addCloudLayer(); else if (map.getLayer(Clouds.id)) map.removeLayer(Clouds.id); }
    if (k === 'radar') { if (st.on.radar) { if (st.radar) showRadar(); else loadRadar().catch(() => showToast('Radar is unavailable right now')); } else hideRadar(); }
    if (k === 'traffic') { if (st.on.traffic) addFlow(); else removeFlow(); }
    if (st.blocked && k !== 'clouds' && k !== 'traffic' && st.on[k]) showToast('Live feeds load on the full site');
    drawPins();
  }

  /* ---------- schedule ---------- */
  async function safe(fn, name) { try { await fn(); return true; } catch (e) { console.info('[live]', name, e && e.message); return false; } }
  async function refreshFast() { await Promise.all([safe(loadAlerts, 'alerts'), safe(loadGauges, 'gauges')]); drawPins(); render(); }
  async function refreshSlow() { await Promise.all([safe(loadWeather, 'weather'), safe(loadFeeds, 'feeds'), st.on.radar ? safe(loadRadar, 'radar') : null]); counts(); drawPins(); render(); }
  async function init() {
    buildUI();
    map.on('moveend', () => { if (st.grid) Rain.update(st.grid, st.wx); declutter(); });
    map.on('move', throttle(declutter, 140));
    const stamp = document.createElement('div'); stamp.id = 'radarStamp'; stamp.className = 'panel'; stamp.hidden = true; document.body.appendChild(stamp);
    if (st.on.traffic) addFlow();
    // the artifact preview blocks outside requests; find out once, quietly
    const ok = await safe(loadWeather, 'weather');
    if (!ok) {
      const feedOk = await safe(loadFeeds, 'feeds');
      if (!feedOk) { st.blocked = true; $('#wxDesc').innerHTML = '<b>Live data is off in this preview.</b> Tap for the full site.'; render(); return; }
    }
    await Promise.all([safe(loadFeeds, 'feeds'), refreshFast()]);
    counts(); drawPins(); render();
    setInterval(refreshFast, 3 * 60e3);
    setInterval(refreshSlow, 10 * 60e3);
    setInterval(() => { if (sky.sun && sky.sun.alt < -6 && !document.hidden) safe(loadISS, 'iss').then(drawSkyCanvas); }, 5000);
    setInterval(flowColor, 60e3);
    setInterval(() => { if (st.tab === 'cams' && $('#live').classList.contains('open')) document.querySelectorAll('#lview .li[data-k="cam"]').forEach(el => { const c = st.traffic.cameras[+el.dataset.i]; const im = el.querySelector('img'); if (c && c.still && im) im.src = camSrc(c); }); }, 300e3);
  }
  const refresh = () => Promise.all([refreshFast(), refreshSlow()]);
  // the simple "Show on map" sheet drives layers through this, and the old rail toggles stay in step
  function setOn(k, on) {
    if (!(k in st.on) || st.on[k] === on) return; st.on[k] = on; if (k === 'radar') st.radarTouched = true;
    const b = document.querySelector(`[data-live="${k}"]`); if (b) b.setAttribute('aria-pressed', on);
    if (map) applyToggles(k);
  }
  return { init, st, cloudLight, flowColor, Clouds, Rain, focus, render, refresh, setOn, setOpen: on => setOpen(on), icon, WMO, home: () => home, setHome(h) { home = h; try { localStorage.setItem('sl-home', JSON.stringify(h)); } catch (e) { } return loadWeather(); }, liveTraffic: () => !!TOMTOM, ttKey: () => TOMTOM };
})();
