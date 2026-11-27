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
  const S = { view: 'map', posts: [], likes: {}, saved: {}, comments: {}, me: null, stories: [], storyAt: 0, pins: [], seen: 0, votes: {}, rvotes: {}, filter: 'all', here: null, groups: [], scope: 'public', signed: {} };
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
    back: '<path d="M15 5l-7 7 7 7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.3 3.3 0 0 1 0 6.6M17.5 14.2a6 6 0 0 1 4 5.8"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
  };
  const svg = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

  /* ---------- storage: device-only for now (IndexedDB, falls back to memory) ---------- */
  const Store = (() => {
    let dbp = null; const mem = {};
    // if IndexedDB never answers (seen in some embedded and headless browsers), fall back to memory after 2.5 s
    const open = () => dbp || (dbp = Promise.race([new Promise((_, rej) => setTimeout(() => rej(new Error('idb timeout')), 2500)), new Promise((res, rej) => { try { const r = indexedDB.open('smokies-social', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } })]));
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
        this.sb.auth.onAuthStateChange(async (ev, ses) => { const was = this.user && this.user.id; this.user = ses ? ses.user : null; if ((this.user && this.user.id) !== was) { await this.loadMe(); await this.loadGroups(); await this.loadFeed(); refresh(); if (ev === 'SIGNED_IN') { showToast('Signed in'); pendingJoin(); } } });
        await this.loadMe(); await this.loadGroups(); await this.loadFeed();
        this.sb.channel('posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => this.loadFeed().then(refresh)).subscribe();
        if (!this.votesOff) this.sb.channel('votes').on('postgres_changes', { event: '*', schema: 'public', table: 'report_votes' }, () => this.loadVotes().then(refresh)).subscribe();
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
    async loadFeed() { const { data, error } = await this.sb.from('post_feed').select('*').order('created_at', { ascending: false }).limit(150); if (!error) S.remote = data || []; await Promise.all([this.loadVotes(), this.signPhotos()]); },
    groupsOff: false,
    async loadGroups() { // the private groups you belong to
      if (!this.user) { S.groups = []; return; }
      const { data, error } = await this.sb.from('group_members').select('role, groups(*)').eq('user_id', this.user.id);
      if (error) { this.groupsOff = true; S.groups = []; return; }
      this.groupsOff = false;
      S.groups = (data || []).filter(r => r.groups).map(r => ({ ...r.groups, role: r.role })).sort((a, b) => a.name.localeCompare(b.name));
      if (S.scope !== 'public' && !S.groups.some(g => g.id === S.scope)) S.scope = 'public';
    },
    async signPhotos() { // group photos are private: get short-lived links for the ones in view
      const need = [...new Set(S.remote.map(r => r.image_url).filter(u => u && u.startsWith('gp:') && !S.signed[u.slice(3)]))].map(u => u.slice(3));
      if (!need.length) return;
      const { data } = await this.sb.storage.from('group-photos').createSignedUrls(need, 6 * 3600);
      (data || []).forEach(d => { if (d.signedUrl) S.signed[d.path] = d.signedUrl; });
    },
    async uploadGroup(dataUrl, gid, name) {
      const blob = await (await fetch(dataUrl)).blob(); const path = `${gid}/${name}.jpg`;
      const { error } = await this.sb.storage.from('group-photos').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
      S.signed[path] = dataUrl; return 'gp:' + path;
    },
    votesOff: false,
    async loadVotes() { // "still there" / "cleared" votes on community reports
      const reps = S.remote.filter(r => isReport(r.tag)); if (this.votesOff || !reps.length) return;
      const { data, error } = await this.sb.from('report_votes').select('post_id,user_id,vote,created_at').in('post_id', reps.map(r => r.id));
      if (error) { this.votesOff = true; return; }
      const owner = Object.fromEntries(reps.map(r => [r.id, r.user_id])); const V = {};
      (data || []).forEach(x => { const v = V['s' + x.post_id] = V['s' + x.post_id] || { still: 0, cleared: 0, last: 0, mine: null, authorCleared: false };
        v[x.vote]++; if (x.vote === 'still') v.last = Math.max(v.last, +new Date(x.created_at)); if (this.user && x.user_id === this.user.id) v.mine = x.vote; if (x.vote === 'cleared' && x.user_id === owner[x.post_id]) v.authorCleared = true; });
      S.votes = V;
    },
    async upload(dataUrl, name) {
      const blob = await (await fetch(dataUrl)).blob(); const path = `${this.user.id}/${name}.jpg`;
      const { error } = await this.sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true }); if (error) throw error;
      return this.sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    },
  };
  function needSignIn(why) {
    sheet(`<h4>Join Smokies Live</h4><p class="fine" style="text-align:center;margin:0 0 14px">${esc(why)}</p><form class="pform"><label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="btn primary">Email me a sign-in link</button></form><p class="fine">No password. We email you a one-time link and code. By joining you agree to keep posts respectful; posts can be reported and removed.</p>`, sh => {
      const f = sh.querySelector('form'); f.email.focus();
      f.onsubmit = async e => { e.preventDefault(); const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Sending…';
        const { error } = await Cloud.sb.auth.signInWithOtp({ email: f.email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) { b.disabled = false; b.textContent = 'Email me a sign-in link'; showToast(error.message.slice(0, 80)); return; }
        const email = f.email.value.trim();
        f.outerHTML = `<div class="empty otp">${svg('send', 'big')}<b>Check your email</b><span>Tap the link in the email, or type the code from it here. In the phone app, use the code.</span>
          <form class="pform otpf"><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" placeholder="Code" aria-label="Sign-in code"><button class="btn primary">Sign in</button></form></div>`;
        const of = sh.querySelector('.otpf'); setTimeout(() => of.code.focus(), 200);
        of.code.oninput = () => { of.code.value = of.code.value.replace(/\D/g, ''); if (of.code.value.length === 6 || of.code.value.length === 8) of.requestSubmit(); };
        of.onsubmit = async ev => { ev.preventDefault(); const ob = of.querySelector('button'); if (ob.disabled) return; ob.disabled = true; ob.textContent = 'Checking…';
          const { error: er } = await Cloud.sb.auth.verifyOtp({ email, token: of.code.value.trim(), type: 'email' });
          if (er) { ob.disabled = false; ob.textContent = 'Sign in'; of.classList.remove('shake'); void of.offsetWidth; of.classList.add('shake'); showToast(/expired|invalid/i.test(er.message) ? 'That code did not work. Check it or send a new one.' : er.message.slice(0, 80)); return; }
          closeSheet(); }; };
    });
  }
  const signedIn = () => Cloud.on && Cloud.user;
  function refresh() { drawUserPins(); if (S.view === 'feed') renderFeed(); if (S.view === 'profile') renderProfile(); renderSide(); }
  /* ---------- community reports: what's happening right now, from people on the ground ---------- */
  const RC = { // key: [label, emoji, colour, hours it stays up unless someone says "still there"]
    closed: ['Road closed', '🚧', '#d93a3a', 12], wreck: ['Wreck', '💥', '#e8662b', 3], traffic: ['Heavy traffic', '🚗', '#e8892b', 2], tree: ['Tree down', '🌲', '#3f8f4f', 8],
    ice: ['Ice or snow', '🧊', '#4f9fd8', 12], flood: ['Flooding', '🌊', '#2f7fe0', 12], power: ['Power out', '⚡', '#d9a400', 12], smoke: ['Fire or smoke', '🔥', '#e0452f', 6],
    bear: ['Bear', '🐻', '#8a5a33', 4], wildlife: ['Wildlife', '🦌', '#9a7b4f', 4], hazard: ['Hazard', '⚠️', '#c99400', 8], lostpet: ['Lost pet', '🐕', '#9b5bd6', 72],
    foundpet: ['Found pet', '🐾', '#7a4fbf', 72], help: ['Help needed', '🙋', '#d6457a', 24], info: ['Heads up', '📣', '#3d6fd6', 12],
  };
  const isReport = tag => /^R:/.test(tag || '');
  const rcat = tag => (RC[(tag || '').slice(2)] ? (tag || '').slice(2) : 'info');
  function voteOf(id) {
    if (S.votes[id]) return S.votes[id];
    const l = S.rvotes[id]; return { still: l && l.v === 'still' ? 1 : 0, cleared: l && l.v === 'cleared' ? 1 : 0, last: l && l.v === 'still' ? l.t : 0, mine: l ? l.v : null, authorCleared: false };
  }
  function rstate(p) {
    const cat = rcat(p.tag), [label, emo, col, hrs] = RC[cat], v = voteOf(p.id);
    const left = Math.max(+new Date(p.t), v.last || 0) + hrs * 3600e3 - Date.now();
    const gone = left <= 0 || v.cleared >= v.still + 2 || v.authorCleared || (p.mine && v.mine === 'cleared');
    return { cat, label, emo, col, hrs, left, gone, fresh: Date.now() - new Date(p.t) < 45 * 60e3, ...v };
  }
  const fmtLeft = ms => ms > 36e5 * 24 ? Math.round(ms / 864e5) + 'd' : ms > 36e5 ? Math.round(ms / 36e5) + 'h' : Math.max(1, Math.round(ms / 6e4)) + 'm';
  const color = h => { let x = 0; for (const ch of h || '') x = (x * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${x % 360} 45% 42%)`; };
  const authorOf = r => ({ name: r.name || r.handle, h: r.handle || 'someone', c: color(r.handle), i: (r.name || r.handle || '?').slice(0, 1).toUpperCase(), photo: r.avatar_url });
  const imgOf = u => u && u.startsWith('gp:') ? S.signed[u.slice(3)] || '' : u;
  const groupOf = id => id ? S.groups.find(g => g.id === id) || { id, name: 'Private group', emoji: '🔒', color: '#555' } : null;
  const remoteItem = r => ({ id: 's' + r.id, kind: 'user', group: groupOf(r.group_id), a: authorOf(r), t: r.created_at, img: imgOf(r.image_url), text: r.caption, tag: r.tag, place: r.lng != null ? { name: r.place_name || 'Pinned spot', lng: r.lng, lat: r.lat } : null, likes: r.like_count, ncom: r.comment_count, mine: !!(Cloud.user && r.user_id === Cloud.user.id), ref: { id: 's' + r.id, sid: r.id, remote: true, img: r.image_url, gid: r.group_id } });

  async function loadLocal() {
    S.me = await Store.get('me', null);
    S.posts = await Store.get('posts', []);
    S.likes = await Store.get('likes', {}); S.saved = await Store.get('saved', {}); S.comments = await Store.get('comments', {});
    S.seen = await Store.get('seen', 0); S.rvotes = await Store.get('rvotes', {});
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
    out.forEach(x => { if (x.kind === 'user' && isReport(x.tag)) { x.kind = 'report'; x.rs = rstate(x); } });
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'report' && out[i].rs.gone) out.splice(i, 1);
    L.alerts.forEach((a, i) => out.push({ id: 'al' + i + (a.event || ''), kind: 'alert', a: acct('Weather'), t: a.sent || a.effective, card: 'alert', title: a.event, text: (a.description || a.headline || '').replace(/\s*\*\s*/g, ' ').slice(0, 400), place: null, refK: 'alert', refI: i }));
    L.traffic.cameras.forEach((c, i) => out.push({ id: 'cam' + c.id, kind: 'cam', a: acct(c.source), t: new Date().toISOString(), img: c.img ? (c.still ? c.img + '?r=' + Math.floor(Date.now() / 300000) : c.img) : null, card: c.img ? null : 'cam', title: c.name, spot: c.spot, live: c.still || c.live, text: c.img ? c.name + (c.still ? ' · new image every few minutes' : '') : '', link: c.img ? null : c.page, place: c.lng != null ? { name: (c.spot || c.name).replace(/ Webcam$/, ''), lng: c.lng, lat: c.lat } : null, refK: 'cam', refI: i }));
    L.news.forEach((n, i) => out.push({ id: 'n' + n.id, kind: 'news', a: acct(n.source), t: n.published, img: n.img, card: n.img ? null : 'headline', title: n.title, text: n.summary && n.summary !== n.title ? n.summary : '', place: n.place, link: n.link, refK: 'news', refI: i }));
    L.events.forEach((n, i) => out.push({ id: 'e' + n.id, kind: 'event', a: acct(n.source), t: n.published || n.start, img: n.img, card: n.img ? null : 'event', title: n.title, text: n.summary, start: n.start, place: n.place, link: n.link, refK: 'event', refI: i }));
    L.traffic.incidents.forEach((n, i) => out.push({ id: 'r' + n.id, kind: 'road', a: acct(n.source), t: n.start, card: 'road', title: n.title, text: n.desc, place: n.place || (n.lng != null ? { name: n.road || 'Road', lng: n.lng, lat: n.lat } : null), link: n.link, refK: 'traffic', refI: i }));
    // mix it like a real feed: your posts and alerts first, then news with webcams and events woven in
    const by = k => out.filter(x => x.kind === k).sort((x, y) => new Date(y.t || 0) - new Date(x.t || 0));
    const head = [...by('alert'), ...by('report'), ...by('user')], news = by('news'), cams = by('cam'), roads = by('road');
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
    const R = p.kind === 'report' ? p.rs : null;
    if (R && p.img) media = `<div class="media"><img loading="lazy" src="${esc(p.img)}" alt="" onerror="this.parentNode.classList.add('broken')"><span class="rbadge" style="--c:${R.col}">${R.emo} ${esc(R.label)}</span><i class="burst">${svg('heart')}</i></div>`;
    else if (R) media = `<div class="media txt report" style="--c:${R.col}"><div><span class="remo">${R.emo}</span><small>Community report</small><h3>${esc(R.label)}</h3>${p.place ? `<p>${svg('pin', 'sm')} ${esc(p.place.name)}</p>` : ''}</div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.img) media = `<div class="media${p.live ? ' live' : ''}"><img loading="lazy" src="${esc(p.img)}" alt="" onerror="this.parentNode.classList.add('broken')">${p.live ? '<span class="badge">LIVE</span>' : ''}<i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'alert') media = `<div class="media txt alert"><div><small>National Weather Service</small><h3>${esc(p.title)}</h3><p>${esc(p.text.slice(0, 220))}</p></div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'event') { const d = p.start ? new Date(p.start) : null; media = `<div class="media txt event"><div>${d && !isNaN(d) ? `<span class="date"><b>${d.toLocaleDateString('en-US', { timeZone: TZ, day: 'numeric' })}</b>${d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short' })}</span>` : '<small>Event</small>'}<h3>${esc(p.title)}</h3>${p.place ? `<p>${svg('pin', 'sm')} ${esc(p.place.name)}</p>` : ''}</div><i class="burst">${svg('heart')}</i></div>`; }
    else if (p.card === 'road') media = `<div class="media txt road"><div><small>Roads</small><h3>${esc(p.title)}</h3><p>${esc((p.text || '').slice(0, 200))}</p></div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'cam') media = `<a class="media txt camlink" href="${esc(p.link || '#')}" target="_blank" rel="noopener"><span class="badge">LIVE</span><div><small>Live webcam</small><h3>${esc(p.title)}</h3>${p.spot ? `<p>${svg('pin', 'sm')} ${esc(p.spot)}</p>` : ''}<span class="watch">${svg('eye', 'sm')} Watch live</span></div></a>`;
    else if (p.card === 'headline') media = `<div class="media txt headline" style="--c:${p.a.c}"><div><small>${esc(p.a.name)}</small><h3>${esc(p.title)}</h3></div><i class="burst">${svg('heart')}</i></div>`;
    const cap = p.kind === 'news' || p.kind === 'event' ? (p.img ? `<b>${esc(p.title)}</b> ` : '') + esc((p.text || '').slice(0, 240)) : esc(p.text || '');
    const nC = p.ncom != null ? p.ncom : (S.comments[p.id] || []).length;
    const likeLine = p.likes != null ? (p.likes ? `<div class="likes">${p.likes.toLocaleString()} like${p.likes > 1 ? 's' : ''}</div>` : '') : liked ? '<div class="likes">You liked this</div>' : '';
    return `<article class="post" data-id="${esc(p.id)}" style="animation-delay:${Math.min(j, 6) * 60}ms">
      <header>${avatar(p.a, 32, p.kind === 'cam' || p.kind === 'alert')}<div class="who"><b>${esc(p.a.h)}${p.group && S.scope === 'public' ? `<button class="gtag" data-act="group" style="--c:${esc(p.group.color)}">${svg('lock', 'xs')}${esc(p.group.emoji)} ${esc(p.group.name)}</button>` : ''}</b>${p.place ? `<button class="loc" data-act="map">${esc(p.place.name)}</button>` : ''}</div><span class="when">${ago(p.t)}</span><button class="ib" data-act="more" aria-label="More">${svg('more')}</button></header>
      ${media}
      <div class="acts"><button class="ib like${liked ? ' on' : ''}" data-act="like" aria-label="Like" aria-pressed="${liked}">${svg('heart')}</button><button class="ib" data-act="comment" aria-label="Comment">${svg('comment')}</button><button class="ib" data-act="share" aria-label="Share">${svg('send')}</button>${p.place ? `<button class="ib" data-act="map" aria-label="See on map">${svg('pin')}</button>` : ''}<span class="sp"></span><button class="ib save${saved ? ' on' : ''}" data-act="save" aria-label="Save">${svg('save')}</button></div>
      ${R ? `<div class="rvote"><span>${R.still > 1 ? `${R.still} people say it's still there · ` : R.still === 1 && R.mine !== 'still' ? '1 person says it\'s still there · ' : ''}up for ${fmtLeft(R.left)} more</span><button data-act="still" class="${R.mine === 'still' ? 'on' : ''}">${svg('eye', 'sm')} Still there</button><button data-act="cleared" class="${R.mine === 'cleared' ? 'on' : ''}">${svg('check', 'sm')} ${p.mine ? 'Resolved' : 'Cleared'}</button></div>` : ''}
      ${likeLine}${p.tag && !R ? `<div class="ptag">#${esc(p.tag.toLowerCase())}</div>` : ''}
      ${cap ? `<div class="cap"><b>${esc(p.a.h)}</b> ${cap}</div>` : ''}
      ${p.link && p.card !== 'cam' ? `<a class="more" href="${esc(p.link)}" target="_blank" rel="noopener">${p.kind === 'news' ? 'Read the full story' : 'More details'}</a>` : ''}
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
    nav.innerHTML = `<div class="logo">${window.Brand ? Brand.mark(30) : ''}<span>Smokies <em>Live</em></span></div>` +
      [['feed', 'home', 'Home'], ['map', 'map', 'Map'], ['create', 'plus', 'Post'], ['activity', 'heart', 'Activity'], ['profile', 'user', 'Profile']].map(([k, ic, l]) => `<button data-v="${k}" aria-label="${l}"${k === 'map' ? ' aria-current="page"' : ''}>${k === 'profile' ? `<span class="me">${svg(ic)}</span>` : svg(ic)}<span>${l}</span>${k === 'activity' ? '<i class="dot" hidden></i>' : ''}</button>`).join('');
    document.body.appendChild(nav);
    nav.querySelectorAll('button').forEach(b => b.onclick = () => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); b.dataset.v === 'create' ? openCreate() : setView(b.dataset.v); });
    const v = document.createElement('div'); v.id = 'socialView'; v.hidden = true;
    v.innerHTML = `<div class="col"><div id="sv-feed" class="pane"><div class="ptr" aria-hidden="true"><i></i></div><header class="top"><div class="logo"><span>Smokies <em>Live</em></span></div><button class="rbtn" data-report>${svg('alert', 'sm')} Report</button><button class="ib" data-v="activity" aria-label="Activity">${svg('heart')}</button></header><div id="scopes" class="scopes" role="tablist" hidden></div><div id="stories" class="stories"></div><div id="fchips" class="chips" role="tablist"></div><div id="feed"></div></div>
      <div id="sv-activity" class="pane"></div><div id="sv-profile" class="pane"></div></div><aside class="side" id="sv-side"></aside>`;
    document.body.appendChild(v);
    v.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
    const st = document.createElement('div'); st.id = 'storyView'; st.hidden = true; document.body.appendChild(st);
    const cr = document.createElement('div'); cr.id = 'createView'; cr.hidden = true; document.body.appendChild(cr);
    const sh = document.createElement('div'); sh.id = 'sheetView'; sh.hidden = true; document.body.appendChild(sh);
    $('#feed').addEventListener('click', onFeedClick);
    v.querySelector('[data-report]').onclick = () => openCreate('report');
    $('#scopes').onclick = e => { const b = e.target.closest('[data-scope]'); if (b) { bump(b); setScope(b.dataset.scope); } };
    $('#fchips').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; if (f === 'near' && !S.here && navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { S.here = { lng: p.coords.longitude, lat: p.coords.latitude }; renderFeed(); }, () => {}, { timeout: 8000, maximumAge: 300000 }); S.filter = f; renderFeed(); $('#socialView').scrollTo({ top: 0, behavior: 'smooth' }); };
    pullToRefresh(v);
    $('#feed').addEventListener('dblclick', e => { const m = e.target.closest('.media'); if (m) { const id = m.closest('.post').dataset.id; if (S.likes[id] || S.serverLikes[id]) { const h = m.querySelector('.burst'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } else like(id, true, m); } });
    let lastTap = 0; $('#feed').addEventListener('touchend', e => { const m = e.target.closest('.media'); if (!m) return; const n = Date.now(); if (n - lastTap < 300) { const id = m.closest('.post').dataset.id; if (!(S.likes[id] || S.serverLikes[id])) like(id, true, m); else { const h = m.querySelector('.burst'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } e.preventDefault(); } lastTap = n; });
  }
  function pullToRefresh(sv) {
    const ind = sv.querySelector('.ptr'); let y0 = null, dy = 0, busy = false;
    sv.addEventListener('touchstart', e => { if (S.view === 'feed' && sv.scrollTop <= 0 && !busy) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    sv.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); const k = Math.min(1, dy / 90); ind.style.setProperty('--k', k); ind.classList.toggle('show', dy > 8); ind.classList.toggle('arm', dy > 90); }, { passive: true });
    sv.addEventListener('touchend', async () => {
      if (y0 == null) return; y0 = null;
      if (dy <= 90) { ind.classList.remove('show', 'arm'); return; }
      busy = true; ind.classList.add('spin');
      await Promise.race([Promise.all([Live.refresh ? Live.refresh() : null, Cloud.on ? Cloud.loadFeed() : null]), new Promise(r => setTimeout(r, 12000))]);
      renderFeed(); drawUserPins(); ind.classList.remove('spin', 'show', 'arm'); busy = false;
    });
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
  const FILTERS = [['all', 'For you'], ['report', 'Happening now'], ['near', 'Near me'], ['news', 'News'], ['event', 'Events'], ['cam', 'Cameras'], ['user', 'People'], ['road', 'Roads']];
  function filtered(all) {
    const f = S.filter; if (f === 'all') return all;
    if (f === 'near') { const c = S.here || map.getCenter(); return all.filter(x => x.place && km(c, x.place) < 25).sort((a, b) => km(c, a.place) - km(c, b.place)); }
    return all.filter(x => x.kind === f || (f === 'road' && x.kind === 'report' && ['closed', 'wreck', 'traffic', 'tree', 'ice', 'flood'].includes(x.rs.cat)));
  }
  function renderChips(all) {
    const n = all.filter(x => x.kind === 'report').length;
    $('#fchips').innerHTML = FILTERS.map(([k, l]) => `<button data-f="${k}" aria-selected="${S.filter === k}">${k === 'near' ? svg('locate', 'sm') + ' ' : ''}${l}${k === 'report' && n ? ` <i>${n}</i>` : ''}</button>`).join('');
  }
  function renderScopes() {
    const el = $('#scopes'); if (!el) return;
    if (!Cloud.on || Cloud.groupsOff) { el.hidden = true; return; }
    el.hidden = false;
    const tab = (id, emo, name, c) => `<button data-scope="${id}" aria-selected="${S.scope === id}" style="--c:${c}"><span class="ge">${emo}</span><b>${esc(name)}</b>${id !== 'public' ? svg('lock', 'xs') : ''}</button>`;
    el.innerHTML = tab('public', svg('globe', 'sm'), 'Smokies', '#3f6f8f') + S.groups.map(g => tab(g.id, esc(g.emoji), g.name, g.color)).join('') + `<button data-scope="new" class="gnew"><span class="ge">+</span><b>${S.groups.length ? 'Group' : 'Start a family group'}</b></button>`;
  }
  function setScope(id) {
    if (id === 'new') return openGroups();
    S.scope = id; Store.set('scope', id); S.filter = 'all';
    if (S.view !== 'feed') setView('feed'); else renderFeed();
    $('#socialView').scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderGroupFeed(g) {
    const items = S.remote.filter(r => r.group_id === g.id).map(remoteItem);
    items.forEach(x => { if (isReport(x.tag)) { x.kind = 'report'; x.rs = rstate(x); } });
    feedCache = items.filter(x => !(x.kind === 'report' && x.rs.gone));
    $('#feed').innerHTML = `<div class="ghead" style="--c:${esc(g.color)}"><span class="gbig">${esc(g.emoji)}</span><div><h2>${esc(g.name)}</h2><span>${svg('lock', 'xs')} Private group · only members see these posts</span></div>
      <div class="gacts"><button class="btn primary" data-g="post">${svg('plus', 'sm')} Post</button><button class="btn" data-g="invite">${svg('link', 'sm')} Invite</button><button class="btn" data-g="members">${svg('users', 'sm')} Members</button></div></div>` +
      (feedCache.length ? feedCache.map(card).join('') : `<div class="empty">${svg('camera', 'big')}<b>Nothing here yet</b><span>Share the first photo or update with ${esc(g.name)}. Only people in this group will see it.</span></div>`);
    const f = $('#feed');
    f.querySelector('[data-g="post"]').onclick = () => openCreate('post');
    f.querySelector('[data-g="invite"]').onclick = () => showInvite(g);
    f.querySelector('[data-g="members"]').onclick = () => openMembers(g);
  }
  function renderFeed() { renderScopes(); const g = S.scope !== 'public' && S.groups.find(x => x.id === S.scope); document.body.classList.toggle('ingroup', !!g); if (g) return renderGroupFeed(g);
    buildStories(); renderStories(); const all = feedItems(); renderChips(all); feedCache = filtered(all); const f = $('#feed');
    if (!feedCache.length && all.length) { f.innerHTML = `<div class="empty">${svg(S.filter === 'report' ? 'alert' : 'search', 'big')}<b>${S.filter === 'report' ? 'All quiet right now' : 'Nothing here yet'}</b><span>${S.filter === 'report' ? 'No open community reports. See something on the road or trail? Let people know.' : S.filter === 'near' ? 'Nothing posted within 25 km of you.' : 'Try another filter.'}</span>${S.filter === 'report' || S.filter === 'near' ? '<button class="btn primary" data-newrep>Report something</button>' : ''}</div>`; const nb = f.querySelector('[data-newrep]'); if (nb) nb.onclick = () => openCreate('report'); return; }
    f.innerHTML = feedCache.length ? feedCache.map(card).join('') : `<div class="empty">${Live.st.blocked ? `The feed needs live data, which this preview blocks. Open <a href="${SITE}" target="_blank" rel="noopener">the full site</a>.` : 'Loading the latest from the mountains…'}</div>`; }
  function renderSide() {
    const L = Live.st; const el = $('#sv-side'); if (!el) return;
    const me = meAcct();
    el.innerHTML = `<div class="meRow">${avatar(me, 44)}<div><b>${esc(me.h)}</b><span>${esc(me.name)}</span></div><button class="link" data-p>${S.me ? 'Edit' : 'Set up'}</button></div>
      ${L.wx ? `<div class="sideCard"><small>Right now</small><b>${Math.round(L.wx.current.temperature_2m)}° · ${esc(document.getElementById('wxDesc') ? document.getElementById('wxDesc').querySelector('b')?.textContent || '' : '')}</b><span>${L.alerts.length ? esc(L.alerts[0].event) : 'No weather alerts'}</span></div>` : ''}
      <button class="btn primary sideRep" data-rep>${svg('alert', 'sm')} Report something</button>
      ${Cloud.on && !Cloud.groupsOff ? `<div class="sideHead">Private groups</div>${S.groups.map(g => `<button class="meRow sm grow" data-scope="${g.id}"><span class="gdot" style="--c:${esc(g.color)}">${esc(g.emoji)}</span><div><b>${esc(g.name)}</b><span>${g.role === 'owner' ? 'You run this group' : 'Member'}</span></div></button>`).join('')}<button class="meRow sm grow" data-scope="new"><span class="gdot">+</span><div><b>Create or join a group</b><span>A private feed for your family</span></div></button>` : ''}
      <div class="sideHead">Accounts in your feed</div>${[...new Set([...L.news.map(n => n.source), ...L.events.map(e => e.source)])].slice(0, 6).map(s => { const a = acct(s); return `<div class="meRow sm">${avatar(a, 32)}<div><b>${esc(a.h)}</b><span>${esc(s)}</span></div></div>`; }).join('')}
      <p class="fine">Smokies Live · open data from NWS, USGS, NASA, the National Park Service and local newsrooms.</p>`;
    const p = el.querySelector('[data-p]'); if (p) p.onclick = editProfile;
    el.querySelector('[data-rep]').onclick = () => openCreate('report');
    el.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => setScope(b.dataset.scope));
  }
  function onFeedClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return; const id = b.closest('.post').dataset.id; const p = feedCache.find(x => x.id === id); if (!p) return;
    const act = b.dataset.act;
    if (act === 'like') like(id, !(S.likes[id] || S.serverLikes[id]), b.closest('.post').querySelector('.media'));
    if (act === 'save') { S.saved[id] = !S.saved[id]; if (!S.saved[id]) delete S.saved[id]; persist('saved'); b.classList.toggle('on', !!S.saved[id]); bump(b); }
    if (act === 'share') share(p);
    if (act === 'still' || act === 'cleared') vote(p, act);
    if (act === 'group' && p.group) setScope(p.group.id);
    if (act === 'map') showOnMap(p);
    if (act === 'comment') openComments(p);
    if (act === 'more') openMore(p);
  }
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  async function vote(p, v) {
    const remote = p.ref && p.ref.remote;
    if (remote) {
      if (Cloud.votesOff) return showToast('Voting turns on after the latest database update');
      if (!signedIn()) return needSignIn('Sign in to confirm or clear reports.');
      const cur = voteOf(p.id); const off = cur.mine === v;
      const { error } = off ? await Cloud.sb.from('report_votes').delete().eq('post_id', p.ref.sid).eq('user_id', Cloud.user.id) : await Cloud.sb.from('report_votes').upsert({ post_id: p.ref.sid, user_id: Cloud.user.id, vote: v, created_at: new Date().toISOString() });
      if (error) return showToast('Could not save your answer');
      await Cloud.loadVotes();
    } else { if (S.rvotes[p.id] && S.rvotes[p.id].v === v) delete S.rvotes[p.id]; else S.rvotes[p.id] = { v, t: Date.now() }; persist('rvotes'); }
    const R = rstate(p); p.rs = R;
    const el = document.querySelector(`.post[data-id="${CSS.escape(p.id)}"]`);
    if (R.gone) { showToast(p.mine ? 'Marked resolved. Thanks for the update.' : 'Thanks. It will come down once others agree.'); if (el) { el.classList.add('leave'); setTimeout(() => { renderFeed(); drawUserPins(); }, 420); } return; }
    if (v === 'still' && R.mine === 'still') showToast('Thanks. The report stays up longer.');
    if (el) { const j = document.createElement('div'); j.innerHTML = card(p, 0); el.replaceWith(j.firstElementChild); }
    drawUserPins();
  }
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
          if (p.ref.remote) { const { error } = await Cloud.sb.from('posts').delete().eq('id', p.ref.sid); if (error) return showToast('Could not delete'); if (p.ref.img && p.ref.img.startsWith('gp:')) Cloud.sb.storage.from('group-photos').remove([p.ref.img.slice(3)]); else if (p.ref.img && p.ref.img.includes('/photos/')) Cloud.sb.storage.from('photos').remove([p.ref.img.split('/photos/')[1]]); await Cloud.loadFeed(); }
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

  /* ---------- create: a photo post or a community report ---------- */
  const TAGS = ['Sighting', 'Wildlife', 'Trail', 'Weather', 'Traffic', 'Event', 'Food', 'View'];
  let draft = null;
  function openCreate(mode = 'post', cat = null) {
    const c = map.getCenter();
    draft = { mode, cat, img: null, caption: '', tag: null, place: { name: placeName(c), lng: c.lng, lat: c.lat }, placeSet: false, group: S.scope !== 'public' && S.groups.some(g => g.id === S.scope) ? S.scope : null };
    const v = $('#createView'); v.hidden = false; v.classList.remove('out');
    v.innerHTML = `<div class="cbox"><header><button class="ib" data-x aria-label="Close">${svg('close')}</button><div class="seg" role="tablist"><button data-mode="post">Post</button><button data-mode="report">Report</button><i></i></div><button class="link" data-share disabled>Share</button></header>
      <div class="cbody"></div></div>`;
    v.querySelector('[data-x]').onclick = closeCreate;
    v.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { draft.mode = b.dataset.mode; drawCreate(); });
    v.querySelector('[data-share]').onclick = publish;
    drawCreate();
    if (mode === 'report') autoLocate();
  }
  function autoLocate() { // reports are about where you are; use your location if you already allowed it
    if (!navigator.permissions || !navigator.geolocation) return;
    navigator.permissions.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted') locateMe(true); }).catch(() => {});
  }
  function locateMe(quiet) {
    if (!navigator.geolocation) return quiet || showToast('Location is not available');
    navigator.geolocation.getCurrentPosition(p => { const ll = { lng: p.coords.longitude, lat: p.coords.latitude }; S.here = ll; if (!draft) return; draft.place = { ...ll, name: placeName(ll) }; draft.placeSet = true; const el = $('#crPlace'); if (el) { el.textContent = draft.place.name; el.closest('.where').classList.add('set'); } },
      () => quiet || showToast('Could not get your location'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  function drawCreate() {
    const v = $('#createView'), R = draft.mode === 'report';
    v.querySelector('.seg').dataset.on = draft.mode;
    v.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === draft.mode));
    const photo = draft.img ? `<label class="pick has"><input type="file" accept="image/*" hidden><img class="prev" src="${draft.img}" alt=""><span class="chg">${svg('camera', 'sm')} Change</span></label>`
      : `<label class="pick${R ? ' small' : ''}"><input type="file" accept="image/*" hidden><div class="ph">${svg('camera', 'big')}<span>${R ? 'Add a photo (optional)' : 'Add a photo'}</span>${R ? '' : '<small>Take one or choose from your library</small>'}</div></label>`;
    v.querySelector('.cbody').innerHTML = (R ? `<div class="rgrid">${Object.entries(RC).map(([k, [l, e, c]]) => `<button data-cat="${k}" style="--c:${c}" class="${draft.cat === k ? 'on' : ''}"><span>${e}</span>${l}</button>`).join('')}</div>` : '') + photo +
      `<div class="fields"><textarea maxlength="800" placeholder="${R ? 'Add details: which lane, how bad, what to watch for (optional)' : 'Write a caption…'}" rows="3">${esc(draft.caption)}</textarea>
      ${R ? '' : `<div class="tags">${TAGS.map(t => `<button data-t="${t}" class="${draft.tag === t ? 'on' : ''}">${t}</button>`).join('')}</div>`}
      ${Cloud.on && S.groups.length ? `<div class="shareto"><small>Share with</small><div>${[{ id: null, emoji: '', name: 'Everyone', color: '#3f6f8f' }, ...S.groups].map(g => `<button data-gid="${g.id || ''}" class="${(draft.group || null) === g.id ? 'on' : ''}" style="--c:${esc(g.color)}">${g.id ? esc(g.emoji) + ' ' : svg('globe', 'xs')}${esc(g.name)}${g.id ? svg('lock', 'xs') : ''}</button>`).join('')}</div></div>` : ''}
      <button class="where${draft.placeSet ? ' set' : ''}" data-where>${svg('pin')}<div><b id="crPlace">${esc(draft.place.name)}</b><small>${R ? 'Where is it? Tap to search or move the pin.' : 'Tap to search for a place or set it on the map'}</small></div><span class="link" data-gps>${svg('locate', 'sm')} Here</span></button>
      <p class="fine">${R ? 'Reports show on everyone\'s map and feed and come down on their own after a few hours unless people say it\'s still there. For emergencies, call 911 first.' : Store.shared ? (signedIn() ? 'Your post is public and appears on everyone\'s map. Keep it kind and safe: no faces of strangers, no exact locations of wildlife dens or nests.' : 'You will be asked to sign in when you share.') : 'For now your posts are saved on this device and shown on your map.'}</p></div>`;
    const inp = v.querySelector('input[type=file]');
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; draft.img = await shrink(f); drawCreate(); };
    v.querySelector('textarea').oninput = e => { draft.caption = e.target.value; ready(); };
    v.querySelectorAll('.tags button').forEach(b => b.onclick = () => { draft.tag = draft.tag === b.dataset.t ? null : b.dataset.t; v.querySelectorAll('.tags button').forEach(x => x.classList.toggle('on', x.dataset.t === draft.tag)); });
    const fine = () => { const el = v.querySelector('.fields > .fine'); if (el && draft.group) el.textContent = `Only members of ${groupOf(draft.group).name} can see this post and its photo. It stays off the public map and feed.`; };
    v.querySelectorAll('.shareto button').forEach(b => b.onclick = () => { draft.group = b.dataset.gid || null; v.querySelectorAll('.shareto button').forEach(x => x.classList.toggle('on', x === b)); bump(b); ready(); if (draft.group) fine(); else drawCreate(); });
    fine();
    v.querySelectorAll('.rgrid button').forEach(b => b.onclick = () => { draft.cat = b.dataset.cat; v.querySelectorAll('.rgrid button').forEach(x => x.classList.toggle('on', x === b)); bump(b); ready(); });
    v.querySelector('[data-where]').onclick = async e => {
      if (e.target.closest('[data-gps]')) return locateMe();
      const p = await pickPlace(draft.place, R ? 'Where is it?' : 'Where was this?');
      if (p) { draft.place = p; draft.placeSet = true; drawCreate(); }
    };
    ready();
  }
  function ready() { const b = $('#createView [data-share]'); if (!b) return; b.textContent = draft.mode === 'report' ? 'Send' : 'Share'; b.disabled = draft.mode === 'report' ? !draft.cat : !(draft.img || draft.caption.trim()); }

  /* ---------- places: search the gazetteer and set a spot with a pin ---------- */
  let PLACES = null;
  const placesReady = () => PLACES ? Promise.resolve(PLACES) : fetch(BASE + 'search.json').then(r => r.json()).then(j => (PLACES = j)).catch(() => (PLACES = []));
  const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const km = (a, b) => Math.hypot((a.lng - b.lng) * 90.3, (a.lat - b.lat) * 111.2);
  function searchPlaces(q, near) {
    const n = norm(q); if (n.length < 2 || !PLACES) return [];
    const ll = q.match(/^\s*(-?\d{2}\.\d+)\s*[, ]\s*(-?\d{2}\.\d+)\s*$/);
    if (ll) { const a = +ll[1], b = +ll[2]; const p = Math.abs(a) < 40 ? [a, b] : [b, a]; return [[`${p[0].toFixed(5)}, ${p[1].toFixed(5)}`, p[1], p[0], 'Coordinates', 9]]; }
    const out = [];
    for (const p of PLACES) {
      const nm = p._n || (p._n = norm(p[0])); const i = nm.indexOf(n); if (i < 0) continue;
      const score = (i === 0 ? 0 : nm[i - 1] === ' ' ? 1 : 3) + (p[4] <= 1 ? -0.6 : 0) + (near ? Math.min(2.5, km(near, { lng: p[1], lat: p[2] }) / 12) : 0) + nm.length / 50;
      out.push([score, p]);
    }
    return out.sort((x, y) => x[0] - y[0]).slice(0, 8).map(x => x[1]);
  }
  function pickPlace(start, title) {
    return new Promise(resolve => {
      const cam = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      document.body.classList.add('picking'); stopOrbit();
      const v = document.createElement('div'); v.id = 'pickView';
      v.innerHTML = `<div class="pk-top"><button class="ib" data-x aria-label="Back">${svg('back')}</button><label class="pk-search">${svg('search', 'sm')}<input type="search" placeholder="Search places, businesses, trails" autocomplete="off" enterkeyhint="search" aria-label="Search places"></label></div>
        <div class="pk-res" hidden></div>
        <div class="pk-pin" aria-hidden="true"><svg viewBox="0 0 40 52"><path d="M20 50S4 32 4 19a16 16 0 0 1 32 0c0 13-16 31-16 31z"/><circle cx="20" cy="19" r="6.5"/></svg><i></i></div>
        <div class="pk-card"><small>${esc(title || 'Set the location')}</small><div class="pk-name"><b></b><span></span></div><div class="pk-acts"><button class="btn" data-gps>${svg('locate', 'sm')} My location</button><button class="btn primary" data-ok>Set location</button></div><p class="fine">Drag the map to move the pin, or tap a spot.</p></div>`;
      document.body.appendChild(v);
      const pin = v.querySelector('.pk-pin'), nameB = v.querySelector('.pk-name b'), nameS = v.querySelector('.pk-name span'), inp = v.querySelector('input'), res = v.querySelector('.pk-res');
      let lock = null; // a searched place keeps its exact name until the pin moves away from it
      const label = () => { const c = map.getCenter(); if (lock && km(lock, c) > 0.06) lock = null; nameB.textContent = lock ? lock.name : placeName(c); nameS.textContent = `${c.lat.toFixed(5)}°N ${Math.abs(c.lng).toFixed(5)}°W`; };
      const onMove = () => { pin.classList.add('lift'); pin.classList.remove('drop'); };
      const onEnd = () => { pin.classList.remove('lift'); void pin.offsetWidth; pin.classList.add('drop'); label(); };
      const onClick = e => map.easeTo({ center: e.lngLat, duration: 450 });
      map.on('movestart', onMove); map.on('moveend', onEnd); map.on('click', onClick);
      const done = val => {
        map.off('movestart', onMove); map.off('moveend', onEnd); map.off('click', onClick);
        v.classList.add('out'); document.body.classList.remove('picking');
        setTimeout(() => { v.remove(); map.jumpTo(cam); }, 260); resolve(val);
      };
      v.querySelector('[data-x]').onclick = () => done(null);
      v.querySelector('[data-ok]').onclick = () => { const c = map.getCenter(); done({ name: nameB.textContent, lng: c.lng, lat: c.lat }); };
      v.querySelector('[data-gps]').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { lock = null; map.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 16, duration: 1400 }); }, () => showToast('Could not get your location'), { enableHighAccuracy: true, timeout: 10000 }) : showToast('Location is not available');
      const show = () => {
        const list = searchPlaces(inp.value, map.getCenter());
        res.hidden = !inp.value.trim();
        res.innerHTML = list.length ? list.map((p, i) => `<button data-i="${i}" style="animation-delay:${i * 30}ms">${svg('pin', 'sm')}<div><b>${esc(p[0])}</b><span>${esc(p[3].charAt(0).toUpperCase() + p[3].slice(1))} · ${km(map.getCenter(), { lng: p[1], lat: p[2] }).toFixed(1)} km</span></div></button>`).join('') : `<p class="fine">${PLACES ? 'No matches. Try a shorter name, or move the map by hand.' : 'Loading places…'}</p>`;
        res.querySelectorAll('button').forEach(b => b.onclick = () => { const p = list[+b.dataset.i]; inp.value = p[0]; inp.blur(); res.hidden = true; lock = { name: p[0], lng: p[1], lat: p[2] }; map.flyTo({ center: [p[1], p[2]], zoom: Math.max(15.5, map.getZoom()), pitch: 35, duration: 1600, essential: true }); });
      };
      inp.oninput = show; inp.onfocus = () => { placesReady().then(show); };
      inp.onkeydown = e => { if (e.key === 'Enter') { const b = res.querySelector('button'); if (b) b.click(); } };
      lock = start && start.name && !/°N/.test(start.name) ? { ...start } : null;
      map.flyTo({ center: [start.lng, start.lat], zoom: Math.max(15, Math.min(17, map.getZoom() + 2)), pitch: 30, bearing: map.getBearing(), duration: 1100, essential: true });
      label(); placesReady();
    });
  }
  function closeCreate() { const v = $('#createView'); v.classList.add('out'); setTimeout(() => { v.hidden = true; v.innerHTML = ''; }, 280); }
  function shrink(file) { // phone photos are huge: keep 1080 px on the long side
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1080 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.84)); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const JUNK = /national park|^cades cove,|great smok(e)?y mountains$/i; // business listings that claim the whole park
  function placeName(ll) { // a business or landmark right there, else the town you're in or near, else coordinates
    const src = PLACES || window.__placeIndex || []; let poi = null, pd = 1e9, town = null, td = 1e9, peak = null, kd = 1e9;
    for (const p of src) {
      const d = km(ll, { lng: p[1], lat: p[2] });
      if (p[4] === 3) { if (d < pd && !JUNK.test(p[0]) && !JUNK.test(p[3])) { pd = d; poi = p; } }
      else if (p[4] === 1) { const w = /town|city/.test(p[3]) ? d * 0.45 : /village/.test(p[3]) ? d * 0.7 : d; if (w < td) { td = w; town = p; } }
      else if (d < kd) { kd = d; peak = p; }
    }
    if (poi && pd < 0.08) return poi[0];
    if (town && td < 0.7) return town[0];
    if (peak && kd < 0.6) return peak[0];
    if (town && td < 3.5) return 'Near ' + town[0];
    if (peak && kd < 2.5) return 'Near ' + peak[0];
    return `${ll.lat.toFixed(4)}°N ${Math.abs(ll.lng).toFixed(4)}°W`;
  }
  const postTag = () => draft.mode === 'report' ? 'R:' + draft.cat : draft.tag;
  async function publish() {
    if (Cloud.on) {
      if (!signedIn()) return needSignIn('Sign in to share your post with everyone.');
      const b = $('#createView [data-share]'); b.disabled = true; b.textContent = 'Sharing…';
      try {
        const id = (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36);
        const gid = draft.group || null;
        const image_url = draft.img ? (gid ? await Cloud.uploadGroup(draft.img, gid, id) : await Cloud.upload(draft.img, id)) : null;
        const row = { caption: draft.caption.trim().slice(0, 800), tag: postTag(), image_url, place_name: draft.place.name.slice(0, 120), lng: draft.place.lng, lat: draft.place.lat };
        if (gid) row.group_id = gid;
        const { error } = await Cloud.sb.from('posts').insert(row);
        if (error) throw error;
        await Cloud.loadFeed(); closeCreate(); S.filter = 'all'; setView('feed'); drawUserPins(); showToast(draft.mode === 'report' ? 'Report sent. Thanks for looking out.' : gid ? 'Shared with ' + groupOf(gid).name : 'Posted');
        requestAnimationFrame(() => { const el = document.querySelector('#feed .post'); if (el) el.classList.add('fresh'); });
      } catch (e) { b.disabled = false; ready(); showToast('Could not post: ' + String(e.message || e).slice(0, 60)); }
      return;
    }
    const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), img: draft.img, caption: draft.caption.trim().slice(0, 800), tag: postTag(), place: draft.place };
    S.posts.unshift(p); await persist('posts');
    closeCreate(); drawUserPins(); S.filter = 'all'; setView('feed'); showToast(draft.mode === 'report' ? 'Report sent' : 'Posted');
    requestAnimationFrame(() => { const el = document.querySelector('.post[data-id="u' + p.id + '"]'); if (el) el.classList.add('fresh'); });
  }

  /* ---------- your posts as round photo pins on the map ---------- */
  function drawUserPins() {
    S.pins.forEach(m => m.remove()); S.pins = [];
    const mine = r => !!(Cloud.user && r.user_id === Cloud.user.id);
    [...S.remote.map(r => ({ id: 's' + r.id, img: imgOf(r.image_url), grp: !!r.group_id, caption: r.caption, tag: r.tag, t: r.created_at, mine: mine(r), place: r.lng != null ? { lng: r.lng, lat: r.lat } : null, fid: 's' + r.id })), ...S.posts.map(p => ({ ...p, mine: true, fid: 'u' + p.id }))].forEach(p => {
      if (!p.place) return;
      const box = document.createElement('div'); box.dataset.id = p.id;
      if (isReport(p.tag)) {
        const R = rstate({ ...p, id: p.fid }); if (R.gone) return;
        box.className = 'rpin' + (R.fresh ? ' hot' : ''); box.style.setProperty('--c', R.col); box.title = R.label; box.innerHTML = `<b>${R.emo}</b>`;
      } else { box.className = 'ppin' + (p.grp ? ' grp' : ''); box.innerHTML = p.img ? `<img src="${p.img}" alt="">` : `<b>${esc((p.caption || '•').slice(0, 1))}</b>`; }
      box.onclick = e => { e.stopPropagation(); openPost(p.fid); };
      const wrap = document.createElement('div'); wrap.className = 'mkbox'; wrap.appendChild(box); // MapLibre owns the wrapper's transform; the pin animates inside it
      S.pins.push(new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([p.place.lng, p.place.lat]).addTo(map));
    });
  }
  function openPost(fid) { S.filter = 'all'; setView('feed'); requestAnimationFrame(() => { const el = document.querySelector(`.post[data-id="${CSS.escape(fid)}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); } }); }
  function focusPin(id) { const el = document.querySelector(`.ppin[data-id="${id}"]`); if (el) { el.classList.remove('focus'); void el.offsetWidth; el.classList.add('focus'); } }

  /* ---------- activity and profile ---------- */
  function renderActivity() {
    const L = Live.st; const since = S.seen || 0; const rows = [];
    L.alerts.forEach((a, i) => rows.push({ t: a.sent, a: acct('Weather'), html: `<b>${esc(a.event)}</b> ${esc((a.headline || '').slice(0, 120))}`, k: 'alert', i }));
    feedItems().filter(x => x.kind === 'report').forEach(x => rows.push({ t: x.t, a: x.a, html: `reported <b>${x.rs.emo} ${esc(x.rs.label)}</b>${x.place ? ' at ' + esc(x.place.name) : ''}`, fid: x.id }));
    L.traffic.incidents.forEach((n, i) => rows.push({ t: n.start, a: acct(n.source), html: `<b>${esc(n.title)}</b> ${esc((n.desc || '').slice(0, 100))}`, k: 'traffic', i }));
    L.news.slice(0, 15).forEach((n, i) => rows.push({ t: n.published, a: acct(n.source), html: `posted <b>${esc(n.title)}</b>`, k: 'news', i, img: n.img }));
    Object.keys(S.likes).length && rows.push({ t: new Date(Math.max(...Object.values(S.likes))).toISOString(), a: meAcct(), html: `You liked ${Object.keys(S.likes).length} post${Object.keys(S.likes).length > 1 ? 's' : ''}` });
    rows.sort((x, y) => new Date(y.t || 0) - new Date(x.t || 0));
    const newer = rows.filter(r => new Date(r.t || 0) > since), older = rows.filter(r => !(new Date(r.t || 0) > since));
    const row = r => `<button class="arow" ${r.k ? `data-k="${r.k}" data-i="${r.i}"` : r.fid ? `data-fid="${esc(r.fid)}"` : ''}>${avatar(r.a, 40)}<div>${r.html}<small>${ago(r.t)}</small></div>${r.img ? `<img src="${esc(r.img)}" alt="" onerror="this.remove()">` : ''}</button>`;
    $('#sv-activity').innerHTML = `<header class="top"><b class="title">Activity</b></header>${newer.length ? '<div class="sideHead">New</div>' + newer.map(row).join('') : ''}<div class="sideHead">Earlier</div>${older.map(row).join('') || '<p class="fine">Nothing yet.</p>'}`;
    $('#sv-activity').querySelectorAll('.arow[data-k]').forEach(b => b.onclick = () => { setView('map'); Live.focus(b.dataset.k, +b.dataset.i); });
    $('#sv-activity').querySelectorAll('.arow[data-fid]').forEach(b => b.onclick = () => openPost(b.dataset.fid));
    S.seen = Date.now(); persist('seen'); $('#tabbar .dot').hidden = true;
  }
  function renderProfile() {
    const me = meAcct();
    const L = signedIn() ? S.remote.filter(r => r.user_id === Cloud.user.id).map(r => ({ id: 's' + r.id, img: imgOf(r.image_url), caption: r.caption, place: r.lng != null ? { name: r.place_name, lng: r.lng, lat: r.lat } : null })).concat(S.posts) : S.posts;
    $('#sv-profile').innerHTML = `<header class="top"><b class="title">${esc(me.h)}</b></header>
      <div class="prof">${avatar(me, 86)}<div class="nums"><div><b>${L.length}</b><span>posts</span></div><div><b>${Object.keys(S.likes).length}</b><span>liked</span></div><div><b>${Object.keys(S.saved).length}</b><span>saved</span></div></div></div>
      <div class="bio"><b>${esc(me.name)}</b>${S.me && S.me.bio ? `<p>${esc(S.me.bio)}</p>` : ''}</div>
      <div class="prow">${Cloud.on && !signedIn() ? '<button class="btn primary" data-in>Sign in or join</button>' : `<button class="btn" data-edit>${S.me && !S.me.placeholder ? 'Edit profile' : 'Set up your profile'}</button>`}<button class="btn" data-new>New post</button>${signedIn() ? '<button class="btn" data-out>Sign out</button>' : ''}</div>
      ${Cloud.on && !Cloud.groupsOff ? `<div class="pgroups"><div class="sideHead">Your groups</div><div>${S.groups.map(g => `<button data-scope="${g.id}" style="--c:${esc(g.color)}"><span class="ge">${esc(g.emoji)}</span><b>${esc(g.name)}</b><small>${g.role === 'owner' ? 'Owner' : 'Member'}</small></button>`).join('')}<button data-scope="new" class="gnew"><span class="ge">+</span><b>New or join</b><small>Family, friends</small></button></div></div>` : ''}
      ${installRow()}
      <div class="ptabs"><button aria-selected="true">${svg('grid', 'sm')}</button></div>
      <div class="pgrid">${L.length ? L.map(p => `<button data-id="${p.id}">${p.img ? `<img src="${p.img}" alt="">` : `<span>${esc((p.caption || '').slice(0, 60))}</span>`}</button>`).join('') : `<div class="empty" style="grid-column:1/-1">${svg('camera', 'big')}<b>Share your first photo</b><span>Waterfalls, wildlife, traffic, sunsets. Every post lands on the map.</span></div>`}</div>`;
    const v = $('#sv-profile');
    const q = k => v.querySelector(k);
    if (q('[data-edit]')) q('[data-edit]').onclick = editProfile; q('[data-new]').onclick = openCreate;
    if (q('[data-in]')) q('[data-in]').onclick = () => needSignIn('Post photos, like and comment with everyone in the Smokies.');
    if (q('[data-install]')) q('[data-install]').onclick = install;
    v.querySelectorAll('.pgroups [data-scope]').forEach(b => b.onclick = () => setScope(b.dataset.scope));
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

  /* ---------- private groups: families, friends, neighborhoods ---------- */
  const GEMO = ['🏡', '🏕️', '🌲', '⛰️', '🎣', '🦌', '🐻', '🛶', '🔥', '🌻', '🐾', '🚙', '❄️', '🍂', '⭐', '❤️'];
  const GCOL = ['#3f8f4f', '#2f7f9f', '#8a5a33', '#c96a2b', '#7a4fbf', '#c0465f', '#4f6f2f', '#3d5fa8'];
  const inviteLink = g => SITE + '#join=' + g.invite_code;
  function needGroups() {
    if (!Cloud.on) { showToast('Groups need accounts, which are not on in this preview'); return false; }
    if (Cloud.groupsOff) { showToast('Groups turn on after the latest database update'); return false; }
    if (!signedIn()) { needSignIn('Sign in to create or join a private group.'); return false; }
    return true;
  }
  function openGroups() {
    if (!needGroups()) return;
    sheet(`<div class="gintro"><span>🏡</span><h4>Private groups</h4><p class="fine">A feed just for your family or friends. Only people you invite can see what's posted, and it never shows up for anyone else.</p></div>
      <div class="menu"><button data-m="create">${svg('plus', 'sm')} Create a group</button><button data-m="join">${svg('link', 'sm')} Join with a code</button><button data-x>Cancel</button></div>`, s => {
      s.querySelector('[data-m="create"]').onclick = () => { closeSheet(); setTimeout(createGroup, 280); };
      s.querySelector('[data-m="join"]').onclick = () => { closeSheet(); setTimeout(() => joinGroup(), 280); };
    });
  }
  function createGroup() {
    let emo = GEMO[0], col = GCOL[0];
    sheet(`<h4>New private group</h4><form class="pform gform"><div class="gprev" style="--c:${col}"><span>${emo}</span></div>
      <label>Name<input name="name" maxlength="40" placeholder="The Harker family" required autocomplete="off"></label>
      <div class="gpick">${GEMO.map((e, i) => `<button type="button" data-e="${e}" class="${i ? '' : 'on'}">${e}</button>`).join('')}</div>
      <div class="gcols">${GCOL.map((c, i) => `<button type="button" data-c="${c}" class="${i ? '' : 'on'}" style="--c:${c}" aria-label="Color"></button>`).join('')}</div>
      <button class="btn primary">Create group</button></form>`, s => {
      const f = s.querySelector('form'), pv = s.querySelector('.gprev');
      s.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { emo = b.dataset.e; s.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', x === b)); pv.querySelector('span').textContent = emo; bump(pv); });
      s.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { col = b.dataset.c; s.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); pv.style.setProperty('--c', col); });
      setTimeout(() => f.name.focus(), 350);
      f.onsubmit = async e => {
        e.preventDefault(); const btn = f.querySelector('.btn'); btn.disabled = true; btn.textContent = 'Creating…';
        const { data, error } = await Cloud.sb.rpc('create_group', { gname: f.name.value.trim(), gemoji: emo, gcolor: col });
        if (error) { btn.disabled = false; btn.textContent = 'Create group'; return showToast(error.message.slice(0, 80)); }
        await Cloud.loadGroups(); S.scope = data.id; Store.set('scope', data.id); closeSheet(); refresh();
        setTimeout(() => showInvite(data, true), 300);
      };
    });
  }
  function showInvite(g, fresh) {
    const link = inviteLink(g);
    sheet(`<div class="ginvite" style="--c:${esc(g.color)}"><span class="gbig">${esc(g.emoji)}</span><h4>${fresh ? 'Invite your people' : 'Invite to ' + esc(g.name)}</h4>
      <p class="fine">Send this link to family or friends. When they open it and sign in, they join ${esc(g.name)}.</p>
      <div class="gcode">${esc(g.invite_code).split('').map((ch, i) => `<i style="animation-delay:${i * 40}ms">${ch}</i>`).join('')}</div>
      <div class="pk-acts"><button class="btn" data-copy>${svg('link', 'sm')} Copy link</button><button class="btn primary" data-share>${svg('send', 'sm')} Share invite</button></div>
      <p class="fine">Anyone with the link can join. ${g.role === 'owner' || fresh ? 'You can make a new code from Members if it gets passed around.' : ''}</p></div>`, s => {
      s.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(link); showToast('Invite link copied'); } catch (e) { showToast(link); } };
      s.querySelector('[data-share]').onclick = async () => { try { if (navigator.share) return await navigator.share({ title: `Join ${g.name} on Smokies Live`, text: `Join our private group "${g.name}" on Smokies Live. Code: ${g.invite_code}`, url: link }); } catch (e) { return; } try { await navigator.clipboard.writeText(link); showToast('Invite link copied'); } catch (e) { showToast(link); } };
    });
  }
  function joinGroup(code = '') {
    if (!needGroups()) { if (code) Store.set('joinCode', code); return; }
    sheet(`<h4>Join a group</h4><form class="pform"><label>Invite code<input name="code" value="${esc(code)}" maxlength="12" placeholder="8 letters and numbers" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;font-family:var(--font-data)"></label><button class="btn primary">Join</button></form><p class="fine">Ask someone in the group to send you their invite link or code.</p>`, s => {
      const f = s.querySelector('form'); if (!code) setTimeout(() => f.code.focus(), 350);
      f.onsubmit = async e => {
        e.preventDefault(); const btn = f.querySelector('.btn'); btn.disabled = true; btn.textContent = 'Joining…';
        const { data, error } = await Cloud.sb.rpc('join_group', { code: f.code.value.trim() });
        if (error) { btn.disabled = false; btn.textContent = 'Join'; return showToast(/code/i.test(error.message) ? 'That code did not work. Check it and try again.' : error.message.slice(0, 80)); }
        Store.set('joinCode', ''); await Cloud.loadGroups(); await Cloud.loadFeed(); closeSheet(); setScope(data.id); showToast(`Welcome to ${data.name}`);
      };
    });
  }
  async function pendingJoin() { const c = await Store.get('joinCode', ''); if (c && signedIn() && !Cloud.groupsOff) setTimeout(() => joinGroup(c), 600); }
  async function openMembers(g) {
    const { data } = await Cloud.sb.from('group_members').select('user_id, role, joined_at, profiles(handle, name, avatar_url)').eq('group_id', g.id).order('joined_at');
    const owner = g.role === 'owner'; const me = Cloud.user.id;
    sheet(`<h4>${esc(g.emoji)} ${esc(g.name)}</h4><p class="fine" style="text-align:center;margin:-6px 0 10px">${(data || []).length} member${(data || []).length === 1 ? '' : 's'}</p>
      <div class="clist">${(data || []).map(m => `<div class="cm mem">${avatar(authorOf(m.profiles || {}), 36)}<div><b>${esc((m.profiles || {}).name || (m.profiles || {}).handle || 'Member')}</b><small>@${esc((m.profiles || {}).handle || '')}${m.role === 'owner' ? ' · owner' : ''}${m.user_id === me ? ' · you' : ''}</small></div>${owner && m.user_id !== me && m.role !== 'owner' ? `<button class="link danger" data-rm="${m.user_id}">Remove</button>` : ''}</div>`).join('')}</div>
      <div class="menu"><button data-m="invite">${svg('link', 'sm')} Invite people</button>${owner ? '<button data-m="code">New invite code</button><button data-m="del" class="danger">Delete group</button>' : '<button data-m="leave" class="danger">Leave group</button>'}<button data-x>Close</button></div>`, s => {
      s.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const { error } = await Cloud.sb.from('group_members').delete().eq('group_id', g.id).eq('user_id', b.dataset.rm); if (error) return showToast('Could not remove'); b.closest('.mem').classList.add('leave'); showToast('Removed from the group'); });
      s.querySelector('[data-m="invite"]').onclick = () => { closeSheet(); setTimeout(() => showInvite(g), 280); };
      const q = k => s.querySelector(`[data-m="${k}"]`);
      if (q('code')) q('code').onclick = async () => { const { data: c, error } = await Cloud.sb.rpc('new_invite_code', { gid: g.id }); if (error) return showToast('Could not make a new code'); g.invite_code = c; await Cloud.loadGroups(); closeSheet(); setTimeout(() => showInvite(g), 280); showToast('Old invite links no longer work'); };
      if (q('leave')) q('leave').onclick = () => confirmSheet(`Leave ${g.name}?`, 'You will stop seeing its posts. You can rejoin with an invite.', 'Leave group', async () => { await Cloud.sb.from('group_members').delete().eq('group_id', g.id).eq('user_id', me); await Cloud.loadGroups(); await Cloud.loadFeed(); setScope('public'); showToast('You left ' + g.name); });
      if (q('del')) q('del').onclick = () => confirmSheet(`Delete ${g.name}?`, 'This removes the group and every post, photo and comment in it, for everyone. It cannot be undone.', 'Delete group', async () => { const { error } = await Cloud.sb.from('groups').delete().eq('id', g.id); if (error) return showToast('Could not delete'); await Cloud.loadGroups(); await Cloud.loadFeed(); setScope('public'); showToast('Group deleted'); });
    });
  }
  function confirmSheet(title, body, label, fn) {
    closeSheet();
    setTimeout(() => sheet(`<h4>${esc(title)}</h4><p class="fine" style="text-align:center;margin:0 0 14px">${esc(body)}</p><div class="menu"><button data-ok class="danger">${esc(label)}</button><button data-x>Cancel</button></div>`, s => { s.querySelector('[data-ok]').onclick = () => { closeSheet(); fn(); }; }), 280);
  }

  /* ---------- install as an app (home screen, full screen, works offline for the shell) ---------- */
  let installEvt = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function installRow() { return standalone() ? '' : `<button class="install" data-install>${svg('phone')}<div><b>Get the app</b><span>Add Smokies Live to your home screen. It opens full screen like any app.</span></div></button>`; }
  async function install() {
    if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') showToast('Installing Smokies Live'); return; }
    sheet(`<h4>Add to your home screen</h4><ol class="steps">${isIOS() ? `<li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>` : `<li>Open the browser menu (<b>⋮</b>).</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm, then open Smokies Live from your home screen.</li>`}</ol><button class="btn primary" data-x>Got it</button>`);
  }
  function registerSW() {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
    if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic|usercontent/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ---------- start ---------- */
  async function init() {
    await loadLocal(); S.scope = await Store.get('scope', 'public');
    shell(); document.body.dataset.view = 'map'; registerSW();
    if (standalone()) document.body.classList.add('app');
    drawUserPins();
    Cloud.init().then(() => { if (Cloud.on) { refresh(); pendingJoin(); } });
    // the place index is big; fetch it once, after the map has settled
    setTimeout(() => placesReady().then(j => { window.__placeIndex = j.filter(p => p[4] === 1 || p[4] === 0 || /park|trail|waterfall|historic|campground|attraction|amusement/.test(p[3])); }), 8000);
    // new activity dot once feeds arrive
    setInterval(() => { const L = Live.st; const latest = Math.max(0, ...L.news.map(n => +new Date(n.published || 0)), ...L.alerts.map(a => +new Date(a.sent || 0))); $('#tabbar .dot').hidden = !(latest > (S.seen || 0)) || S.view === 'activity'; if (S.view === 'feed' && !document.querySelector('#feed .post')) renderFeed(); }, 5000);
    const h = decodeURIComponent(location.hash || '');
    if (h.startsWith('#post=')) setTimeout(() => { setView('feed'); const el = document.querySelector(`.post[data-id="${CSS.escape(h.slice(6))}"]`); if (el) el.scrollIntoView({ block: 'center' }); }, 4000);
    if (h === '#feed') setView('feed');
    if (h === '#report') setTimeout(() => openCreate('report'), 1500);
    if (h.startsWith('#join=')) { const code = h.slice(6).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); Store.set('joinCode', code); history.replaceState(null, '', location.pathname + location.search); setTimeout(() => { setView('feed'); Cloud.on ? joinGroup(code) : showToast('Open the full site to join this group'); }, 3500); }
    setInterval(() => { if (S.view !== 'map' || !document.hidden) drawUserPins(); }, 5 * 60e3); // reports expire on their own
  }
  return { init, S, setView, openCreate, Store, Cloud, pickPlace, searchPlaces, placesReady, refresh };
})();
