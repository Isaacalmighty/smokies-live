/* =====================================================================
   SOCIAL: an Instagram-style layer over the map. Home feed, stories,
   posting with a photo and a place, profiles, activity. Every post can
   be seen on the map. Storage is behind one small interface, so the
   device-only store can be swapped for a shared backend later.
   ===================================================================== */
const Social = (() => {
  const SITE = 'https://isaacalmighty.github.io/smokies-live/';
  // Supabase project (public URL and anon key; data is protected by row-level security). Empty = device-only mode.
  const SUPA = { url: 'https://uamuqhkpbszogmdusfqr.supabase.co', key: 'sb_publishable_Y0fiNms2M0TI1Ph_ITWk0Q_hk2TS848' };
  const SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.79.0/dist/umd/supabase.js';
  const S = { view: 'map', posts: [], likes: {}, saved: {}, comments: {}, me: null, stories: [], storyAt: 0, pins: [], seen: 0 };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 0) return 'upcoming'; if (s < 60) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; if (s < 7 * 86400) return Math.round(s / 86400) + 'd'; return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }); };
  const I = { // 24px line icons
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20"/>',
    plus: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    heart: '<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    comment: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.6A8.5 8.5 0 1 1 20.5 11.5z"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    save: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  };
  const svg = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

  /* ---------- storage: device-only for now (IndexedDB, falls back to memory) ---------- */
  const Store = (() => {
    let dbp = null; const mem = {};
    const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('smokies-social', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
    const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const st = t.objectStore('kv'); const q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return {
      async get(k, dflt) { try { const v = await tx('readonly', s => s.get(k)); return v === undefined ? dflt : v; } catch (e) { return k in mem ? mem[k] : dflt; } },
      async set(k, v) { mem[k] = v; try { await tx('readwrite', s => s.put(v, k)); } catch (e) { /* private mode: keep in memory */ } },
      shared: false,
    };
  })();
  /* ---------- shared backend (Supabase): accounts, posts, likes, comments, photos ---------- */
  const Cloud = {
    on: false, sb: null, user: null,
    async init() {
      if (!SUPA.url || !SUPA.key) return;
      try {
        await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = SUPA_JS; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
        this.sb = window.supabase.createClient(SUPA.url, SUPA.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
        const probe = await this.sb.from('post_feed').select('id').limit(1); if (probe.error) throw new Error('tables not set up: ' + probe.error.message);
        const { data } = await this.sb.auth.getSession(); this.user = data.session ? data.session.user : null;
        this.on = true; Store.shared = true;
        this.sb.auth.onAuthStateChange(async (ev, ses) => { const was = this.user && this.user.id; this.user = ses ? ses.user : null; if ((this.user && this.user.id) !== was) { await this.loadMe(); await this.loadFeed(); refresh(); if (ev === 'SIGNED_IN') showToast('Signed in'); } });
        await this.loadMe(); await this.loadFeed();
        this.sb.channel('posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => this.loadFeed().then(refresh)).subscribe();
        if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
      } catch (e) { console.info('[social] backend unavailable', e && e.message); this.on = false; Store.shared = false; }
    },
    async loadMe() {
      if (!this.user) { S.serverLikes = {}; return; }
      const { data } = await this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
      if (data) S.me = { name: data.name || data.handle, handle: data.handle, bio: data.bio || '', photo: data.avatar_url, placeholder: /^user[0-9a-f]{8}$/.test(data.handle) };
      const { data: lk } = await this.sb.from('likes').select('post_id').eq('user_id', this.user.id);
      S.serverLikes = Object.fromEntries((lk || []).map(r => ['s' + r.post_id, 1]));
    },
    async loadFeed() { const { data, error } = await this.sb.from('post_feed').select('*').order('created_at', { ascending: false }).limit(100); if (!error) S.remote = data || []; },
    async upload(dataUrl, name) {
      const blob = await (await fetch(dataUrl)).blob(); const path = `${this.user.id}/${name}.jpg`;
      const { error } = await this.sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }); if (error) throw error;
      return this.sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    },
  };
  function needSignIn(why) {
    sheet(`<h4>Join Smokies Live</h4><p class="fine" style="text-align:center;margin:0 0 14px">${esc(why)}</p><form class="pform"><label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="btn primary">Email me a sign-in link</button></form><p class="fine">No password. We send a one-time link. By joining you agree to keep posts respectful; posts can be reported and removed.</p>`, sh => {
      const f = sh.querySelector('form'); f.email.focus();
      f.onsubmit = async e => { e.preventDefault(); const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Sending…';
        const { error } = await Cloud.sb.auth.signInWithOtp({ email: f.email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) { b.disabled = false; b.textContent = 'Email me a sign-in link'; showToast(error.message.slice(0, 80)); return; }
        f.outerHTML = `<div class="empty">${svg('send', 'big')}<b>Check your email</b><span>Open the link on this device to finish signing in.</span></div>`; };
    });
  }
  const signedIn = () => Cloud.on && Cloud.user;
  function refresh() { drawUserPins(); if (S.view === 'feed') renderFeed(); if (S.view === 'profile') renderProfile(); renderSide(); }
  const color = h => { let x = 0; for (const ch of h || '') x = (x * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${x % 360} 45% 42%)`; };
  const authorOf = r => ({ name: r.name || r.handle, h: r.handle || 'someone', c: color(r.handle), i: (r.name || r.handle || '?').slice(0, 1).toUpperCase(), photo: r.avatar_url });
  const remoteItem = r => ({ id: 's' + r.id, kind: 'user', a: authorOf(r), t: r.created_at, img: r.image_url, text: r.caption, tag: r.tag, place: r.lng != null ? { name: r.place_name || 'Pinned spot', lng: r.lng, lat: r.lat } : null, likes: r.like_count, ncom: r.comment_count, mine: !!(Cloud.user && r.user_id === Cloud.user.id), ref: { id: 's' + r.id, sid: r.id, remote: true, img: r.image_url } });

  async function loadLocal() {
    S.me = await Store.get('me', null);
    S.posts = await Store.get('posts', []);
    S.likes = await Store.get('likes', {}); S.saved = await Store.get('saved', {}); S.comments = await Store.get('comments', {});
    S.seen = await Store.get('seen', 0);
    S.remote = []; S.serverLikes = {};
  }
  const persist = k => Store.set(k, S[k]);

  /* ---------- accounts for the live sources, so the feed reads like people you follow ---------- */
  const ACCTS = {
    'The Mountain Press': { h: 'mountainpress', c: '#c0392b', i: 'MP' }, 'WBIR 10News': { h: 'wbir', c: '#1f5fbf', i: '10' }, WVLT: { h: 'wvlt', c: '#e0731f', i: '8' },
    'WATE 6 On Your Side': { h: 'wate6', c: '#2a7de1', i: '6' }, 'National Park Service': { h: 'greatsmokynps', c: '#3b5d2a', i: 'NP' }, Gatlinburg: { h: 'gatlinburg', c: '#7a4fbf', i: 'G' },
    'TDOT SmartWay': { h: 'tdot', c: '#e8892b', i: 'TD' }, NCDOT: { h: 'ncdot', c: '#e8892b', i: 'NC' }, Weather: { h: 'smokies.weather', c: '#2f8fe0', i: '☁' }, Rivers: { h: 'smokies.rivers', c: '#2f8fe0', i: '≈' },
  };
  function acct(src) { const a = ACCTS[src]; if (a) return { name: src, ...a }; const h = String(src || 'local').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'local'; let x = 0; for (const ch of h) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return { name: src, h, c: `hsl(${x % 360} 45% 42%)`, i: (src || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() }; }
  const avatar = (a, size = 34, ring = false) => a.photo ? `<span class="av${ring ? ' ring' : ''}" style="width:${size}px;height:${size}px"><img src="${esc(a.photo)}" alt=""></span>` : `<span class="av${ring ? ' ring' : ''}" style="width:${size}px;height:${size}px;--c:${a.c}"><b style="font-size:${Math.round(size * 0.36)}px">${esc(a.i)}</b></span>`;
  function meAcct() { const m = S.me || {}; return { name: m.name || 'You', h: m.handle || 'you', c: '#d9772b', i: (m.name || 'You').slice(0, 1).toUpperCase(), photo: m.photo }; }

  /* ---------- the feed: your posts plus the live world, newest first ---------- */
  function feedItems() {
    const L = Live.st; const out = [];
    S.remote.forEach(r => out.push(remoteItem(r)));
    S.posts.forEach(p => out.push({ id: 'u' + p.id, kind: 'user', a: meAcct(), t: p.t, img: p.img, text: p.caption, place: p.place, tag: p.tag, mine: true, local: true, ref: p }));
    L.alerts.forEach((a, i) => out.push({ id: 'al' + i + (a.event || ''), kind: 'alert', a: acct('Weather'), t: a.sent || a.effective, card: 'alert', title: a.event, text: (a.description || a.headline || '').replace(/\s*\*\s*/g, ' ').slice(0, 400), place: null, refK: 'alert', refI: i }));
    L.traffic.cameras.forEach((c, i) => c.img && out.push({ id: 'cam' + c.id, kind: 'cam', a: acct(c.source), t: new Date().toISOString(), img: c.still ? c.img + '?r=' + Math.floor(Date.now() / 300000) : c.img, live: c.still || c.live, text: c.name + (c.still ? ' · new image every few minutes' : ''), place: { name: c.name.replace(/ Webcam$/, ''), lng: c.lng, lat: c.lat }, refK: 'cam', refI: i }));
    L.news.forEach((n, i) => out.push({ id: 'n' + n.id, kind: 'news', a: acct(n.source), t: n.published, img: n.img, card: n.img ? null : 'headline', title: n.title, text: n.summary && n.summary !== n.title ? n.summary : '', place: n.place, link: n.link, refK: 'news', refI: i }));
    L.events.forEach((n, i) => out.push({ id: 'e' + n.id, kind: 'event', a: acct(n.source), t: n.published || n.start, img: n.img, card: n.img ? null : 'event', title: n.title, text: n.summary, start: n.start, place: n.place, link: n.link, refK: 'event', refI: i }));
    L.traffic.incidents.forEach((n, i) => out.push({ id: 'r' + n.id, kind: 'road', a: acct(n.source), t: n.start, card: 'road', title: n.title, text: n.desc, place: n.place || (n.lng != null ? { name: n.road || 'Road', lng: n.lng, lat: n.lat } : null), link: n.link, refK: 'traffic', refI: i }));
    // mix it like a real feed: your posts and alerts first, then news with webcams and events woven in
    const by = k => out.filter(x => x.kind === k).sort((x, y) => new Date(y.t || 0) - new Date(x.t || 0));
    const head = [...by('user'), ...by('alert')], news = by('news'), cams = by('cam'), roads = by('road');
    const evs = out.filter(x => x.kind === 'event').sort((x, y) => Math.abs(new Date(x.start || x.t || 0) - Date.now()) - Math.abs(new Date(y.start || y.t || 0) - Date.now()));
    const mixed = [...head]; let n = 0;
    while (news.length || cams.length || evs.length || roads.length) {
      if (news.length) mixed.push(news.shift());
      n++;
      if (n % 3 === 0 && evs.length) mixed.push(evs.shift());
      if (n % 4 === 2 && cams.length) mixed.push(cams.shift());
      if (n % 5 === 4 && roads.length) mixed.push(roads.shift());
      if (!news.length) { mixed.push(...cams.splice(0), ...evs.splice(0), ...roads.splice(0)); }
    }
    return mixed.slice(0, 120);
  }
  function card(p, j) {
    const liked = !!(S.likes[p.id] || S.serverLikes[p.id]), saved = !!S.saved[p.id];
    let media = '';
    if (p.img) media = `<div class="media${p.live ? ' live' : ''}"><img loading="lazy" src="${esc(p.img)}" alt="" onerror="this.parentNode.classList.add('broken')">${p.live ? '<span class="badge">LIVE</span>' : ''}<i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'alert') media = `<div class="media txt alert"><div><small>National Weather Service</small><h3>${esc(p.title)}</h3><p>${esc(p.text.slice(0, 220))}</p></div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'event') { const d = p.start ? new Date(p.start) : null; media = `<div class="media txt event"><div>${d && !isNaN(d) ? `<span class="date"><b>${d.toLocaleDateString('en-US', { timeZone: TZ, day: 'numeric' })}</b>${d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short' })}</span>` : '<small>Event</small>'}<h3>${esc(p.title)}</h3>${p.place ? `<p>${svg('pin', 'sm')} ${esc(p.place.name)}</p>` : ''}</div><i class="burst">${svg('heart')}</i></div>`; }
    else if (p.card === 'road') media = `<div class="media txt road"><div><small>Roads</small><h3>${esc(p.title)}</h3><p>${esc((p.text || '').slice(0, 200))}</p></div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'headline') media = `<div class="media txt headline" style="--c:${p.a.c}"><div><small>${esc(p.a.name)}</small><h3>${esc(p.title)}</h3></div><i class="burst">${svg('heart')}</i></div>`;
    const cap = p.kind === 'news' || p.kind === 'event' ? (p.img ? `<b>${esc(p.title)}</b> ` : '') + esc((p.text || '').slice(0, 240)) : esc(p.text || '');
    const nC = p.ncom != null ? p.ncom : (S.comments[p.id] || []).length;
    const likeLine = p.likes != null ? (p.likes ? `<div class="likes">${p.likes.toLocaleString()} like${p.likes > 1 ? 's' : ''}</div>` : '') : liked ? '<div class="likes">You liked this</div>' : '';
    return `<article class="post" data-id="${esc(p.id)}" style="animation-delay:${Math.min(j, 6) * 60}ms">
      <header>${avatar(p.a, 32, p.kind === 'cam' || p.kind === 'alert')}<div class="who"><b>${esc(p.a.h)}</b>${p.place ? `<button class="loc" data-act="map">${esc(p.place.name)}</button>` : ''}</div><span class="when">${ago(p.t)}</span><button class="ib" data-act="more" aria-label="More">${svg('more')}</button></header>
      ${media}
      <div class="acts"><button class="ib like${liked ? ' on' : ''}" data-act="like" aria-label="Like" aria-pressed="${liked}">${svg('heart')}</button><button class="ib" data-act="comment" aria-label="Comment">${svg('comment')}</button><button class="ib" data-act="share" aria-label="Share">${svg('send')}</button>${p.place ? `<button class="ib" data-act="map" aria-label="See on map">${svg('pin')}</button>` : ''}<span class="sp"></span><button class="ib save${saved ? ' on' : ''}" data-act="save" aria-label="Save">${svg('save')}</button></div>
      ${likeLine}${p.tag ? `<div class="ptag">#${esc(p.tag.toLowerCase())}</div>` : ''}
      ${cap ? `<div class="cap"><b>${esc(p.a.h)}</b> ${cap}</div>` : ''}
      ${p.link ? `<a class="more" href="${esc(p.link)}" target="_blank" rel="noopener">${p.kind === 'news' ? 'Read the full story' : 'More details'}</a>` : ''}
      ${nC ? `<button class="more" data-act="comment">View ${nC} comment${nC > 1 ? 's' : ''}</button>` : ''}
    </article>`;
  }

  /* ---------- stories: the live world as tap-through slides ---------- */
  function buildStories() {
    const L = Live.st; const st = [];
    if (S.posts.length) st.push({ a: meAcct(), label: 'Your story', slides: S.posts.slice(0, 8).map(p => ({ img: p.img, text: p.caption, place: p.place, t: p.t })) });
    if (L.wx) { const c = L.wx.current; st.push({ a: acct('Weather'), label: 'Weather', slides: [{ wx: true, title: `${Math.round(c.temperature_2m)}° in Gatlinburg`, text: `Feels like ${Math.round(c.apparent_temperature)}°. Wind ${Math.round(c.wind_speed_10m)} mph, gusts ${Math.round(c.wind_gusts_10m)}. ${Math.round(c.cloud_cover)}% cloud cover.${L.grid && L.grid.summit ? ` Le Conte summit ${Math.round(L.grid.summit.temperature_2m)}°.` : ''}`, fly: { center: [-83.47, 35.64], zoom: 11.2, pitch: 74, bearing: 200 } }] }); }
    if (L.alerts.length) st.push({ a: acct('Weather'), label: 'Alerts', hot: true, slides: L.alerts.map(a => ({ alert: true, title: a.event, text: (a.headline || '').slice(0, 220) })) });
    L.traffic.cameras.filter(c => c.img && (c.still || c.live)).forEach(c => st.push({ a: { ...acct(c.source), photo: c.img }, label: c.name.replace(/ Webcam$/, ''), slides: [{ img: c.still ? c.img + '?r=' + Math.floor(Date.now() / 300000) : c.img, title: c.name, live: true, place: { name: c.name, lng: c.lng, lat: c.lat } }] }));
    const today = L.events.filter(e => e.place).slice(0, 8);
    if (today.length) st.push({ a: acct('Gatlinburg'), label: 'Events', slides: today.map(e => ({ img: e.img, title: e.title, text: e.place.name, place: e.place })) });
    const risers = L.gauges.filter(g => g.cfs24 && g.cfs24.length > 3 && g.cfs24[g.cfs24.length - 1] > g.cfs24[g.cfs24.length - 4] * 1.15);
    if (L.gauges.length) st.push({ a: acct('Rivers'), label: 'Rivers', hot: risers.length > 0, slides: [{ title: risers.length ? `${risers.length} river${risers.length > 1 ? 's' : ''} rising` : 'Rivers steady', text: L.gauges.slice(0, 5).map(g => `${g.name.replace(/ (NR|AT|AB|BL) .*/, '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}: ${g.cfs != null ? Math.round(g.cfs).toLocaleString() + ' cfs' : ''}`).join('\n') }] });
    if (sky.sun) st.push({ a: { name: 'Sky', h: 'smokies.sky', c: '#33406b', i: '☾' }, label: 'Tonight', slides: [{ title: sky.sun.alt > 0 ? 'Sunset is coming' : 'The sky right now', text: `${phaseName(sky.sun.alt)}. ${moonName(sky.illum.phase)}, ${Math.round(sky.illum.frac * 100)}% lit.${Live.st.iss && Live.st.iss.alt > 0 ? ' The space station is overhead.' : ''}`, fly: { center: [-83.50, 35.60], zoom: 11, pitch: 80, bearing: 180 }, night: true }] });
    S.stories = st;
  }
  function renderStories() {
    const el = $('#stories'); if (!el) return;
    el.innerHTML = `<button class="story add" data-s="add">${avatar(meAcct(), 62)}<i>+</i><span>Post</span></button>` + S.stories.map((s, i) => `<button class="story${s.hot ? ' hot' : ''}" data-s="${i}">${avatar(s.a, 62, true)}<span>${esc(s.label)}</span></button>`).join('');
    el.querySelectorAll('.story').forEach(b => b.onclick = () => b.dataset.s === 'add' ? openCreate() : openStory(+b.dataset.s));
  }
  let storyT = 0;
  function openStory(i, k = 0) {
    const s = S.stories[i]; if (!s) return closeStory();
    S.storyAt = i; const sl = s.slides[k]; if (!sl) return openStory(i + 1, 0);
    const v = $('#storyView'); v.hidden = false;
    v.innerHTML = `<div class="bars">${s.slides.map((_, j) => `<i class="${j < k ? 'done' : j === k ? 'run' : ''}"><b></b></i>`).join('')}</div>
      <header>${avatar(s.a, 32)}<b>${esc(s.a.h)}</b><span>${sl.t ? ago(sl.t) : 'live'}</span><button class="ib" data-x aria-label="Close">${svg('close')}</button></header>
      <div class="slide ${sl.alert ? 'alert' : sl.night ? 'night' : sl.wx ? 'wx' : ''}">${sl.img ? `<img src="${esc(sl.img)}" alt="">` : ''}<div class="txt">${sl.live ? '<span class="badge">LIVE</span>' : ''}${sl.title ? `<h3>${esc(sl.title)}</h3>` : ''}${sl.text ? `<p>${esc(sl.text).replace(/\n/g, '<br>')}</p>` : ''}${sl.place || sl.fly ? `<button class="btn primary" data-go>${svg('pin', 'sm')} See it on the map</button>` : ''}</div></div>
      <button class="tap l" aria-label="Previous"></button><button class="tap r" aria-label="Next"></button>`;
    v.querySelector('[data-x]').onclick = closeStory;
    v.querySelector('.tap.l').onclick = () => k > 0 ? openStory(i, k - 1) : openStory(Math.max(0, i - 1), 0);
    v.querySelector('.tap.r').onclick = () => openStory(i, k + 1);
    const go = v.querySelector('[data-go]'); if (go) go.onclick = () => { closeStory(); setView('map'); stopOrbit(); map.flyTo({ ...(sl.fly || { center: [sl.place.lng, sl.place.lat], zoom: 14, pitch: 62 }), duration: 3000, curve: 1.5, easing: easeInOut, essential: true }); };
    // swipe down to close
    let y0 = null; v.ontouchstart = e => y0 = e.touches[0].clientY; v.ontouchend = e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) closeStory(); y0 = null; };
    clearTimeout(storyT); storyT = setTimeout(() => openStory(i, k + 1), sl.img ? 6000 : 5000);
  }
  function closeStory() { clearTimeout(storyT); const v = $('#storyView'); v.classList.add('out'); setTimeout(() => { v.hidden = true; v.classList.remove('out'); v.innerHTML = ''; }, 280); }

  /* ---------- views ---------- */
  function shell() {
    const nav = document.createElement('nav'); nav.id = 'tabbar'; nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = `<div class="logo">${'<svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><path d="M2 24 L10 13 L14 18 L20 8 L28 24 Z" fill="#f2a65a"/><path d="M2 24 L8 19 L13 22 L19 16 L28 24 Z" fill="#9cc0e0" opacity=".85"/></svg>'}<span>Smokies <em>Live</em></span></div>` +
      [['feed', 'home', 'Home'], ['map', 'map', 'Map'], ['create', 'plus', 'Post'], ['activity', 'heart', 'Activity'], ['profile', 'user', 'Profile']].map(([k, ic, l]) => `<button data-v="${k}" aria-label="${l}"${k === 'map' ? ' aria-current="page"' : ''}>${k === 'profile' ? `<span class="me">${svg(ic)}</span>` : svg(ic)}<span>${l}</span>${k === 'activity' ? '<i class="dot" hidden></i>' : ''}</button>`).join('');
    document.body.appendChild(nav);
    nav.querySelectorAll('button').forEach(b => b.onclick = () => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); b.dataset.v === 'create' ? openCreate() : setView(b.dataset.v); });
    const v = document.createElement('div'); v.id = 'socialView'; v.hidden = true;
    v.innerHTML = `<div class="col"><div id="sv-feed" class="pane"><header class="top"><div class="logo"><span>Smokies <em>Live</em></span></div><button class="ib" data-v="activity" aria-label="Activity">${svg('heart')}</button></header><div id="stories" class="stories"></div><div id="feed"></div></div>
      <div id="sv-activity" class="pane"></div><div id="sv-profile" class="pane"></div></div><aside class="side" id="sv-side"></aside>`;
    document.body.appendChild(v);
    v.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
    const st = document.createElement('div'); st.id = 'storyView'; st.hidden = true; document.body.appendChild(st);
    const cr = document.createElement('div'); cr.id = 'createView'; cr.hidden = true; document.body.appendChild(cr);
    const sh = document.createElement('div'); sh.id = 'sheetView'; sh.hidden = true; document.body.appendChild(sh);
    $('#feed').addEventListener('click', onFeedClick);
    $('#feed').addEventListener('dblclick', e => { const m = e.target.closest('.media'); if (m) { const id = m.closest('.post').dataset.id; if (S.likes[id] || S.serverLikes[id]) { const h = m.querySelector('.burst'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } else like(id, true, m); } });
    let lastTap = 0; $('#feed').addEventListener('touchend', e => { const m = e.target.closest('.media'); if (!m) return; const n = Date.now(); if (n - lastTap < 300) { const id = m.closest('.post').dataset.id; if (!(S.likes[id] || S.serverLikes[id])) like(id, true, m); else { const h = m.querySelector('.burst'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } e.preventDefault(); } lastTap = n; });
  }
  function setView(v) {
    S.view = v; document.body.dataset.view = v;
    document.querySelectorAll('#tabbar button').forEach(b => b.toggleAttribute('aria-current', b.dataset.v === v));
    const sv = $('#socialView');
    if (v === 'map') { sv.classList.add('out'); setTimeout(() => { if (S.view === 'map') { sv.hidden = true; sv.classList.remove('out'); } }, 300); return; }
    sv.hidden = false; sv.classList.remove('out');
    ['feed', 'activity', 'profile'].forEach(k => $('#sv-' + k).hidden = k !== v);
    if (v === 'feed') renderFeed(); if (v === 'activity') renderActivity(); if (v === 'profile') renderProfile();
    renderSide(); sv.scrollTop = 0;
    if (typeof closeMobile === 'function') closeMobile();
    if ($('#lcard')) $('#lcard').hidden = true;
  }
  let feedCache = [];
  function renderFeed() { buildStories(); renderStories(); feedCache = feedItems(); const f = $('#feed'); f.innerHTML = feedCache.length ? feedCache.map(card).join('') : `<div class="empty">${Live.st.blocked ? `The feed needs live data, which this preview blocks. Open <a href="${SITE}" target="_blank" rel="noopener">the full site</a>.` : 'Loading the latest from the mountains…'}</div>`; }
  function renderSide() {
    const L = Live.st; const el = $('#sv-side'); if (!el) return;
    const me = meAcct();
    el.innerHTML = `<div class="meRow">${avatar(me, 44)}<div><b>${esc(me.h)}</b><span>${esc(me.name)}</span></div><button class="link" data-p>${S.me ? 'Edit' : 'Set up'}</button></div>
      ${L.wx ? `<div class="sideCard"><small>Right now</small><b>${Math.round(L.wx.current.temperature_2m)}° · ${esc(document.getElementById('wxDesc') ? document.getElementById('wxDesc').querySelector('b')?.textContent || '' : '')}</b><span>${L.alerts.length ? esc(L.alerts[0].event) : 'No weather alerts'}</span></div>` : ''}
      <div class="sideHead">Accounts in your feed</div>${[...new Set([...L.news.map(n => n.source), ...L.events.map(e => e.source)])].slice(0, 6).map(s => { const a = acct(s); return `<div class="meRow sm">${avatar(a, 32)}<div><b>${esc(a.h)}</b><span>${esc(s)}</span></div></div>`; }).join('')}
      <p class="fine">Smokies Live · open data from NWS, USGS, NASA, the National Park Service and local newsrooms.</p>`;
    const p = el.querySelector('[data-p]'); if (p) p.onclick = editProfile;
  }
  function onFeedClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return; const id = b.closest('.post').dataset.id; const p = feedCache.find(x => x.id === id); if (!p) return;
    const act = b.dataset.act;
    if (act === 'like') like(id, !(S.likes[id] || S.serverLikes[id]), b.closest('.post').querySelector('.media'));
    if (act === 'save') { S.saved[id] = !S.saved[id]; if (!S.saved[id]) delete S.saved[id]; persist('saved'); b.classList.toggle('on', !!S.saved[id]); bump(b); }
    if (act === 'share') share(p);
    if (act === 'map') showOnMap(p);
    if (act === 'comment') openComments(p);
    if (act === 'more') openMore(p);
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function like(id, on, media) {
    const p = feedCache.find(x => x.id === id);
    if (p && p.ref && p.ref.remote) {
      if (!signedIn()) return needSignIn('Sign in to like posts and join the conversation.');
      if (on) { S.serverLikes[id] = 1; p.likes = (p.likes || 0) + 1; Cloud.sb.from('likes').insert({ post_id: p.ref.sid }).then(() => {}); }
      else { delete S.serverLikes[id]; p.likes = Math.max(0, (p.likes || 1) - 1); Cloud.sb.from('likes').delete().eq('post_id', p.ref.sid).eq('user_id', Cloud.user.id).then(() => {}); }
      const post = document.querySelector(`.post[data-id="${CSS.escape(id)}"]`); if (!post) return;
      const btn = post.querySelector('.like'); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); bump(btn);
      let lk = post.querySelector('.likes'); if (!lk && p.likes) { lk = document.createElement('div'); lk.className = 'likes'; post.querySelector('.acts').after(lk); } if (lk) { if (p.likes) lk.textContent = `${p.likes.toLocaleString()} like${p.likes > 1 ? 's' : ''}`; else lk.remove(); }
      if (on && media) { const h = media.querySelector('.burst'); if (h) { h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } }
      return;
    }
    if (on) S.likes[id] = Date.now(); else delete S.likes[id]; persist('likes');
    const post = document.querySelector(`.post[data-id="${CSS.escape(id)}"]`); if (!post) return;
    const btn = post.querySelector('.like'); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); bump(btn);
    let lk = post.querySelector('.likes'); if (on && !lk) { lk = document.createElement('div'); lk.className = 'likes'; lk.textContent = 'You liked this'; post.querySelector('.acts').after(lk); } else if (!on && lk) lk.remove();
    if (on && media) { const h = media.querySelector('.burst'); if (h) { h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } }
  }
  async function share(p) {
    const url = SITE + '#post=' + encodeURIComponent(p.id); const title = p.title || p.text || 'Smokies Live';
    try { if (navigator.share) { await navigator.share({ title, text: p.place ? `${title} · ${p.place.name}` : title, url: p.link || url }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(p.link || url); showToast('Link copied'); } catch (e) { showToast('Sharing is not available here'); }
  }
  function showOnMap(p) {
    setView('map');
    if (p.refK) { Live.focus(p.refK, p.refI); return; }
    if (p.place) { stopOrbit(); map.flyTo({ center: [p.place.lng, p.place.lat], zoom: 15.2, pitch: 62, duration: 2800, curve: 1.4, easing: easeInOut, essential: true }); setTimeout(() => focusPin(p.ref && p.ref.id), 2900); }
  }
  function sheet(html, onReady) {
    const s = $('#sheetView'); s.hidden = false; s.innerHTML = `<div class="scrim" data-x></div><div class="sheet"><i class="grab"></i>${html}</div>`;
    s.querySelectorAll('[data-x]').forEach(x => x.onclick = closeSheet);
    let y0 = null; const sh = s.querySelector('.sheet'); sh.ontouchstart = e => { if (sh.scrollTop <= 0) y0 = e.touches[0].clientY; }; sh.ontouchend = e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) closeSheet(); y0 = null; };
    if (onReady) onReady(s);
  }
  function closeSheet() { const s = $('#sheetView'); s.classList.add('out'); setTimeout(() => { s.hidden = true; s.classList.remove('out'); s.innerHTML = ''; }, 260); }
  async function openComments(p) {
    if (p.ref && p.ref.remote) {
      const { data } = await Cloud.sb.from('comments').select('id,body,created_at,user_id,profiles(handle,name,avatar_url)').eq('post_id', p.ref.sid).order('created_at');
      sheet(`<h4>Comments</h4><div class="clist">${(data || []).length ? data.map(c => `<div class="cm">${avatar(authorOf(c.profiles || {}), 30)}<div><b>${esc((c.profiles || {}).handle || 'someone')}</b> ${esc(c.body)}<small>${ago(c.created_at)}</small></div></div>`).join('') : '<p class="fine">No comments yet. Start the conversation.</p>'}</div>
        <form class="cform">${avatar(meAcct(), 30)}<input name="c" placeholder="${signedIn() ? 'Add a comment…' : 'Sign in to comment'}" autocomplete="off" maxlength="400"><button class="link">Post</button></form>`, sh => {
        const f = sh.querySelector('form');
        f.onsubmit = async e => { e.preventDefault(); if (!signedIn()) return needSignIn('Sign in to comment.'); const t = f.c.value.trim(); if (!t) return; const { error } = await Cloud.sb.from('comments').insert({ post_id: p.ref.sid, body: t }); if (error) return showToast('Could not post the comment'); p.ncom = (p.ncom || 0) + 1; closeSheet(); setTimeout(() => openComments(p), 300); };
      });
      return;
    }
    const list = S.comments[p.id] || [];
    sheet(`<h4>Comments</h4><div class="clist">${list.length ? list.map(c => `<div class="cm">${avatar(meAcct(), 30)}<div><b>${esc(meAcct().h)}</b> ${esc(c.text)}<small>${ago(c.t)}</small></div></div>`).join('') : '<p class="fine">No comments yet.</p>'}</div>
      <p class="fine">${Store.shared ? '' : 'Comments are saved on this device for now. They become public once shared accounts are switched on.'}</p>
      <form class="cform">${avatar(meAcct(), 30)}<input name="c" placeholder="Add a comment…" autocomplete="off" maxlength="400"><button class="link">Post</button></form>`, s => {
      const f = s.querySelector('form'); f.querySelector('input').focus();
      f.onsubmit = e => { e.preventDefault(); const t = f.c.value.trim(); if (!t) return; (S.comments[p.id] = S.comments[p.id] || []).push({ text: t, t: new Date().toISOString() }); persist('comments'); closeSheet(); renderFeed(); };
    });
  }
  function openMore(p) {
    const mine = !!p.mine;
    sheet(`<div class="menu">${p.place ? '<button data-m="map">See on map</button>' : ''}<button data-m="share">Share</button>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Open original</a>` : ''}${mine ? '<button data-m="del" class="danger">Delete post</button>' : '<button data-m="report" class="danger">Report</button>'}<button data-x>Cancel</button></div>`, s => {
      s.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
        const m = b.dataset.m; closeSheet();
        if (m === 'map') showOnMap(p); if (m === 'share') share(p);
        if (m === 'del') {
          if (p.ref.remote) { const { error } = await Cloud.sb.from('posts').delete().eq('id', p.ref.sid); if (error) return showToast('Could not delete'); if (p.ref.img && p.ref.img.includes('/photos/')) Cloud.sb.storage.from('photos').remove([p.ref.img.split('/photos/')[1]]); await Cloud.loadFeed(); }
          else { S.posts = S.posts.filter(x => x.id !== p.ref.id); await persist('posts'); }
          refresh(); showToast('Post deleted');
        }
        if (m === 'report') {
          if (p.ref && p.ref.remote) { if (!signedIn()) return needSignIn('Sign in to report a post.'); await Cloud.sb.from('reports').insert({ post_id: p.ref.sid, reason: 'reported from app' }); showToast('Thanks. A moderator will review it.'); }
          else showToast('Thanks for the report.');
        }
      });
    });
  }

  /* ---------- create a post: photo, caption, place ---------- */
  const TAGS = ['Sighting', 'Wildlife', 'Trail', 'Weather', 'Traffic', 'Event', 'Food', 'View'];
  let draft = null;
  function openCreate() {
    draft = { img: null, caption: '', tag: null, place: { name: placeName(map.getCenter()), lng: map.getCenter().lng, lat: map.getCenter().lat } };
    const v = $('#createView'); v.hidden = false; v.classList.remove('out');
    v.innerHTML = `<div class="cbox"><header><button class="ib" data-x aria-label="Close">${svg('close')}</button><b>New post</b><button class="link" data-share disabled>Share</button></header>
      <label class="pick"><input type="file" accept="image/*" hidden><div class="ph">${svg('camera', 'big')}<span>Add a photo</span><small>Take one or choose from your library</small></div></label>
      <div class="fields"><textarea maxlength="800" placeholder="Write a caption…" rows="3"></textarea>
      <div class="tags">${TAGS.map(t => `<button data-t="${t}">${t}</button>`).join('')}</div>
      <div class="where">${svg('pin')}<div><b id="crPlace">${esc(draft.place.name)}</b><small>Where this is. Drag the map later to adjust.</small></div><button class="link" data-gps>${svg('locate', 'sm')} Here</button><button class="link" data-pickmap>Pick on map</button></div>
      <p class="fine">${Store.shared ? (signedIn() ? 'Your post is public and appears on everyone\'s map. Keep it kind and safe: no faces of strangers, no exact locations of wildlife dens or nests.' : 'You will be asked to sign in when you share.') : 'For now your posts are saved on this device and shown on your map.'}</p></div></div>`;
    const inp = v.querySelector('input[type=file]'), shareB = v.querySelector('[data-share]');
    const ready = () => shareB.disabled = !(draft.img || draft.caption.trim());
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; draft.img = await shrink(f); v.querySelector('.ph').outerHTML = `<img class="prev" src="${draft.img}" alt="">`; ready(); };
    v.querySelector('textarea').oninput = e => { draft.caption = e.target.value; ready(); };
    v.querySelectorAll('.tags button').forEach(b => b.onclick = () => { draft.tag = draft.tag === b.dataset.t ? null : b.dataset.t; v.querySelectorAll('.tags button').forEach(x => x.classList.toggle('on', x.dataset.t === draft.tag)); });
    v.querySelector('[data-x]').onclick = closeCreate;
    v.querySelector('[data-gps]').onclick = () => { if (!navigator.geolocation) return showToast('Location is not available'); navigator.geolocation.getCurrentPosition(p => { draft.place = { lng: p.coords.longitude, lat: p.coords.latitude, name: placeName({ lng: p.coords.longitude, lat: p.coords.latitude }) }; $('#crPlace').textContent = draft.place.name; }, () => showToast('Could not get your location'), { enableHighAccuracy: true, timeout: 10000 }); };
    v.querySelector('[data-pickmap]').onclick = () => { v.classList.add('picking'); document.body.classList.add('picking'); showToast('Tap the map where this happened'); map.once('click', e => { draft.place = { lng: e.lngLat.lng, lat: e.lngLat.lat, name: placeName(e.lngLat) }; $('#crPlace').textContent = draft.place.name; v.classList.remove('picking'); document.body.classList.remove('picking'); }); };
    shareB.onclick = publish;
  }
  function closeCreate() { const v = $('#createView'); v.classList.add('out'); setTimeout(() => { v.hidden = true; v.innerHTML = ''; }, 280); }
  function shrink(file) { // phone photos are huge: keep 1080 px on the long side
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1080 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.84)); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  function placeName(ll) { // nearest named place from the search index, else coordinates
    let best = null, bd = 1e9; const idx = window.__placeIndex || [];
    for (const p of idx) { const d = (p[1] - ll.lng) ** 2 * 0.66 + (p[2] - ll.lat) ** 2; if (d < bd) { bd = d; best = p; } }
    return best && bd < 0.0009 ? best[0] : `${ll.lat.toFixed(4)}°N ${Math.abs(ll.lng).toFixed(4)}°W`;
  }
  async function publish() {
    if (Cloud.on) {
      if (!signedIn()) return needSignIn('Sign in to share your post with everyone.');
      const b = $('#createView [data-share]'); b.disabled = true; b.textContent = 'Sharing…';
      try {
        const id = (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36);
        const image_url = draft.img ? await Cloud.upload(draft.img, id) : null;
        const { error } = await Cloud.sb.from('posts').insert({ caption: draft.caption.trim().slice(0, 800), tag: draft.tag, image_url, place_name: draft.place.name.slice(0, 120), lng: draft.place.lng, lat: draft.place.lat });
        if (error) throw error;
        await Cloud.loadFeed(); closeCreate(); setView('feed'); drawUserPins(); showToast('Posted');
        requestAnimationFrame(() => { const el = document.querySelector('#feed .post'); if (el) el.classList.add('fresh'); });
      } catch (e) { b.disabled = false; b.textContent = 'Share'; showToast('Could not post: ' + String(e.message || e).slice(0, 60)); }
      return;
    }
    const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), img: draft.img, caption: draft.caption.trim().slice(0, 800), tag: draft.tag, place: draft.place };
    S.posts.unshift(p); await persist('posts');
    closeCreate(); drawUserPins(); setView('feed'); showToast('Posted');
    requestAnimationFrame(() => { const el = document.querySelector('.post[data-id="u' + p.id + '"]'); if (el) el.classList.add('fresh'); });
  }

  /* ---------- your posts as round photo pins on the map ---------- */
  function drawUserPins() {
    S.pins.forEach(m => m.remove()); S.pins = [];
    [...S.remote.map(r => ({ id: 's' + r.id, img: r.image_url, caption: r.caption, place: r.lng != null ? { lng: r.lng, lat: r.lat } : null, fid: 's' + r.id })), ...S.posts.map(p => ({ ...p, fid: 'u' + p.id }))].forEach(p => {
      if (!p.place) return;
      const box = document.createElement('div'); box.className = 'ppin'; box.dataset.id = p.id;
      box.innerHTML = p.img ? `<img src="${p.img}" alt="">` : `<b>${esc((p.caption || '•').slice(0, 1))}</b>`;
      box.onclick = e => { e.stopPropagation(); setView('feed'); requestAnimationFrame(() => { const el = document.querySelector(`.post[data-id="${p.fid}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('fresh'); } }); };
      S.pins.push(new maplibregl.Marker({ element: box, anchor: 'bottom' }).setLngLat([p.place.lng, p.place.lat]).addTo(map));
    });
  }
  function focusPin(id) { const el = document.querySelector(`.ppin[data-id="${id}"]`); if (el) { el.classList.remove('focus'); void el.offsetWidth; el.classList.add('focus'); } }

  /* ---------- activity and profile ---------- */
  function renderActivity() {
    const L = Live.st; const since = S.seen || 0; const rows = [];
    L.alerts.forEach((a, i) => rows.push({ t: a.sent, a: acct('Weather'), html: `<b>${esc(a.event)}</b> ${esc((a.headline || '').slice(0, 120))}`, k: 'alert', i }));
    L.traffic.incidents.forEach((n, i) => rows.push({ t: n.start, a: acct(n.source), html: `<b>${esc(n.title)}</b> ${esc((n.desc || '').slice(0, 100))}`, k: 'traffic', i }));
    L.news.slice(0, 15).forEach((n, i) => rows.push({ t: n.published, a: acct(n.source), html: `posted <b>${esc(n.title)}</b>`, k: 'news', i, img: n.img }));
    Object.keys(S.likes).length && rows.push({ t: new Date(Math.max(...Object.values(S.likes))).toISOString(), a: meAcct(), html: `You liked ${Object.keys(S.likes).length} post${Object.keys(S.likes).length > 1 ? 's' : ''}` });
    rows.sort((x, y) => new Date(y.t || 0) - new Date(x.t || 0));
    const newer = rows.filter(r => new Date(r.t || 0) > since), older = rows.filter(r => !(new Date(r.t || 0) > since));
    const row = r => `<button class="arow" ${r.k ? `data-k="${r.k}" data-i="${r.i}"` : ''}>${avatar(r.a, 40)}<div>${r.html}<small>${ago(r.t)}</small></div>${r.img ? `<img src="${esc(r.img)}" alt="" onerror="this.remove()">` : ''}</button>`;
    $('#sv-activity').innerHTML = `<header class="top"><b class="title">Activity</b></header>${newer.length ? '<div class="sideHead">New</div>' + newer.map(row).join('') : ''}<div class="sideHead">Earlier</div>${older.map(row).join('') || '<p class="fine">Nothing yet.</p>'}`;
    $('#sv-activity').querySelectorAll('.arow[data-k]').forEach(b => b.onclick = () => { setView('map'); Live.focus(b.dataset.k, +b.dataset.i); });
    S.seen = Date.now(); persist('seen'); $('#tabbar .dot').hidden = true;
  }
  function renderProfile() {
    const me = meAcct();
    const L = signedIn() ? S.remote.filter(r => r.user_id === Cloud.user.id).map(r => ({ id: 's' + r.id, img: r.image_url, caption: r.caption, place: r.lng != null ? { name: r.place_name, lng: r.lng, lat: r.lat } : null })).concat(S.posts) : S.posts;
    $('#sv-profile').innerHTML = `<header class="top"><b class="title">${esc(me.h)}</b></header>
      <div class="prof">${avatar(me, 86)}<div class="nums"><div><b>${L.length}</b><span>posts</span></div><div><b>${Object.keys(S.likes).length}</b><span>liked</span></div><div><b>${Object.keys(S.saved).length}</b><span>saved</span></div></div></div>
      <div class="bio"><b>${esc(me.name)}</b>${S.me && S.me.bio ? `<p>${esc(S.me.bio)}</p>` : ''}</div>
      <div class="prow">${Cloud.on && !signedIn() ? '<button class="btn primary" data-in>Sign in or join</button>' : `<button class="btn" data-edit>${S.me && !S.me.placeholder ? 'Edit profile' : 'Set up your profile'}</button>`}<button class="btn" data-new>New post</button>${signedIn() ? '<button class="btn" data-out>Sign out</button>' : ''}</div>
      <div class="ptabs"><button aria-selected="true">${svg('grid', 'sm')}</button></div>
      <div class="pgrid">${L.length ? L.map(p => `<button data-id="${p.id}">${p.img ? `<img src="${p.img}" alt="">` : `<span>${esc((p.caption || '').slice(0, 60))}</span>`}</button>`).join('') : `<div class="empty" style="grid-column:1/-1">${svg('camera', 'big')}<b>Share your first photo</b><span>Waterfalls, wildlife, traffic, sunsets. Every post lands on the map.</span></div>`}</div>`;
    const v = $('#sv-profile');
    const q = k => v.querySelector(k);
    if (q('[data-edit]')) q('[data-edit]').onclick = editProfile; q('[data-new]').onclick = openCreate;
    if (q('[data-in]')) q('[data-in]').onclick = () => needSignIn('Post photos, like and comment with everyone in the Smokies.');
    if (q('[data-out]')) q('[data-out]').onclick = async () => { await Cloud.sb.auth.signOut(); S.me = await Store.get('me', null); refresh(); };
    v.querySelectorAll('.pgrid button[data-id]').forEach(b => b.onclick = () => { const p = L.find(x => x.id === b.dataset.id); if (p && p.place) showOnMap({ place: p.place, ref: { id: p.id } }); });
  }
  function editProfile() {
    const m = S.me || {};
    sheet(`<h4>Your profile</h4><form class="pform"><label class="avpick"><input type="file" accept="image/*" hidden>${avatar(meAcct(), 72)}<span class="link">Change photo</span></label>
      <label>Name<input name="name" value="${esc(m.name || '')}" maxlength="40" placeholder="Your name"></label>
      <label>Username<input name="handle" value="${esc(m.handle || '')}" maxlength="24" placeholder="username" pattern="[a-z0-9._]+"></label>
      <label>Bio<textarea name="bio" maxlength="160" rows="2" placeholder="Sevierville local, trail runner…">${esc(m.bio || '')}</textarea></label>
      <button class="btn primary">Save</button></form>`, s => {
      const f = s.querySelector('form'); let photo = m.photo || null;
      f.querySelector('input[type=file]').onchange = async e => { const file = e.target.files[0]; if (!file) return; photo = await shrink(file); f.querySelector('.av').outerHTML = `<span class="av" style="width:72px;height:72px"><img src="${photo}" alt=""></span>`; };
      f.handle.oninput = () => { f.handle.value = f.handle.value.toLowerCase().replace(/[^a-z0-9._]/g, ''); };
      f.onsubmit = async e => {
        e.preventDefault();
        const me = { name: f.name.value.trim() || 'You', handle: f.handle.value.trim() || 'you', bio: f.bio.value.trim(), photo };
        if (signedIn()) {
          try {
            if (photo && photo.startsWith('data:')) me.photo = await Cloud.upload(photo, 'avatar-' + Date.now());
            const { error } = await Cloud.sb.from('profiles').update({ name: me.name, handle: me.handle, bio: me.bio, avatar_url: me.photo }).eq('id', Cloud.user.id);
            if (error) return showToast(/duplicate|unique/i.test(error.message) ? 'That username is taken' : 'Could not save: ' + error.message.slice(0, 60));
            await Cloud.loadMe(); await Cloud.loadFeed();
          } catch (err) { return showToast('Could not save the photo'); }
        } else { S.me = me; await persist('me'); }
        closeSheet(); refresh(); setView(S.view === 'map' ? 'profile' : S.view);
      };
    });
  }

  /* ---------- start ---------- */
  async function init() {
    await loadLocal();
    shell(); document.body.dataset.view = 'map';
    drawUserPins();
    Cloud.init().then(() => { if (Cloud.on) refresh(); });
    fetch(BASE + 'search.json').then(r => r.json()).then(j => { window.__placeIndex = j.filter(p => p[4] === 1 || p[4] === 0 || /park|trail|waterfall|historic|campground|attraction|amusement/.test(p[3])); }).catch(() => {});
    // new activity dot once feeds arrive
    setInterval(() => { const L = Live.st; const latest = Math.max(0, ...L.news.map(n => +new Date(n.published || 0)), ...L.alerts.map(a => +new Date(a.sent || 0))); $('#tabbar .dot').hidden = !(latest > (S.seen || 0)) || S.view === 'activity'; if (S.view === 'feed' && !document.querySelector('#feed .post')) renderFeed(); }, 5000);
    const h = decodeURIComponent(location.hash || '');
    if (h.startsWith('#post=')) setTimeout(() => { setView('feed'); const el = document.querySelector(`.post[data-id="${CSS.escape(h.slice(6))}"]`); if (el) el.scrollIntoView({ block: 'center' }); }, 4000);
    if (h === '#feed') setView('feed');
  }
  return { init, S, setView, openCreate, Store, Cloud };
})();
