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
  const S = { showPins: (() => { try { return localStorage.getItem('sl-userpins') === '1'; } catch (e) { return false; } })(), view: 'map', posts: [], likes: {}, saved: {}, comments: {}, me: null, stories: [], storyAt: 0, pins: [], seen: 0, news: [], freshNews: new Set(), votes: {}, rvotes: {}, filter: 'all', here: null, groups: [], scope: 'public', signed: {}, members: {}, wall: true };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000; if (s < 0) return 'upcoming'; if (s < 60) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; if (s < 7 * 86400) return Math.round(s / 86400) + 'd'; return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }); };
  const I = { // 24px line icons
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
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
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/>',
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
        this.sb.auth.onAuthStateChange(async (ev, ses) => { const was = this.user && this.user.id; this.user = ses ? ses.user : null; if ((this.user && this.user.id) !== was) { await this.loadMe(); await this.loadGroups(); await this.loadFeed(); refresh(); if (Inbox.ch) { this.sb.removeChannel(Inbox.ch); Inbox.ch = null; } Inbox.load().then(() => Inbox.listen()); if (ev === 'SIGNED_IN') { showToast('Signed in'); pendingJoin(); } } });
        await this.loadMe(); await this.loadGroups(); await this.loadFeed();
        this.sb.channel('posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => this.loadFeed().then(refresh)).subscribe();
        await this.loadNews();
        if (!this.newsOff) this.sb.channel('news').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'news_items' }, ({ new: n }) => newStory(n)).subscribe();
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
    newsOff: false,
    async loadNews() {
      const { data, error } = await this.sb.from('news_items').select('id,source,title,summary,link,img,published,place').order('published', { ascending: false }).limit(150);
      if (error) { this.newsOff = true; return; }
      S.news = data || [];
    },
    groupsOff: false,
    async loadGroups() { // the private groups you belong to
      if (!this.user) { S.groups = []; return; }
      const { data, error } = await this.sb.from('group_members').select('role, groups(*)').eq('user_id', this.user.id);
      if (error) { this.groupsOff = true; S.groups = []; return; }
      this.groupsOff = false;
      S.groups = (data || []).filter(r => r.groups).map(r => ({ ...r.groups, role: r.role })).sort((a, b) => a.name.localeCompare(b.name));
      if (S.scope !== 'public' && !S.groups.some(g => g.id === S.scope)) S.scope = 'public';
      await this.loadMembers();
    },
    async loadMembers() { // everyone in your groups, in one ask: names for tags and the "tag people" picker
      S.members = {}; if (!S.groups.length) return;
      const { data } = await this.sb.from('group_members').select('group_id, user_id, profiles(handle, name, avatar_url)').in('group_id', S.groups.map(g => g.id));
      (data || []).forEach(m => { (S.members[m.group_id] = S.members[m.group_id] || []).push({ id: m.user_id, ...authorOf(m.profiles || {}) }); });
    },
    async signPhotos() { // group photos are private: get short-lived links for the ones in view
      const need = [...new Set(S.remote.flatMap(r => [r.image_url, r.video_url]).filter(u => u && u.startsWith('gp:') && !S.signed[u.slice(3)]))].map(u => u.slice(3));
      if (!need.length) return;
      const { data } = await this.sb.storage.from('group-photos').createSignedUrls(need, 6 * 3600);
      (data || []).forEach(d => { if (d.signedUrl) S.signed[d.path] = d.signedUrl; });
    },
    async uploadGroup(dataUrl, gid, name) {
      const blob = await (await fetch(dataUrl)).blob(); const path = `${gid}/${name}.jpg`;
      const { error } = await this.sb.storage.from('group-photos').upload(path, blob, { contentType: 'image/jpeg' }); if (error) throw error;
      S.signed[path] = dataUrl; return 'gp:' + path;
    },
    async uploadVideo(blob, gid, name) { // public videos sit in your own folder; group videos in the group's private folder
      const ext = /webm/.test(blob.type) ? 'webm' : /quicktime/.test(blob.type) ? 'mov' : 'mp4';
      const bucket = gid ? 'group-photos' : 'photos', path = `${gid || this.user.id}/${name}.${ext}`;
      const { error } = await this.sb.storage.from(bucket).upload(path, blob, { contentType: blob.type || 'video/mp4' }); if (error) throw error;
      if (gid) { S.signed[path] = URL.createObjectURL(blob); return 'gp:' + path; }
      return this.sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    },
    dropFiles(urls) { urls.forEach(u => { if (!u) return; if (u.startsWith('gp:')) this.sb.storage.from('group-photos').remove([u.slice(3)]); else if (u.includes('/photos/')) this.sb.storage.from('photos').remove([u.split('/photos/')[1].split('?')[0]]); }); },
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
    bear: ['Bear', '🐻', '#8a5a33', 4], wildlife: ['Wildlife', '🦌', '#9a7b4f', 4], hazard: ['Hazard', '⚠️', '#c99400', 8], lostpet: ['Lost pet', '🐕', '#9b5bd6', 24 * 14],
    foundpet: ['Found pet', '🐾', '#7a4fbf', 24 * 14], help: ['Help needed', '🙋', '#d6457a', 24], info: ['Heads up', '📣', '#3d6fd6', 12],
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
  const nkey = t => String(t || '').toLowerCase().replace(/\W+/g, '').slice(0, 60);
  function allNews() { // stories from the 5-minute collector, plus the backup feed, one post per story
    const out = new Map();
    (S.news || []).forEach(n => out.set(nkey(n.title), { ...n }));
    Live.st.news.forEach((n, i) => { const k = nkey(n.title); const have = out.get(k); if (have) { have.li = i; if (!have.img && n.img) have.img = n.img; if (!have.place && n.place) have.place = n.place; } else out.set(k, { ...n, id: k, li: i }); });
    const old = Date.now() - 3 * 864e5; // news leaves the feed after 3 days
    return [...out.values()].filter(n => !n.published || +new Date(n.published) > old);
  }
  const imgOf = u => u && u.startsWith('gp:') ? S.signed[u.slice(3)] || '' : u;
  const groupOf = id => id ? S.groups.find(g => g.id === id) || { id, name: 'Private group', emoji: '🔒', color: '#555' } : null;
  const whoIn = (gid, uid) => (S.members[gid] || []).find(m => m.id === uid);
  const tagNames = p => (p.tagged || []).map(u => p.group && whoIn(p.group.id, u)).filter(Boolean);
  const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const withLine = p => { const me = Cloud.user && Cloud.user.id, t = tagNames(p).sort((x, y) => (y.id === me) - (x.id === me)); return t.length ? `<div class="with">${svg('users', 'xs')} with ${andList(t.map(m => `<b>${m.id === me ? 'you' : esc(m.name)}</b>`))}</div>` : ''; };
  const remoteItem = r => ({ id: 's' + r.id, kind: 'user', group: groupOf(r.group_id), a: authorOf(r), t: r.created_at, img: imgOf(r.image_url), vid: r.video_url ? imgOf(r.video_url) : null, vm: r.video_meta, text: r.caption, tag: r.tag, place: r.lng != null ? { name: r.place_name || 'Pinned spot', lng: r.lng, lat: r.lat } : null, likes: r.like_count, ncom: r.comment_count, mine: !!(Cloud.user && r.user_id === Cloud.user.id), tagged: r.tagged || [], ref: { id: 's' + r.id, sid: r.id, remote: true, img: r.image_url, vid: r.video_url, gid: r.group_id, uid: r.user_id, h: r.handle } });

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
    'WATE 6 On Your Side': { h: 'wate6', c: '#2a7de1', i: '6' }, 'Knox News': { h: 'knoxnews', c: '#0b5aa2', i: 'KN' }, 'The Daily Times': { h: 'thedailytimes', c: '#8a2b2b', i: 'DT' },
    WLOS: { h: 'wlos', c: '#1d4f91', i: '13' }, 'Citizen Times': { h: 'citizentimes', c: '#00609c', i: 'CT' }, 'Smoky Mountain News': { h: 'smokymtnnews', c: '#4f6f2f', i: 'SM' }, 'Smoky Mountain Times': { h: 'smokymtntimes', c: '#6a5a2f', i: 'ST' }, 'National Park Service': { h: 'greatsmokynps', c: '#3b5d2a', i: 'NP' }, Gatlinburg: { h: 'gatlinburg', c: '#7a4fbf', i: 'G' },
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
    allNews().forEach(n => out.push({ id: 'n' + n.id, kind: 'news', fresh: S.freshNews.has(n.id), a: acct(n.source), t: n.published, img: n.img, card: n.img ? null : 'headline', title: n.title, text: n.summary && n.summary !== n.title ? n.summary : '', place: n.place, link: n.link, ...(n.li != null ? { refK: 'news', refI: n.li } : {}) }));
    L.events.forEach((n, i) => out.push({ id: 'e' + n.id, kind: 'event', a: acct(n.source), t: n.published || n.start, img: n.img, card: n.img ? null : 'event', title: n.title, text: n.summary, start: n.start, place: n.place, link: n.link, refK: 'event', refI: i }));
    L.traffic.incidents.forEach((n, i) => out.push({ id: 'r' + n.id, kind: 'road', a: acct(n.source), t: n.start, card: 'road', title: n.title, text: n.desc, place: n.place || (n.lng != null ? { name: n.road || 'Road', lng: n.lng, lat: n.lat } : null), link: n.link, refK: 'traffic', refI: i }));
    // mix it like a real feed: your posts and alerts first, then news with webcams and events woven in
    const by = k => out.filter(x => x.kind === k).sort((x, y) => new Date(y.t || 0) - new Date(x.t || 0));
    const head = [...by('alert'), ...by('report'), ...by('user')], cams = by('cam'), roads = by('road');
    const news = (() => { const all = by('news'), lead = [], seenSrc = new Set(); all.forEach(x => { if (!seenSrc.has(x.a.name) && Date.now() - new Date(x.t || 0) < 3 * 864e5) { seenSrc.add(x.a.name); lead.push(x); } }); return [...lead, ...all.filter(x => !lead.includes(x))]; })();
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
  const vAR = m => m && m.w && m.h ? ` style="aspect-ratio:${Math.max(0.8, Math.min(1.91, m.w / m.h)).toFixed(3)}"` : ''; // tall clips show 4:5 in the feed, full height in stories and reels
  const pic = p => p.vid ? `<video class="fv"${vAR(p.vm)} data-src="${esc(p.vid)}" poster="${esc(p.img || '')}" muted playsinline loop preload="none" disablepictureinpicture></video><button class="vplay" data-act="vplay" aria-label="Play video">${svg('play')}</button><button class="snd" data-act="sound" aria-label="Sound on or off">${svg(Vid.sound ? 'sound' : 'mute', 'sm')}</button>`
    : `<img loading="lazy" src="${esc(p.img)}" alt="" onerror="this.parentNode.classList.add('broken')">`;
  function card(p, j) {
    const liked = !!(S.likes[p.id] || S.serverLikes[p.id]), saved = !!S.saved[p.id];
    let media = '';
    const R = p.kind === 'report' ? p.rs : null;
    if (R && p.img) media = `<div class="media${p.vid ? ' vid' : ''}">${pic(p)}<span class="rbadge" style="--c:${R.col}">${R.emo} ${esc(R.label)}</span><i class="burst">${svg('heart')}</i></div>`;
    else if (R) media = `<div class="media txt report" style="--c:${R.col}"><div><span class="remo">${R.emo}</span><small>Community report</small><h3>${esc(R.label)}</h3>${p.place ? `<p>${svg('pin', 'sm')} ${esc(p.place.name)}</p>` : ''}</div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.img) media = `<div class="media${p.live ? ' live' : ''}${p.vid ? ' vid' : ''}">${pic(p)}${p.live ? '<span class="badge">LIVE</span>' : ''}<i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'alert') media = `<div class="media txt alert"><div><small>National Weather Service</small><h3>${esc(p.title)}</h3><p>${esc(p.text.slice(0, 220))}</p></div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'event') { const d = p.start ? new Date(p.start) : null; media = `<div class="media txt event"><div>${d && !isNaN(d) ? `<span class="date"><b>${d.toLocaleDateString('en-US', { timeZone: TZ, day: 'numeric' })}</b>${d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short' })}</span>` : '<small>Event</small>'}<h3>${esc(p.title)}</h3>${p.place ? `<p>${svg('pin', 'sm')} ${esc(p.place.name)}</p>` : ''}</div><i class="burst">${svg('heart')}</i></div>`; }
    else if (p.card === 'road') media = `<div class="media txt road"><div><small>Roads</small><h3>${esc(p.title)}</h3><p>${esc((p.text || '').slice(0, 200))}</p></div><i class="burst">${svg('heart')}</i></div>`;
    else if (p.card === 'cam') media = `<a class="media txt camlink" href="${esc(p.link || '#')}" target="_blank" rel="noopener"><span class="badge">LIVE</span><div><small>Live webcam</small><h3>${esc(p.title)}</h3>${p.spot ? `<p>${svg('pin', 'sm')} ${esc(p.spot)}</p>` : ''}<span class="watch">${svg('eye', 'sm')} Watch live</span></div></a>`;
    else if (p.card === 'headline') media = `<div class="media txt headline" style="--c:${p.a.c}"><div><small>${esc(p.a.name)}</small><h3>${esc(p.title)}</h3></div><i class="burst">${svg('heart')}</i></div>`;
    if (p.fresh && p.kind === 'news') media = media.replace('<i class="burst">', '<span class="newtag">NEW</span><i class="burst">');
    const cap = p.kind === 'news' || p.kind === 'event' ? (p.img ? `<b>${esc(p.title)}</b> ` : '') + esc((p.text || '').slice(0, 240)) : esc(p.text || '');
    const nC = p.ncom != null ? p.ncom : (S.comments[p.id] || []).length;
    const likeLine = p.likes != null ? (p.likes ? `<div class="likes">${p.likes.toLocaleString()} like${p.likes > 1 ? 's' : ''}</div>` : '') : liked ? '<div class="likes">You liked this</div>' : '';
    return `<article class="post" data-id="${esc(p.id)}" style="animation-delay:${Math.min(j, 6) * 60}ms">
      <header>${avatar(p.a, 32, p.kind === 'cam' || p.kind === 'alert')}<div class="who"><b>${esc(p.a.h)}${p.group && S.scope === 'public' ? `<button class="gtag" data-act="group" style="--c:${esc(p.group.color)}">${svg('lock', 'xs')}${esc(p.group.emoji)} ${esc(p.group.name)}</button>` : ''}</b>${p.place ? `<button class="loc" data-act="map">${esc(p.place.name)}</button>` : ''}</div><span class="when">${ago(p.t)}</span><button class="ib" data-act="more" aria-label="More">${svg('more')}</button></header>
      ${media}
      <div class="acts"><button class="ib like${liked ? ' on' : ''}" data-act="like" aria-label="Like" aria-pressed="${liked}">${svg('heart')}</button><button class="ib" data-act="comment" aria-label="Comment">${svg('comment')}</button><button class="ib" data-act="share" aria-label="Share">${svg('send')}</button>${p.place ? `<button class="ib" data-act="map" aria-label="See on map">${svg('pin')}</button>` : ''}<span class="sp"></span><button class="ib save${saved ? ' on' : ''}" data-act="save" aria-label="Save">${svg('save')}</button></div>
      ${R ? `<div class="rvote"><span>${R.still > 1 ? `${R.still} people say it's still there · ` : R.still === 1 && R.mine !== 'still' ? '1 person says it\'s still there · ' : ''}up for ${fmtLeft(R.left)} more</span><button data-act="still" class="${R.mine === 'still' ? 'on' : ''}">${svg('eye', 'sm')} Still there</button><button data-act="cleared" class="${R.mine === 'cleared' ? 'on' : ''}">${svg('check', 'sm')} ${p.mine ? 'Resolved' : 'Cleared'}</button></div>` : ''}
      ${likeLine}${p.tag && !R ? `<div class="ptag">#${esc(p.tag.toLowerCase())}</div>` : ''}
      ${cap ? `<div class="cap"><b>${esc(p.a.h)}</b> ${cap}</div>` : ''}${p.tagged && p.tagged.length ? withLine(p) : ''}
      ${p.link && p.card !== 'cam' ? `<a class="more" href="${esc(p.link)}" target="_blank" rel="noopener">${p.kind === 'news' ? 'Read the full story' : 'More details'}</a>` : ''}
      ${nC ? `<button class="more" data-act="comment">View ${nC} comment${nC > 1 ? 's' : ''}</button>` : ''}
    </article>`;
  }

  /* ---------- stories: the live world as tap-through slides ---------- */
  function buildStories() {
    const L = Live.st; const st = [];
    if (S.posts.length) st.push({ a: meAcct(), label: 'Your story', slides: S.posts.slice(0, 8).map(p => ({ img: p.img, text: p.caption, place: p.place, t: p.t })) });
    const day = S.remote.filter(r => !r.group_id && !isReport(r.tag) && r.image_url && Date.now() - new Date(r.created_at) < 864e5), byU = new Map();
    day.forEach(r => { if (!byU.has(r.user_id)) byU.set(r.user_id, []); byU.get(r.user_id).push(r); });
    const isMe = rs => !!(Cloud.user && rs[0].user_id === Cloud.user.id);
    [...byU.values()].sort((a, b) => isMe(b) - isMe(a) || b.some(r => r.video_url) - a.some(r => r.video_url)).slice(0, 12).forEach(rs => st.push({ a: authorOf(rs[0]), label: isMe(rs) ? 'Your story' : rs[0].handle || 'someone', slides: rs.slice(0, 10).reverse().map(r => ({ img: imgOf(r.image_url), vid: r.video_url ? imgOf(r.video_url) : null, text: r.caption, place: r.lng != null ? { name: r.place_name, lng: r.lng, lat: r.lat } : null, t: r.created_at })) }));
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
      <div class="slide ${sl.alert ? 'alert' : sl.night ? 'night' : sl.wx ? 'wx' : ''}">${sl.vid ? `<video src="${esc(sl.vid)}" poster="${esc(sl.img || '')}" playsinline muted></video><button class="snd" data-snd aria-label="Sound on or off">${svg(Vid.sound ? 'sound' : 'mute', 'sm')}</button>` : sl.img ? `<img src="${esc(sl.img)}" alt="">` : ''}<div class="txt">${sl.live ? '<span class="badge">LIVE</span>' : ''}${sl.title ? `<h3>${esc(sl.title)}</h3>` : ''}${sl.text ? `<p>${esc(sl.text).replace(/\n/g, '<br>')}</p>` : ''}${sl.place || sl.fly ? `<button class="btn primary" data-go>${svg('pin', 'sm')} See it on the map</button>` : ''}</div></div>
      <button class="tap l" aria-label="Previous"></button><button class="tap r" aria-label="Next"></button>`;
    v.querySelector('[data-x]').onclick = closeStory;
    v.querySelector('.tap.l').onclick = () => k > 0 ? openStory(i, k - 1) : openStory(Math.max(0, i - 1), 0);
    v.querySelector('.tap.r').onclick = () => openStory(i, k + 1);
    const go = v.querySelector('[data-go]'); if (go) go.onclick = () => { closeStory(); setView('map'); stopOrbit(); map.flyTo({ ...(sl.fly || { center: [sl.place.lng, sl.place.lat], zoom: 14, pitch: 62 }), duration: 3000, curve: 1.5, easing: easeInOut, essential: true }); };
    // swipe down to close
    let y0 = null; v.ontouchstart = e => y0 = e.touches[0].clientY; v.ontouchend = e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) closeStory(); y0 = null; };
    clearTimeout(storyT);
    const sv = v.querySelector('.slide video');
    if (sv) { // a video slide runs as long as the video, with sound if you turned it on
      Vid.stop(); sv.muted = !Vid.sound; sv.play().catch(() => { sv.muted = true; sv.play().catch(() => {}); });
      sv.onloadedmetadata = () => { const b = v.querySelector('.bars i.run b'); if (b && isFinite(sv.duration)) b.style.animationDuration = sv.duration.toFixed(1) + 's'; };
      sv.onended = () => openStory(i, k + 1); storyT = setTimeout(() => openStory(i, k + 1), 62000);
      v.querySelector('[data-snd]').onclick = e => { e.stopPropagation(); Vid.toggle(); sv.muted = !Vid.sound; if (sv.paused) sv.play().catch(() => {}); };
    } else storyT = setTimeout(() => openStory(i, k + 1), sl.img ? 6000 : 5000);
  }
  function closeStory() { clearTimeout(storyT); const v = $('#storyView'); const sv = v.querySelector('video'); if (sv) sv.pause(); v.classList.add('out'); setTimeout(() => { v.hidden = true; v.classList.remove('out'); v.innerHTML = ''; }, 280); }

  /* ---------- views ---------- */
  function shell() {
    const nav = document.createElement('nav'); nav.id = 'tabbar'; nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = `<div class="logo">${window.Brand ? Brand.mark(30) : ''}<span>Smokies <em>Live</em></span></div>` +
      [['feed', 'home', 'Feed'], ['map', 'map', 'Map'], ['create', 'plus', 'Share'], ['today', 'sun', 'Today'], ['more', 'menu', 'More']].map(([k, ic, l]) => `<button data-v="${k}" aria-label="${l}"${k === 'feed' ? ' aria-current="page"' : ''}>${k === 'profile' ? `<span class="me">${svg(ic)}</span>` : svg(ic)}<span>${l}</span>${k === 'feed' ? '<i class="dot" hidden></i>' : ''}</button>`).join('');
    document.body.appendChild(nav);
    nav.querySelectorAll('button').forEach(b => b.onclick = () => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); b.dataset.v === 'create' ? (window.UX ? UX.share() : openCreate()) : setView(b.dataset.v); });
    const v = document.createElement('div'); v.id = 'socialView'; v.hidden = true;
    v.innerHTML = `<div class="col"><div id="sv-feed" class="pane"><div class="ptr" aria-hidden="true"><i></i></div><header class="top"><div class="logo"><span>Smokies <em>Live</em></span></div><button class="rbtn" data-report>${svg('alert', 'sm')} Report</button><button class="ib" data-v="activity" aria-label="Activity">${svg('heart')}</button><button class="ib dmb" data-dm aria-label="Messages">${svg('send')}<i class="cnt" hidden></i></button></header><div id="scopes" class="scopes" role="tablist" hidden></div><div id="stories" class="stories"></div><div id="fchips" class="chips" role="tablist"></div><div id="feed"></div></div>
      <div id="sv-activity" class="pane"></div><div id="sv-profile" class="pane"></div><div id="sv-today" class="pane"></div><div id="sv-more" class="pane"></div></div><aside class="side" id="sv-side"></aside>`;
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
    $('#feed').addEventListener('dblclick', e => { const m = e.target.closest('.media'); if (m && !e.target.closest('.snd,.vplay')) { const id = m.closest('.post').dataset.id; if (S.likes[id] || S.serverLikes[id]) { const h = m.querySelector('.burst'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } else like(id, true, m); } });
    let lastTap = 0; $('#feed').addEventListener('touchend', e => { const m = e.target.closest('.media'); if (!m || e.target.closest('.snd,.vplay')) return; const n = Date.now(); if (n - lastTap < 300) { const id = m.closest('.post').dataset.id; if (!(S.likes[id] || S.serverLikes[id])) like(id, true, m); else { const h = m.querySelector('.burst'); h.classList.remove('go'); void h.offsetWidth; h.classList.add('go'); } e.preventDefault(); } lastTap = n; });
  }
  function pullToRefresh(sv) {
    const ind = sv.querySelector('.ptr'); let y0 = null, dy = 0, busy = false;
    sv.addEventListener('touchstart', e => { if (S.view === 'feed' && sv.scrollTop <= 0 && !busy) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
    sv.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); const k = Math.min(1, dy / 90); ind.style.setProperty('--k', k); ind.classList.toggle('show', dy > 8); ind.classList.toggle('arm', dy > 90); }, { passive: true });
    sv.addEventListener('touchend', async () => {
      if (y0 == null) return; y0 = null;
      if (dy <= 90) { ind.classList.remove('show', 'arm'); return; }
      busy = true; ind.classList.add('spin');
      await Promise.race([Promise.all([Live.refresh ? Live.refresh() : null, Cloud.on ? Cloud.loadFeed() : null, Cloud.on ? Cloud.loadNews() : null]), new Promise(r => setTimeout(r, 12000))]);
      renderFeed(); drawUserPins(); ind.classList.remove('spin', 'show', 'arm'); busy = false;
    });
  }
  function setView(v) {
    if (v !== S.view) Wall.g = null; // coming back to a wall plays its entrance again
    S.view = v; document.body.dataset.view = v; if (window.UX) UX.closeSheet();
    document.querySelectorAll('#tabbar button').forEach(b => b.toggleAttribute('aria-current', b.dataset.v === v));
    const sv = $('#socialView');
    if (v === 'map') { sv.classList.add('out'); setTimeout(() => { if (S.view === 'map') { sv.hidden = true; sv.classList.remove('out'); } }, 300); return; }
    sv.hidden = false; sv.classList.remove('out');
    ['feed', 'activity', 'profile', 'today', 'more'].forEach(k => $('#sv-' + k).hidden = k !== v);
    if (v === 'feed') renderFeed(); if (v === 'activity') renderActivity(); if (v === 'profile') renderProfile();
    if ((v === 'today' || v === 'more') && window.UX) UX.render(v, $('#sv-' + v));
    document.querySelectorAll('#tabbar button').forEach(b => b.toggleAttribute('aria-current', b.dataset.v === v || (b.dataset.v === 'more' && (v === 'activity' || v === 'profile'))));
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
    S.scope = id; Store.set('scope', id); S.filter = 'all'; Wall.g = null;
    if (S.view !== 'feed') setView('feed'); else renderFeed();
    $('#socialView').scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderGroupFeed(g) {
    const items = S.remote.filter(r => r.group_id === g.id).map(remoteItem);
    items.forEach(x => { if (isReport(x.tag)) { x.kind = 'report'; x.rs = rstate(x); } });
    feedCache = items.filter(x => !(x.kind === 'report' && x.rs.gone));
    const n = (S.members[g.id] || []).length, wall = S.wall; Wall.loadFont();
    $('#feed').innerHTML = `<div class="ghead" style="--c:${esc(g.color)}"><span class="gbig">${esc(g.emoji)}</span><div><h2>${esc(g.name)}</h2><span>${svg('lock', 'xs')} Private${n ? ` · ${n} member${n === 1 ? '' : 's'}` : ''} · only members see this</span></div>
      <div class="gacts"><button class="btn primary" data-g="post">${svg('camera', 'sm')} Pin a photo</button><button class="btn" data-g="invite">${svg('link', 'sm')} Invite</button><button class="btn" data-g="members">${svg('users', 'sm')} Members</button></div>
      <div class="gview" role="tablist" data-on="${wall ? 'wall' : 'list'}"><button role="tab" data-w="wall" aria-selected="${wall}">${svg('grid', 'xs')} Wall</button><button role="tab" data-w="list" aria-selected="${!wall}">${svg('comment', 'xs')} Posts</button><i></i></div></div>` +
      (!feedCache.length ? `<div class="wall empty-wall"><div class="pol ghost" style="--r:-3deg;--pc:#d94a3a"><i class="pin"></i><div class="ph">${svg('camera', 'big')}</div><div class="hw"><b>Your first memory</b><span>goes right here</span></div></div><p>Pin the first photo for ${esc(g.name)}. Only people in this group will ever see it.</p></div>`
        : wall ? Wall.html(feedCache, g.id) : feedCache.map(card).join(''));
    const f = $('#feed');
    f.querySelector('[data-g="post"]').onclick = () => openCreate('post');
    f.querySelector('[data-g="invite"]').onclick = () => showInvite(g);
    f.querySelector('[data-g="members"]').onclick = () => openMembers(g);
    f.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const w = b.dataset.w === 'wall'; if (w === S.wall) return; S.wall = w; Store.set('wall', w); renderGroupFeed(g); });
    if (wall) Wall.wire(f);
  }
  /* ---------- the group wall: every photo is a Polaroid pinned up, dated and labeled by hand ---------- */
  const Wall = {
    font: false,
    loadFont() { if (this.font) return; this.font = true; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap'; document.head.appendChild(l); },
    hash(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); },
    day(t) { const d = new Date(t); return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }) + (d.getFullYear() !== new Date().getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ''); },
    spot(p) { return p.place && p.place.name !== 'Pinned spot' ? p.place.name.split(',')[0] : ''; },
    one(p, j, isNew) {
      const h = this.hash(p.id), r = ((h % 9) - 4) * 0.8 + (j % 2 ? 0.6 : -0.6), pin = h % 3 === 0 ? 'tape' : 'pin', hue = ['#d94a3a', '#e0a526', '#3f8f6f', '#3f6f9f'][h % 4];
      const me = Cloud.user && Cloud.user.id, tags = tagNames(p), who = tags.length ? `<span class="w">w/ ${esc(andList(tags.sort((x, y) => (y.id === me) - (x.id === me)).map(m => m.id === me ? 'you' : m.name.split(' ')[0])))}</span>` : '';
      const delay = `animation-delay:${Math.min(j, 8) * 55}ms`;
      if (!p.img) { // words only, or a report: a sticky note
        const R = p.kind === 'report' && RC[(p.tag || '').slice(2)];
        return `<button class="pol note${R ? ' rep' : ''}${isNew ? ' fresh' : ''}" data-id="${esc(p.id)}" style="--r:${r.toFixed(1)}deg;--pc:${hue};${delay}"><i class="${pin}"></i><div class="hw"><p>${R ? R[1] + ' ' : ''}${esc((p.text || (R ? R[0] : '')).slice(0, 140))}</p><span class="d">${this.day(p.t)}${this.spot(p) ? ' · ' + esc(this.spot(p)) : ''}</span>${who}</div><span class="by">${avatar(p.a, 20)}</span></button>`;
      }
      return `<button class="pol${isNew ? ' fresh' : ''}" data-id="${esc(p.id)}" style="--r:${r.toFixed(1)}deg;--pc:${hue};${delay}"><i class="${pin}"></i><div class="ph"><img src="${esc(p.img)}" alt="" loading="lazy" decoding="async">${p.vid ? `<span class="vb">${svg('play', 'sm')}</span>` : ''}</div>
        <div class="hw"><span class="d">${this.day(p.t)}</span>${this.spot(p) ? `<span class="l">${esc(this.spot(p))}</span>` : ''}${who}</div><span class="by">${avatar(p.a, 20)}</span>${p.ncom || p.likes ? `<span class="ct">${p.likes ? `${svg('heart', 'xs')}${p.likes}` : ''}${p.ncom ? ` ${svg('comment', 'xs')}${p.ncom}` : ''}</span>` : ''}</button>`;
    },
    html(items, gid) { // a redraw of the same wall stays still; only photos that just arrived drop in
      const calm = this.g === gid, seen = this.seen || new Set(); this.g = gid; this.seen = new Set(items.map(p => p.id));
      return `<div class="wall${calm ? ' calm' : ''}">${items.map((p, j) => this.one(p, j, calm && !seen.has(p.id))).join('')}</div>`; },
    wire(f) { const w = f.querySelector('.wall'); if (w) w.onclick = e => { const b = e.target.closest('.pol[data-id]'); if (b) this.open(b.dataset.id, b); }; },
    open(id, from) { // lift the Polaroid off the wall and show the whole post
      const p = feedCache.find(x => x.id === id); if (!p) return;
      let v = $('#wallZoom'); if (!v) { v = document.createElement('div'); v.id = 'wallZoom'; document.body.appendChild(v); v.addEventListener('click', e => { if (e.target.closest('[data-zx]')) return this.close(); onFeedClick(e); const a = e.target.closest('[data-act]'); if (a && /^(map|group)$/.test(a.dataset.act)) this.close(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); }); }
      v.hidden = false; v.className = '';
      v.innerHTML = `<div class="scrim" data-zx></div><div class="wz"><button class="ib zx" data-zx aria-label="Close">${svg('close')}</button>${p.img ? `<div class="wzcap hw2"><span>${this.day(p.t)}</span>${this.spot(p) ? `<span>${esc(this.spot(p))}</span>` : ''}</div>` : ''}${card(p, 0)}</div>`;
      const box = v.querySelector('.wz');
      const cap = box.querySelector('.wzcap'), med = box.querySelector('.post .media'); if (cap && med) med.after(cap); // the handwriting sits right under the photo, like the real thing
      if (from && box.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) { // grows out of the Polaroid you tapped
        const a = from.getBoundingClientRect(), b = box.getBoundingClientRect(), sx = a.width / b.width;
        from.classList.add('lifted');
        box.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${sx}) rotate(${getComputedStyle(from).getPropertyValue('--r') || '0deg'})`, opacity: .6 }, { transform: 'translate(0,0) scale(1.015) rotate(0deg)', opacity: 1, offset: .75 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
        v.querySelector('.scrim').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      }
      this.from = from;
    },
    close() {
      const v = $('#wallZoom'); if (!v || v.hidden) return; Vid.stop(); v.classList.add('out');
      if (this.from) this.from.classList.remove('lifted');
      setTimeout(() => { v.hidden = true; v.innerHTML = ''; }, 240);
    },
  };
  function renderFeed() { renderScopes(); const g = S.scope !== 'public' && S.groups.find(x => x.id === S.scope); document.body.classList.toggle('ingroup', !!g); if (g) return renderGroupFeed(g);
    buildStories(); renderStories(); const all = feedItems(); renderChips(all); feedCache = filtered(all); const f = $('#feed');
    if (!feedCache.length && all.length) { f.innerHTML = `<div class="empty">${svg(S.filter === 'report' ? 'alert' : 'search', 'big')}<b>${S.filter === 'report' ? 'All quiet right now' : 'Nothing here yet'}</b><span>${S.filter === 'report' ? 'No open community reports. See something on the road or trail? Let people know.' : S.filter === 'near' ? 'Nothing posted within 25 km of you.' : 'Try another filter.'}</span>${S.filter === 'report' || S.filter === 'near' ? '<button class="btn primary" data-newrep>Report something</button>' : ''}</div>`; const nb = f.querySelector('[data-newrep]'); if (nb) nb.onclick = () => openCreate('report'); return; }
    if (feedCache.length) return pageFeed(f);
    f.innerHTML = feedCache.length ? feedCache.map(card).join('') : `<div class="empty">${Live.st.blocked ? `The feed needs live data, which this preview blocks. Open <a href="${SITE}" target="_blank" rel="noopener">the full site</a>.` : 'Loading the latest from the mountains…'}</div>`; }
  // the feed draws a page at a time as you scroll, so phones stay smooth
  const PAGE = 10; let shown = 0, pager = null;
  function pageFeed(f) {
    shown = Math.min(feedCache.length, PAGE + 2); f.innerHTML = feedCache.slice(0, shown).map(card).join('') + '<div class="more-sentinel" aria-hidden="true"></div>';
    if (pager) pager.disconnect();
    if (!('IntersectionObserver' in window)) { f.insertAdjacentHTML('beforeend', feedCache.slice(shown).map(card).join('')); shown = feedCache.length; return; }
    pager = new IntersectionObserver(es => { if (!es[0].isIntersecting || shown >= feedCache.length) return; const sen = f.querySelector('.more-sentinel'); const next = feedCache.slice(shown, shown + PAGE); shown += next.length; sen.insertAdjacentHTML('beforebegin', next.map((p, j) => card(p, j)).join('')); if (shown >= feedCache.length) pager.disconnect(); }, { root: null, rootMargin: '1200px 0px' });
    pager.observe(f.querySelector('.more-sentinel'));
  }
  function newStory(n) { // a story just landed from the collector
    if (!n || S.news.some(x => x.id === n.id)) return;
    S.news.unshift(n); S.freshNews.add(n.id);
    if (S.view !== 'feed' || S.scope !== 'public') return;
    const sv = $('#socialView');
    if (sv.scrollTop < 120 && S.filter === 'all') return renderFeed();
    let pill = $('#newPill');
    if (!pill) { pill = document.createElement('button'); pill.id = 'newPill'; pill.onclick = () => { pill.classList.add('out'); sv.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => { pill.remove(); S.filter = 'all'; renderFeed(); }, 350); }; sv.appendChild(pill); pill.dataset.n = 0; const onS = () => { if (sv.scrollTop < 60 && pill.isConnected) { sv.removeEventListener('scroll', onS); pill.click(); } }; sv.addEventListener('scroll', onS, { passive: true }); }
    pill.dataset.n = +pill.dataset.n + 1; const a = acct(n.source);
    pill.innerHTML = `${svg('back', 'sm up')}<span class="av sm" style="--c:${a.c}"><b>${esc(a.i)}</b></span>${+pill.dataset.n} new ${+pill.dataset.n === 1 ? 'story' : 'stories'}`;
    pill.classList.remove('bounce'); void pill.offsetWidth; pill.classList.add('bounce');
    // stories that land while you scroll join the part of the feed you haven't reached yet
    const item = feedItems().find(x => x.id === 'n' + n.id);
    if (item && shown < feedCache.length) { feedCache.splice(shown, 0, item); }
    else if (item) { const f = $('#feed'), sen = f.querySelector('.more-sentinel'); feedCache.push(item); if (sen) { sen.insertAdjacentHTML('beforebegin', card(item, 0)); shown++; } }
  }
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
    if (act === 'sound') Vid.toggle();
    if (act === 'vplay') { const v = b.parentNode.querySelector('video'); if (v) { v.dataset.go = 1; v.paused ? Vid.play(v) : v.pause(); } }
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
    sheet(`<div class="menu">${p.place ? '<button data-m="map">See on map</button>' : ''}<button data-m="share">Share</button>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Open original</a>` : ''}${!mine && p.ref && p.ref.remote && Cloud.on ? `<button data-m="dm">Message @${esc(p.ref.h || 'them')}</button>` : ''}${mine ? '<button data-m="del" class="danger">Delete post</button>' : '<button data-m="report" class="danger">Report</button>'}<button data-x>Cancel</button></div>`, s => {
      s.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
        const m = b.dataset.m; closeSheet();
        if (m === 'map') showOnMap(p); if (m === 'share') share(p); if (m === 'dm') messageUser(p.ref.uid);
        if (m === 'del') {
          if (p.ref.remote) { const { error } = await Cloud.sb.from('posts').delete().eq('id', p.ref.sid); if (error) return showToast('Could not delete'); Cloud.dropFiles([p.ref.img, p.ref.vid]); await Cloud.loadFeed(); }
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
    draft = { mode, cat, img: null, caption: '', tag: null, place: { name: placeName(c), lng: c.lng, lat: c.lat }, placeSet: false, tagged: [], group: S.scope !== 'public' && S.groups.some(g => g.id === S.scope) ? S.scope : null };
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
    const photo = draft.prep ? `<div class="pick vprep"><div class="ph">${svg('video', 'big')}<span>Getting your video ready <b>${Math.round(draft.prep.pct * 100)}%</b></span><div class="vbar"><i style="width:${Math.round(draft.prep.pct * 100)}%"></i></div><small>Making it light so it plays smoothly on phones</small></div></div>`
      : draft.video ? `<label class="pick has vid"><input type="file" accept="image/*,video/*" hidden><video class="prev" src="${draft.video.url}" poster="${draft.img}" muted playsinline autoplay loop></video><span class="vlen">${svg('video', 'xs')} ${fmtDur(draft.video.dur)}</span><span class="chg">${svg('camera', 'sm')} Change</span></label>`
      : draft.img ? `<label class="pick has"><input type="file" accept="image/*,video/*" hidden><img class="prev" src="${draft.img}" alt=""><span class="chg">${svg('camera', 'sm')} Change</span></label>`
      : `<label class="pick${R ? ' small' : ''}"><input type="file" accept="image/*,video/*" hidden><div class="ph">${svg('camera', 'big')}<span>${R ? 'Add a photo or video (optional)' : 'Add a photo or video'}</span>${R ? '' : '<small>Videos can be up to a minute long</small>'}</div></label>`;
    v.querySelector('.cbody').innerHTML = (R ? `<div class="rgrid">${Object.entries(RC).map(([k, [l, e, c]]) => `<button data-cat="${k}" style="--c:${c}" class="${draft.cat === k ? 'on' : ''}"><span>${e}</span>${l}</button>`).join('')}</div>` : '') + photo +
      `<div class="fields"><textarea maxlength="800" placeholder="${R ? 'Add details: which lane, how bad, what to watch for (optional)' : 'Write a caption…'}" rows="3">${esc(draft.caption)}</textarea>
      ${R ? '' : `<div class="tags">${TAGS.map(t => `<button data-t="${t}" class="${draft.tag === t ? 'on' : ''}">${t}</button>`).join('')}</div>`}
      ${Cloud.on && S.groups.length ? `<div class="shareto"><small>Share with</small><div>${[{ id: null, emoji: '', name: 'Everyone', color: '#3f6f8f' }, ...S.groups].map(g => `<button data-gid="${g.id || ''}" class="${(draft.group || null) === g.id ? 'on' : ''}" style="--c:${esc(g.color)}">${g.id ? esc(g.emoji) + ' ' : svg('globe', 'xs')}${esc(g.name)}${g.id ? svg('lock', 'xs') : ''}</button>`).join('')}</div></div>` : ''}
      ${!R && draft.group ? tagRow() : ''}
      <button class="where${draft.placeSet ? ' set' : ''}" data-where>${svg('pin')}<div><b id="crPlace">${esc(draft.place.name)}</b><small>${R ? 'Where is it? Tap to search or move the pin.' : 'Tap to search for a place or set it on the map'}</small></div><span class="link" data-gps>${svg('locate', 'sm')} Here</span></button>
      <p class="fine">${R ? 'Reports show on everyone\'s map and feed and come down on their own after a few hours unless people say it\'s still there. For emergencies, call 911 first.' : Store.shared ? (signedIn() ? 'Your post is public and appears on everyone\'s map. Keep it kind and safe: no faces of strangers, no exact locations of wildlife dens or nests.' : 'You will be asked to sign in when you share.') : 'For now your posts are saved on this device and shown on your map.'}</p></div>`;
    const inp = v.querySelector('input[type=file]');
    const lab = v.querySelector('label.pick'); if (lab) lab.addEventListener('click', primeAudio);
    if (inp) inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const isVid = /^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name);
      clearVideo();
      if (!isVid) { draft.img = await shrink(f); return drawCreate(); }
      const d = draft, ctl = { stop: false }; d.img = null; d.prep = { pct: 0, ctl }; drawCreate();
      try {
        const r = await prepVideo(f, pct => { if (d.prep) d.prep.pct = pct; const bar = $('#createView .vbar i'), t = $('#createView .vprep b'); if (bar) bar.style.width = Math.round(pct * 100) + '%'; if (t) t.textContent = Math.round(pct * 100) + '%'; }, ctl);
        if (draft !== d || ctl.stop) return URL.revokeObjectURL(r.url);
        d.video = r; d.img = r.poster; d.prep = null; drawCreate();
        if (r.trimmed) showToast('Videos can be up to a minute, so it keeps the first 60 seconds');
      } catch (e) { if (draft !== d || ctl.stop) return; d.prep = null; drawCreate(); showToast(String(e.message || e)); }
    };
    v.querySelector('textarea').oninput = e => { draft.caption = e.target.value; ready(); };
    v.querySelectorAll('.tags button').forEach(b => b.onclick = () => { draft.tag = draft.tag === b.dataset.t ? null : b.dataset.t; v.querySelectorAll('.tags button').forEach(x => x.classList.toggle('on', x.dataset.t === draft.tag)); });
    const fine = () => { const el = v.querySelector('.fields > .fine'); if (el && draft.group) el.textContent = `Only members of ${groupOf(draft.group).name} can see this post and its photo. It stays off the public map and feed.`; };
    v.querySelectorAll('.shareto button').forEach(b => b.onclick = () => { const was = draft.group; draft.group = b.dataset.gid || null; if (draft.group !== was) draft.tagged = []; bump(b); drawCreate(); });
    v.querySelectorAll('.tagwho [data-tu]').forEach(b => b.onclick = () => { const u = b.dataset.tu, i = draft.tagged.indexOf(u); if (i < 0) draft.tagged.push(u); else draft.tagged.splice(i, 1); b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', i < 0); bump(b); const c = v.querySelector('.tagwho small em'); if (c) c.textContent = draft.tagged.length ? `${draft.tagged.length} tagged` : ''; });
    fine();
    v.querySelectorAll('.rgrid button').forEach(b => b.onclick = () => { draft.cat = b.dataset.cat; v.querySelectorAll('.rgrid button').forEach(x => x.classList.toggle('on', x === b)); bump(b); ready(); });
    v.querySelector('[data-where]').onclick = async e => {
      if (e.target.closest('[data-gps]')) return locateMe();
      const p = await pickPlace(draft.place, R ? 'Where is it?' : 'Where was this?');
      if (p) { draft.place = p; draft.placeSet = true; drawCreate(); }
    };
    ready();
  }
  function tagRow() { // tag fellow members of the group you're sharing with
    const me = Cloud.user && Cloud.user.id, ms = (S.members[draft.group] || []).filter(m => m.id !== me);
    if (!ms.length) return `<div class="tagwho"><small>Tag people</small><p class="fine">Invite family or friends to this group, then you can tag them in photos.</p></div>`;
    return `<div class="tagwho"><small>Tag people <em>${draft.tagged.length ? draft.tagged.length + ' tagged' : ''}</em></small><div>${ms.map(m => `<button data-tu="${esc(m.id)}" class="${draft.tagged.includes(m.id) ? 'on' : ''}" aria-pressed="${draft.tagged.includes(m.id)}">${avatar(m, 24)}<span>${esc(m.name)}</span><i>${svg('check', 'xs')}</i></button>`).join('')}</div></div>`;
  }
  function ready() { const b = $('#createView [data-share]'); if (!b) return; b.textContent = draft.mode === 'report' ? 'Send' : 'Share'; b.disabled = !!draft.prep || (draft.mode === 'report' ? !draft.cat : !(draft.img || draft.caption.trim())); }

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
  function clearVideo() { if (!draft) return; if (draft.prep) draft.prep.ctl.stop = true; if (draft.video) URL.revokeObjectURL(draft.video.url); draft.prep = null; draft.video = null; }
  function closeCreate() { clearVideo(); const v = $('#createView'); v.classList.add('out'); setTimeout(() => { v.hidden = true; v.innerHTML = ''; }, 280); }
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
  /* ---------- video: shrink on the phone, then play light in the feed ---------- */
  // Clips stay short (up to 60 s), 720p and about 2 Mbit/s, so a minute is ~15 MB: fast on phones,
  // kind to free storage, and the same shape a full-screen swipeable reels feed will use later.
  const VMAX = 60, VBYTES = 25 * 1048576;
  const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  let actx = null;
  function primeAudio() { // a tap is needed before the phone lets us keep the sound while shrinking
    try { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; actx = actx || new A(); if (actx.resume) actx.resume(); } catch (e) { /* no sound track then */ }
  }
  const once = (el, ev) => new Promise((res, rej) => {
    const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error('That video could not be opened here. Try one recorded with your phone camera.')); };
    const off = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
    el.addEventListener(ev, ok); el.addEventListener('error', bad);
  });
  async function prepVideo(file, prog, ctl) {
    const url = URL.createObjectURL(file), v = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.muted = true; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
    try {
      v.src = url; await once(v, 'loadedmetadata');
      if (!v.videoWidth) await once(v, 'loadeddata');
      if (!v.videoWidth) throw new Error('That video could not be opened here. Try one recorded with your phone camera.');
      const dur = isFinite(v.duration) ? v.duration : VMAX, until = Math.min(dur, VMAX);
      const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), w = Math.round(v.videoWidth * k / 2) * 2, h = Math.round(v.videoHeight * k / 2) * 2;
      // a cover frame: shown before the video loads, in the profile grid and on the map pin
      v.currentTime = Math.min(0.4, dur / 3); await once(v, 'seeked');
      const pk = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight)), pc = document.createElement('canvas');
      pc.width = Math.round(v.videoWidth * pk); pc.height = Math.round(v.videoHeight * pk); pc.getContext('2d').drawImage(v, 0, 0, pc.width, pc.height);
      const poster = pc.toDataURL('image/jpeg', 0.8);
      const fits = file.size <= VBYTES && dur <= VMAX + 0.5;
      const canShrink = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
      let blob = null;
      if (fits && file.size < 12 * 1048576 && (/mp4|webm/.test(file.type) || !canShrink)) blob = file; // already light
      else if (canShrink) { try { blob = await reencode(v, w, h, until, prog, ctl); } catch (e) { if (ctl.stop) throw e; blob = null; } }
      if (!blob && fits) blob = file;
      if (!blob) throw new Error('That video is too big to share. Try one under a minute long.');
      if (blob.size > VBYTES) throw new Error('That video is still too big after shrinking. Try a shorter one.');
      prog(1);
      return { blob, url: URL.createObjectURL(blob), poster, dur: blob === file ? dur : until, trimmed: blob !== file && dur > VMAX + 0.5, w: blob === file ? v.videoWidth : w, h: blob === file ? v.videoHeight : h };
    } finally { v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(url); }
  }
  function reencode(v, w, h, until, prog, ctl) { // play it once into a small canvas and record that
    return new Promise(async (res, rej) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const stream = c.captureStream(30); let audio = false;
      try { if (actx) { await actx.resume(); const src = actx.createMediaElementSource(v), dst = actx.createMediaStreamDestination(); src.connect(dst); dst.stream.getAudioTracks().forEach(t => stream.addTrack(t)); audio = true; } } catch (e) { /* silent copy */ }
      const mime = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) return rej(new Error('no recorder'));
      let rec; try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1800000, audioBitsPerSecond: 96000 }); } catch (e) { return rej(e); }
      const parts = []; rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
      let done = false;
      const vis = () => { if (!document.hidden && !done && v.paused) v.play().catch(() => {}); };
      const finish = () => { if (done) return; done = true; v.pause(); document.removeEventListener('visibilitychange', vis); try { rec.stop(); } catch (e) { rej(e); } };
      rec.onstop = () => ctl.stop ? rej(new Error('cancelled')) : res(new Blob(parts, { type: mime.split(';')[0] }));
      document.addEventListener('visibilitychange', vis);
      const tick = () => { if (done) return; if (ctl.stop || v.ended || v.currentTime >= until) return finish(); g.drawImage(v, 0, 0, w, h); prog(Math.min(0.99, v.currentTime / until)); v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick); };
      v.onended = finish;
      v.muted = !audio; v.currentTime = 0; await once(v, 'seeked').catch(() => {});
      g.drawImage(v, 0, 0, w, h); rec.start(1000);
      const fail = e => { done = true; document.removeEventListener('visibilitychange', vis); try { rec.stop(); } catch (_) { /* never started */ } rej(e); };
      try { await v.play(); } catch (e) { if (v.muted) return fail(e); v.muted = true; try { await v.play(); } catch (e2) { return fail(e2); } }
      tick();
    });
  }
  const Vid = { // feed videos load near the screen, only the one you're looking at plays, muted until you ask for sound
    sound: false, cur: null, lite: !!(navigator.connection && navigator.connection.saveData),
    init() {
      if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
      const near = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting && !v.getAttribute('src') && v.dataset.src) { v.preload = 'metadata'; v.src = v.dataset.src; } }), { rootMargin: '700px 0px' });
      const seen = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.intersectionRatio >= 0.6 && !document.hidden) { if (!this.lite || v.dataset.go) this.play(v); } else if (!v.paused) v.pause(); }), { threshold: [0, 0.6] });
      const add = v => { if (v.dataset.w) return; v.dataset.w = 1; near.observe(v); seen.observe(v); const m = v.parentNode; v.onplaying = () => m.classList.add('playing'); v.onpause = () => m.classList.remove('playing'); v.onerror = () => m.classList.add('broken'); };
      const drop = v => { near.unobserve(v); seen.unobserve(v); if (this.cur === v) this.cur = null; v.pause(); v.removeAttribute('src'); v.load(); }; // free the phone's video decoder
      const each = (n, f) => { if (n.nodeType !== 1) return; if (n.matches('video.fv')) f(n); else n.querySelectorAll('video.fv').forEach(f); };
      new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(n => each(n, add)); m.removedNodes.forEach(n => each(n, drop)); })).observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll('video.fv').forEach(add);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    },
    play(v) {
      if (this.cur && this.cur !== v) this.cur.pause();
      this.cur = v; if (!v.getAttribute('src')) v.src = v.dataset.src; v.muted = !this.sound;
      const p = v.play(); if (p) p.catch(() => { if (!v.muted) { v.muted = true; this.sound = false; this.icons(); v.play().catch(() => {}); } });
    },
    toggle() { this.sound = !this.sound; if (this.cur) { this.cur.muted = !this.sound; if (this.sound && this.cur.paused) this.play(this.cur); } this.icons(); },
    icons() { document.querySelectorAll('.snd').forEach(b => { b.innerHTML = svg(this.sound ? 'sound' : 'mute', 'sm'); }); },
    stop() { if (this.cur) this.cur.pause(); },
  };
  const postTag = () => draft.mode === 'report' ? 'R:' + draft.cat : draft.tag;
  async function publish() {
    if (Cloud.on) {
      if (!signedIn()) return needSignIn('Sign in to share your post with everyone.');
      const b = $('#createView [data-share]'); b.disabled = true; b.textContent = 'Sharing…';
      try {
        const id = (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36);
        const gid = draft.group || null;
        const image_url = draft.img ? (gid ? await Cloud.uploadGroup(draft.img, gid, id) : await Cloud.upload(draft.img, id)) : null;
        if (draft.video) b.textContent = 'Uploading video…';
        const video_url = draft.video ? await Cloud.uploadVideo(draft.video.blob, gid, id).catch(e => { Cloud.dropFiles([image_url]); throw e; }) : null;
        const row = { caption: draft.caption.trim().slice(0, 800), tag: postTag(), image_url, place_name: draft.place.name.slice(0, 120), lng: draft.place.lng, lat: draft.place.lat };
        if (gid) row.group_id = gid;
        if (gid && draft.tagged.length && !Cloud.tagsOff) row.tagged = draft.tagged.slice(0, 20);
        if (video_url) { row.video_url = video_url; row.video_meta = { dur: Math.round(draft.video.dur * 10) / 10, w: draft.video.w, h: draft.video.h }; }
        let { error } = await Cloud.sb.from('posts').insert(row);
        if (error && row.tagged && /tagged/.test(error.message || '')) { Cloud.tagsOff = true; delete row.tagged; ({ error } = await Cloud.sb.from('posts').insert(row)); if (!error) setTimeout(() => showToast('Posted. Tags turn on after the latest database update.'), 2600); }
        if (error) { Cloud.dropFiles([image_url, video_url]); throw error; }
        await Cloud.loadFeed(); closeCreate(); S.filter = 'all'; setView('feed'); drawUserPins(); showToast(draft.mode === 'report' ? 'Report sent. Thanks for looking out.' : gid ? 'Shared with ' + groupOf(gid).name : 'Posted');
        requestAnimationFrame(() => { const el = document.querySelector('#feed .wall .pol, #feed .post'); if (el) el.classList.add('fresh'); });
      } catch (e) { b.disabled = false; ready(); const m = String(e.message || e); showToast(/video_url|mime|not supported|exceeded|too large/i.test(m) && draft.video ? 'Video posts are not switched on yet. Try again soon.' : 'Could not post: ' + m.slice(0, 60)); }
      return;
    }
    if (draft.video) return showToast('Videos are shared online. Connect to the internet and sign in to post one.');
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
        if (!S.showPins && !/^R:(closed|flood|smoke)$/.test(p.tag)) return; // urgent reports always show
        box.className = 'rpin' + (R.fresh ? ' hot' : ''); box.style.setProperty('--c', R.col); box.title = R.label; box.innerHTML = `<b>${R.emo}</b>`;
      } else { if (!S.showPins) return; box.className = 'ppin' + (p.grp ? ' grp' : ''); box.innerHTML = p.img ? `<img src="${p.img}" alt="">` : `<b>${esc((p.caption || '•').slice(0, 1))}</b>`; }
      box.onclick = e => { e.stopPropagation(); openPost(p.fid); };
      const wrap = document.createElement('div'); wrap.className = 'mkbox'; wrap.appendChild(box); // MapLibre owns the wrapper's transform; the pin animates inside it
      S.pins.push(new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([p.place.lng, p.place.lat]).addTo(map));
    });
  }
  function openPost(fid) {
    const r = S.remote.find(x => 's' + x.id === fid), g = r && r.group_id && S.groups.find(x => x.id === r.group_id);
    if (g) { // a group post (a tag or a new photo): open its wall and lift that Polaroid
      S.scope = g.id; S.filter = 'all'; if (S.view !== 'feed') setView('feed'); else renderFeed();
      return requestAnimationFrame(() => { const el = document.querySelector(`.pol[data-id="${CSS.escape(fid)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => Wall.open(fid, el), 350); } else { const c = document.querySelector(`.post[data-id="${CSS.escape(fid)}"]`); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
    }
    if (r && !r.group_id) S.scope = 'public';
    S.filter = 'all'; setView('feed'); requestAnimationFrame(() => { const el = document.querySelector(`.post[data-id="${CSS.escape(fid)}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); } }); }
  function focusPin(id) { const el = document.querySelector(`.ppin[data-id="${id}"]`); if (el) { el.classList.remove('focus'); void el.offsetWidth; el.classList.add('focus'); } }

  /* ---------- messages and notifications ---------- */
  // Private one-to-one messages and a list of what people did with your posts. The database
  // decides who can read what (see supabase/05_videos_messages.sql); this is just the screens.
  const Inbox = {
    notes: [], threads: [], open: null, msgs: [], off: false, ch: null,
    async load() {
      if (!signedIn()) { this.notes = []; this.threads = []; return this.badge(); }
      const me = Cloud.user.id;
      const [n, t] = await Promise.all([
        Cloud.sb.from('notifications').select('*,who:profiles!notifications_actor_fkey(handle,name,avatar_url)').order('created_at', { ascending: false }).limit(60),
        Cloud.sb.from('dm_threads').select('*,pa:profiles!dm_threads_a_fkey(id,handle,name,avatar_url),pb:profiles!dm_threads_b_fkey(id,handle,name,avatar_url)').order('last_at', { ascending: false }).limit(80),
      ]);
      if (n.error || t.error) { this.off = true; return this.badge(); }
      this.off = false; this.notes = n.data || [];
      this.threads = (t.data || []).map(x => { const mine = x.a === me; return { ...x, other: (mine ? x.pb : x.pa) || {}, unread: !!x.last_from && x.last_from !== me && new Date(x.last_at) > new Date(mine ? x.a_read : x.b_read) }; });
      this.badge();
    },
    listen() {
      if (this.ch || !signedIn() || this.off) return;
      const me = Cloud.user.id;
      this.ch = Cloud.sb.channel('inbox-' + me)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me }, ({ new: n }) => this.load().then(() => { if (n.kind !== 'dm') { const full = this.notes.find(x => x.id === n.id) || n; showToast(noteLine(full, true)); } if (S.view === 'activity') renderActivity(); }))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, ({ new: m }) => this.incoming(m))
        .subscribe();
    },
    incoming(m) {
      const here = this.open && this.open.id === m.thread_id;
      if (here) { if (!this.msgs.some(x => x.id === m.id)) { this.msgs.push(m); drawChat(true); } if (m.sender !== Cloud.user.id) Cloud.sb.rpc('read_dm', { tid: m.thread_id }); }
      this.load().then(() => {
        if ($('#dmView') && !$('#dmView').hidden && !this.open) drawInbox();
        if (m.sender !== Cloud.user.id && !here) { const t = this.threads.find(x => x.id === m.thread_id); showToast(`${t ? t.other.name || t.other.handle : 'New message'}: ${m.body.slice(0, 70)}`); }
      });
    },
    unread() { return this.notes.filter(n => !n.read_at && n.kind !== 'dm').length; },
    badge() {
      const d = this.threads.filter(t => t.unread).length;
      document.querySelectorAll('[data-dm] .cnt').forEach(b => { b.textContent = d > 9 ? '9+' : d; b.hidden = !d; });
      const dot = $('#tabbar .dot'); if (dot && this.unread() && S.view !== 'activity') dot.hidden = false;
    },
  };
  function noteLine(n, plain) {
    const e = plain ? (x => String(x || '')) : esc, B = x => plain ? x : `<b>${x}</b>`;
    const w = B(e((n.who && (n.who.name || n.who.handle)) || 'Someone')), g = n.group_id ? groupOf(n.group_id) : null, gn = B(e(g ? `${g.emoji} ${g.name}` : 'your group'));
    if (n.kind === 'like') return `${w}${n.n > 1 ? ` and ${n.n - 1} other${n.n > 2 ? 's' : ''}` : ''} liked your post`;
    if (n.kind === 'comment') return `${w} commented: ${e(n.text)}`;
    if (n.kind === 'dm') return `${w} sent you ${n.n > 1 ? n.n + ' messages' : 'a message'}: ${e(n.text)}`;
    if (n.kind === 'tag') return `${w} tagged you in ${gn}${n.text ? ': ' + e(n.text) : ''}`;
    if (n.kind === 'group_post') return `${w} posted in ${gn}${n.text ? ': ' + e(n.text) : ''}`;
    return `${w} joined ${gn}`;
  }
  function openMessages(tid) {
    if (!Cloud.on) return showToast('Messages need an internet connection');
    if (!signedIn()) return needSignIn('Sign in to send and get private messages.');
    let v = $('#dmView'); if (!v) { v = document.createElement('div'); v.id = 'dmView'; document.body.appendChild(v); }
    v.hidden = false; v.classList.remove('out'); Vid.stop();
    if (tid) return openThread(tid);
    Inbox.open = null; drawInbox(); Inbox.load().then(() => { if (!Inbox.open && !v.hidden) drawInbox(); });
  }
  function closeMessages() { const v = $('#dmView'); if (!v) return; Inbox.open = null; v.classList.add('out'); setTimeout(() => { v.hidden = true; v.innerHTML = ''; }, 260); }
  function drawInbox() {
    const v = $('#dmView'); if (!v) return; const me = Cloud.user && Cloud.user.id;
    v.innerHTML = `<header class="dmtop"><button class="ib" data-x aria-label="Back">${svg('back')}</button><b>Messages</b><button class="ib" data-new aria-label="New message">${svg('plus')}</button></header>
      <div class="dmlist">${Inbox.off ? '<p class="fine">Messages are not switched on yet. They will be soon.</p>' : Inbox.threads.length ? Inbox.threads.map((t, i) => `<button class="dmrow${t.unread ? ' unread' : ''}" data-t="${t.id}" style="animation-delay:${Math.min(i, 8) * 40}ms">${avatar(authorOf(t.other), 52)}<div><b>${esc(t.other.name || t.other.handle || 'someone')}</b><span>${t.last_from === me ? 'You: ' : ''}${esc(t.last_text || 'Say hi 👋')}</span></div><small>${ago(t.last_at)}</small>${t.unread ? '<i class="udot"></i>' : ''}</button>`).join('')
        : `<div class="dmempty">${svg('send', 'big')}<b>Your messages</b><p>Send a private message to a neighbor, a friend or family. Only the two of you can read it.</p><button class="btn primary" data-new>Start a conversation</button></div>`}</div>`;
    v.querySelector('[data-x]').onclick = closeMessages;
    v.querySelectorAll('[data-new]').forEach(b => b.onclick = newMessage);
    v.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openThread(b.dataset.t));
  }
  function newMessage() { // find someone by name or handle
    sheet(`<h4>New message</h4><label class="pk-search dmfind">${svg('search', 'sm')}<input type="search" placeholder="Search people by name or @handle" autocomplete="off" aria-label="Search people"></label><div class="dmfound"></div>`, s => {
      const inp = s.querySelector('input'), out = s.querySelector('.dmfound'); let tm = 0;
      setTimeout(() => inp.focus(), 250);
      inp.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => {
        const q = inp.value.trim().replace(/^@/, '').replace(/[%,()*\\]/g, ''); if (q.length < 2) { out.innerHTML = ''; return; }
        const { data } = await Cloud.sb.from('profiles').select('id,handle,name,avatar_url').or(`handle.ilike.%${q}%,name.ilike.%${q}%`).neq('id', Cloud.user.id).limit(12);
        out.innerHTML = (data || []).length ? data.map(p => `<button data-u="${p.id}">${avatar(authorOf(p), 40)}<div><b>${esc(p.name || p.handle)}</b><small>@${esc(p.handle)}</small></div></button>`).join('') : '<p class="fine">Nobody by that name yet.</p>';
        out.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { closeSheet(); messageUser(b.dataset.u); });
      }, 220); };
    });
  }
  async function messageUser(uid) {
    if (!signedIn()) return needSignIn('Sign in to send private messages.');
    const { data, error } = await Cloud.sb.rpc('start_dm', { other: uid });
    if (error) return showToast(/function|schema|exist/i.test(error.message) ? 'Messages are not switched on yet' : error.message);
    await Inbox.load(); openMessages(data);
  }
  async function openThread(tid) {
    let t = Inbox.threads.find(x => x.id === tid);
    if (!t) { await Inbox.load(); t = Inbox.threads.find(x => x.id === tid); if (!t) { drawInbox(); return showToast('That conversation is not available'); } }
    Inbox.open = t; Inbox.msgs = []; drawChat();
    const { data } = await Cloud.sb.from('dm_messages').select('*').eq('thread_id', tid).order('created_at', { ascending: false }).limit(200);
    if (Inbox.open !== t) return;
    Inbox.msgs = (data || []).reverse(); drawChat(true);
    Cloud.sb.rpc('read_dm', { tid }).then(() => Inbox.load());
  }
  const emptyChat = t => `<div class="dmempty">${avatar(authorOf(t.other), 72)}<b>${esc(t.other.name || t.other.handle || 'someone')}</b><p>Only the two of you can read this conversation.</p></div>`;
  function drawChat(onlyList) {
    const v = $('#dmView'), t = Inbox.open; if (!v || !t) return;
    const me = Cloud.user.id;
    const list = Inbox.msgs.map((m, i) => { const prev = Inbox.msgs[i - 1], gap = !prev || new Date(m.created_at) - new Date(prev.created_at) > 30 * 60e3, mine = m.sender === me, next = Inbox.msgs[i + 1];
      return `${gap ? `<div class="dmtime">${new Date(m.created_at).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>` : ''}<div class="bub${mine ? ' me' : ''}${m.pending ? ' pending' : ''}${!next || next.sender !== m.sender ? ' tail' : ''}">${esc(m.body).replace(/\n/g, '<br>')}</div>`; }).join('');
    const box0 = v.querySelector('.dmmsgs');
    if (onlyList && box0) { box0.innerHTML = list || emptyChat(t); box0.scrollTop = box0.scrollHeight; return; }
    v.innerHTML = `<header class="dmtop"><button class="ib" data-back aria-label="Back">${svg('back')}</button>${avatar(authorOf(t.other), 32)}<b class="dmwho">${esc(t.other.name || t.other.handle || 'someone')}<small>@${esc(t.other.handle || '')}</small></b><button class="ib" data-more aria-label="More">${svg('more')}</button></header>
      <div class="dmmsgs">${list || emptyChat(t)}</div>
      <form class="dmsend"><textarea rows="1" maxlength="2000" placeholder="Message…" enterkeyhint="send" aria-label="Message"></textarea><button class="ib" aria-label="Send">${svg('send')}</button></form>`;
    const box = v.querySelector('.dmmsgs'); box.scrollTop = box.scrollHeight;
    v.querySelector('[data-back]').onclick = () => { Inbox.open = null; drawInbox(); };
    v.querySelector('[data-more]').onclick = () => sheet(`<div class="menu"><button data-m="block" class="danger">Block @${esc(t.other.handle || 'this person')}</button><button data-x>Cancel</button></div>`, s => { s.querySelector('[data-m]').onclick = async () => { closeSheet(); const { error } = await Cloud.sb.from('blocks').insert({ blocked: t.other.id }); showToast(error && !/duplicate/i.test(error.message) ? 'Could not block' : 'Blocked. They can\'t message you now.'); }; });
    const f = v.querySelector('form'), ta = f.querySelector('textarea');
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
    ta.oninput = fit;
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); f.requestSubmit(); } };
    f.onsubmit = async e => {
      e.preventDefault(); const body = ta.value.trim(); if (!body) return; ta.value = ''; fit(); ta.focus();
      const tmp = { id: 'tmp' + Date.now(), sender: me, body, created_at: new Date().toISOString(), pending: true }; Inbox.msgs.push(tmp); drawChat(true);
      const { data, error } = await Cloud.sb.from('dm_messages').insert({ thread_id: t.id, body }).select().single();
      Inbox.msgs = Inbox.msgs.filter(x => x !== tmp);
      if (error) { showToast(/row-level/.test(error.message) ? 'You can\'t message this person' : /slow down/i.test(error.message) ? 'Slow down a little' : 'Could not send'); ta.value = body; fit(); }
      else if (!Inbox.msgs.some(x => x.id === data.id)) Inbox.msgs.push(data);
      drawChat(true);
    };
  }

  /* ---------- activity and profile ---------- */
  function renderActivity() {
    const L = Live.st; const since = S.seen || 0; const rows = [];
    Inbox.notes.forEach(n => rows.push({ t: n.created_at, a: authorOf(n.who || {}), html: noteLine(n), unread: !n.read_at, ...(n.kind === 'dm' ? { tid: n.thread_id } : n.post_id ? { fid: 's' + n.post_id } : n.group_id ? { gid: n.group_id } : {}) }));
    L.alerts.forEach((a, i) => rows.push({ t: a.sent, a: acct('Weather'), html: `<b>${esc(a.event)}</b> ${esc((a.headline || '').slice(0, 120))}`, k: 'alert', i }));
    feedItems().filter(x => x.kind === 'report').forEach(x => rows.push({ t: x.t, a: x.a, html: `reported <b>${x.rs.emo} ${esc(x.rs.label)}</b>${x.place ? ' at ' + esc(x.place.name) : ''}`, fid: x.id }));
    L.traffic.incidents.forEach((n, i) => rows.push({ t: n.start, a: acct(n.source), html: `<b>${esc(n.title)}</b> ${esc((n.desc || '').slice(0, 100))}`, k: 'traffic', i }));
    L.news.slice(0, 15).forEach((n, i) => rows.push({ t: n.published, a: acct(n.source), html: `posted <b>${esc(n.title)}</b>`, k: 'news', i, img: n.img }));
    Object.keys(S.likes).length && rows.push({ t: new Date(Math.max(...Object.values(S.likes))).toISOString(), a: meAcct(), html: `You liked ${Object.keys(S.likes).length} post${Object.keys(S.likes).length > 1 ? 's' : ''}` });
    rows.sort((x, y) => new Date(y.t || 0) - new Date(x.t || 0));
    const newer = rows.filter(r => new Date(r.t || 0) > since), older = rows.filter(r => !(new Date(r.t || 0) > since));
    const row = r => `<button class="arow${r.unread ? ' unread' : ''}" ${r.k ? `data-k="${r.k}" data-i="${r.i}"` : r.fid ? `data-fid="${esc(r.fid)}"` : r.tid ? `data-tid="${r.tid}"` : r.gid ? `data-gid="${r.gid}"` : ''}>${avatar(r.a, 40)}<div>${r.html}<small>${ago(r.t)}</small></div>${r.img ? `<img src="${esc(r.img)}" alt="" onerror="this.remove()">` : ''}</button>`;
    $('#sv-activity').innerHTML = `<header class="top"><b class="title">Activity</b><button class="ib dmb" data-dm aria-label="Messages">${svg('send')}<i class="cnt" hidden></i></button></header>${newer.length ? '<div class="sideHead">New</div>' + newer.map(row).join('') : ''}<div class="sideHead">Earlier</div>${older.map(row).join('') || '<p class="fine aempty">Nothing yet.</p>'}`;
    $('#sv-activity').querySelectorAll('.arow[data-k]').forEach(b => b.onclick = () => { setView('map'); Live.focus(b.dataset.k, +b.dataset.i); });
    $('#sv-activity').querySelectorAll('.arow[data-fid]').forEach(b => b.onclick = () => openPost(b.dataset.fid));
    $('#sv-activity').querySelectorAll('.arow[data-tid]').forEach(b => b.onclick = () => openMessages(b.dataset.tid));
    $('#sv-activity').querySelectorAll('.arow[data-gid]').forEach(b => b.onclick = () => { setView('feed'); setScope(b.dataset.gid); });
    Inbox.badge();
    if (Inbox.unread()) { Cloud.sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).neq('kind', 'dm').then(() => Inbox.notes.forEach(n => { if (n.kind !== 'dm') n.read_at = n.read_at || new Date().toISOString(); })); }
    S.seen = Date.now(); persist('seen'); $('#tabbar .dot').hidden = true;
  }
  function renderProfile() {
    const me = meAcct();
    const L = signedIn() ? S.remote.filter(r => r.user_id === Cloud.user.id).map(r => ({ id: 's' + r.id, img: imgOf(r.image_url), vid: !!r.video_url, caption: r.caption, place: r.lng != null ? { name: r.place_name, lng: r.lng, lat: r.lat } : null })).concat(S.posts) : S.posts;
    $('#sv-profile').innerHTML = `<header class="top"><b class="title">${esc(me.h)}</b></header>
      <div class="prof">${avatar(me, 86)}<div class="nums"><div><b>${L.length}</b><span>posts</span></div><div><b>${Object.keys(S.likes).length}</b><span>liked</span></div><div><b>${Object.keys(S.saved).length}</b><span>saved</span></div></div></div>
      <div class="bio"><b>${esc(me.name)}</b>${S.me && S.me.bio ? `<p>${esc(S.me.bio)}</p>` : ''}</div>
      <div class="prow">${Cloud.on && !signedIn() ? '<button class="btn primary" data-in>Sign in or join</button>' : `<button class="btn" data-edit>${S.me && !S.me.placeholder ? 'Edit profile' : 'Set up your profile'}</button>`}<button class="btn" data-new>New post</button>${signedIn() ? '<button class="btn" data-out>Sign out</button>' : ''}</div>
      ${Cloud.on && !Cloud.groupsOff ? `<div class="pgroups"><div class="sideHead">Your groups</div><div>${S.groups.map(g => `<button data-scope="${g.id}" style="--c:${esc(g.color)}"><span class="ge">${esc(g.emoji)}</span><b>${esc(g.name)}</b><small>${g.role === 'owner' ? 'Owner' : 'Member'}</small></button>`).join('')}<button data-scope="new" class="gnew"><span class="ge">+</span><b>New or join</b><small>Family, friends</small></button></div></div>` : ''}
      ${installRow()}
      <div class="ptabs"><button aria-selected="true">${svg('grid', 'sm')}</button></div>
      <div class="pgrid">${L.length ? L.map(p => `<button data-id="${p.id}">${p.vid ? `<i class="gvid">${svg('play', 'xs')}</i>` : ''}${p.img ? `<img src="${p.img}" alt="">` : `<span>${esc((p.caption || '').slice(0, 60))}</span>`}</button>`).join('') : `<div class="empty" style="grid-column:1/-1">${svg('camera', 'big')}<b>Share your first photo</b><span>Waterfalls, wildlife, traffic, sunsets. Every post lands on the map.</span></div>`}</div>`;
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
    await loadLocal(); S.scope = await Store.get('scope', 'public'); S.wall = await Store.get('wall', true);
    shell(); registerSW(); Vid.init();
    // the app opens on the feed; the map is one tap away (and finishes loading behind it)
    setView('feed');
    if (standalone()) document.body.classList.add('app');
    drawUserPins();
    Cloud.init().then(() => { if (Cloud.on) { refresh(); pendingJoin(); Inbox.load().then(() => Inbox.listen()); } });
    document.addEventListener('click', e => { const b = e.target.closest('[data-dm]'); if (b) { e.preventDefault(); openMessages(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && signedIn()) Inbox.load(); });
    window.addEventListener('hashchange', () => { // a tapped phone notification lands here while the app is open
      const x = decodeURIComponent(location.hash || '');
      if (x.startsWith('#dm=')) openMessages(x.slice(4));
      else if (x.startsWith('#post=')) openPost(x.slice(6));
      else if (x === '#activity') setView('activity');
      else return;
      history.replaceState(null, '', location.pathname + location.search);
    });
    // the place index is big; fetch it once, after the map has settled
    setTimeout(() => placesReady().then(j => { window.__placeIndex = j.filter(p => p[4] === 1 || p[4] === 0 || /park|trail|waterfall|historic|campground|attraction|amusement/.test(p[3])); }), 8000);
    // new activity dot once feeds arrive
    setInterval(() => { const L = Live.st; const latest = Math.max(0, ...L.news.map(n => +new Date(n.published || 0)), ...L.alerts.map(a => +new Date(a.sent || 0))); $('#tabbar .dot').hidden = !(latest > (S.seen || 0) || Inbox.unread()) || S.view === 'feed'; if (S.view === 'feed' && !document.querySelector('#feed .post')) renderFeed(); }, 5000);
    const h = decodeURIComponent(location.hash || '');
    if (h.startsWith('#post=')) setTimeout(() => openPost(decodeURIComponent(h.slice(6))), 4000);
    if (h === '#feed') setView('feed');
    if (h === '#activity') setTimeout(() => setView('activity'), 1500);
    if (h.startsWith('#dm=')) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => openMessages(h.slice(4)), 3500); }
    if (h === '#report') setTimeout(() => openCreate('report'), 1500);
    document.addEventListener('visibilitychange', async () => { // phones pause the live connection in the background; catch up on return
      if (document.hidden || !Cloud.on || Cloud.newsOff) return;
      const before = new Set(S.news.map(n => n.id)); await Cloud.loadNews();
      S.news.filter(n => !before.has(n.id)).forEach(n => S.freshNews.add(n.id));
      if (S.view === 'feed' && $('#socialView').scrollTop < 120) renderFeed();
    });
    if (h.startsWith('#join=')) { const code = h.slice(6).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); Store.set('joinCode', code); history.replaceState(null, '', location.pathname + location.search); setTimeout(() => { setView('feed'); Cloud.on ? joinGroup(code) : showToast('Open the full site to join this group'); }, 3500); }
    setInterval(() => { if (S.view !== 'map' || !document.hidden) drawUserPins(); }, 5 * 60e3); // reports expire on their own
  }
  return { init, S, setView, openCreate, Store, Cloud, pickPlace, searchPlaces, placesReady, refresh, newStory, openMessages, messageUser, Inbox, Vid, drawUserPins, install, standalone };
})();
