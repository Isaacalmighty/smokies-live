/* Smokies Live native bridge.
   Runs only inside the iOS/Android app (Capacitor shell in app/). In a normal browser it does nothing.
   - hides the splash once the map has drawn
   - light status bar text over the map, Android back button, haptic taps
   - native share sheet for navigator.share
   - neighbor alerts: asks politely, registers the device for push, opens the right place on tap */
(() => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const P = C.Plugins || {};
  const platform = C.getPlatform();
  const SUPA = { url: 'https://uamuqhkpbszogmdusfqr.supabase.co', key: 'sb_publishable_Y0fiNms2M0TI1Ph_ITWk0Q_hk2TS848' };
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('native', 'native-' + platform);

  /* ---------- splash: fade out once the map is ready (or after 4s whatever happens) ---------- */
  let hidden = false;
  const hideSplash = () => { if (hidden) return; hidden = true; P.SplashScreen && P.SplashScreen.hide({ fadeOutDuration: calm ? 0 : 450 }).catch(() => {}); };
  setTimeout(hideSplash, 4000);
  const waitMap = setInterval(() => {
    try { if (typeof map !== 'undefined' && map && map.loaded && map.loaded()) { clearInterval(waitMap); setTimeout(hideSplash, 150); } } catch (e) {}
  }, 120);
  setTimeout(() => clearInterval(waitMap), 6000);

  /* ---------- status bar ---------- */
  if (P.StatusBar) { P.StatusBar.setStyle({ style: 'DARK' }).catch(() => {}); if (platform === 'android') P.StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {}); }

  /* ---------- Android back button: close what's open, then step back, then leave ---------- */
  if (P.App) P.App.addListener('backButton', ({ canGoBack }) => {
    for (const id of ['#sheetView', '#newsView', '#storyView', '#createView', '#wallZoom']) { // top-most overlay first
      const v = document.querySelector(id);
      if (v && !v.hidden && !v.classList.contains('out')) { const x = v.querySelector('[data-x], [data-zx]'); if (x) { x.click(); return; } }
    }
    const res = document.querySelector('#results'); if (res && !res.hidden) { res.hidden = true; return; }
    if (document.body.dataset.view && document.body.dataset.view !== 'map') { const m = document.querySelector('#tabbar button[data-v="map"]'); if (m) { m.click(); return; } }
    if (canGoBack && location.hash && location.hash !== '#') { history.back(); return; }
    P.App.minimizeApp().catch(() => {});
  });

  /* ---------- haptics: a soft tick on taps of buttons and tabs ---------- */
  if (P.Haptics) {
    let last = 0;
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest && e.target.closest('button, [role="tab"], [role="button"], .tab, .chip, a.btn');
      if (!t || t.disabled) return;
      const now = performance.now(); if (now - last < 60) return; last = now;
      P.Haptics.impact({ style: 'LIGHT' }).catch(() => {});
    }, { passive: true, capture: true });
  }

  /* ---------- share: Android WebView has no navigator.share, so route it to the native sheet ---------- */
  if (P.Share) {
    navigator.share = async (d = {}) => { await P.Share.share({ title: d.title, text: d.text, url: d.url, dialogTitle: 'Share' }); };
    navigator.canShare = () => true;
  }

  /* ---------- open http links that leave the app in the system browser ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (!/^https?:$/.test(u.protocol) || u.host === location.host) return;
    if (a.target === '_blank' || a.hasAttribute('download')) { e.preventDefault(); window.open(u.href, '_system'); }
  }, true);

  /* ---------- neighbor alerts (push) ---------- */
  const Push = P.PushNotifications;
  // Android needs Firebase set up at build time (the build marks it with "SmokiesPush" in the user agent); iOS uses APNs directly.
  if (!Push || (platform === 'android' && !/SmokiesPush/.test(navigator.userAgent))) return;

  // Access token of the signed-in account, read from supabase-js's saved session (no refresh here, social.js owns that).
  const accessToken = () => {
    try {
      const raw = LS.get('sb-uamuqhkpbszogmdusfqr-auth-token'); if (!raw) return null;
      const s = JSON.parse(raw); const ses = s.currentSession || s;
      return ses.access_token && (!ses.expires_at || ses.expires_at * 1000 > Date.now() + 30000) ? ses.access_token : null;
    } catch (e) { return null; }
  };
  const saveToken = async token => {
    LS.set('smokies.push.token', token);
    const where = (() => { try { const c = typeof map !== 'undefined' && map.getCenter(); return c ? { lng: +c.lng.toFixed(3), lat: +c.lat.toFixed(3) } : {}; } catch (e) { return {}; } })();
    const body = { p_token: token, p_platform: platform, p_lng: where.lng ?? null, p_lat: where.lat ?? null, p_topics: ['alerts'] };
    const jwt = accessToken();
    try {
      const r = await fetch(SUPA.url + '/rest/v1/rpc/register_device', { method: 'POST', headers: { apikey: SUPA.key, Authorization: 'Bearer ' + (jwt || SUPA.key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) LS.set('smokies.push.saved', jwt ? 'user' : 'anon');
    } catch (e) { /* offline: we try again next launch */ }
  };

  Push.addListener('registration', t => saveToken(t.value));
  Push.addListener('registrationError', () => {});
  Push.addListener('pushNotificationActionPerformed', a => {
    const d = (a.notification && a.notification.data) || {};
    if (d.url) { if (d.url.startsWith('#')) location.hash = d.url; else location.href = d.url; }
    else if (d.lng && d.lat) { try { map.flyTo({ center: [+d.lng, +d.lat], zoom: +d.zoom || 14, duration: 2400, essential: true }); } catch (e) {} }
  });
  Push.addListener('pushNotificationReceived', n => { // app open: show it as an in-app banner instead of a system one
    banner(n.title || 'Smokies Live', n.body || '', null, () => { const d = n.data || {}; if (d.url) location.hash = d.url.replace(/^.*#/, '#'); });
  });

  if (platform === 'android') Push.createChannel({ id: 'alerts', name: 'Neighbor alerts', description: 'Floods, wildfire, road closures and storms near you', importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#F2A65A' }).catch(() => {});
  const register = () => Push.register().catch(() => {});
  const ask = async () => {
    const p = await Push.requestPermissions().catch(() => ({ receive: 'denied' }));
    LS.set('smokies.push.asked', String(Date.now()));
    if (p.receive === 'granted') { register(); toast('Neighbor alerts are on'); }
  };

  Push.checkPermissions().then(p => {
    if (p.receive === 'granted') { register(); return; }
    if (p.receive === 'denied') return;
    const asked = +LS.get('smokies.push.asked') || 0;
    if (Date.now() - asked < 7 * 864e5) return; // "Not now" means not for a week
    setTimeout(() => banner('Get neighbor alerts?', 'Floods, wildfire, road closures and storms near you, the moment they happen.', ['Turn on', 'Not now'], ask, () => LS.set('smokies.push.asked', String(Date.now()))), 9000);
  }).catch(() => {});
  // re-register after sign-in so the device is linked to the account
  window.addEventListener('storage', () => { if (LS.get('smokies.push.saved') === 'anon' && accessToken() && LS.get('smokies.push.token')) saveToken(LS.get('smokies.push.token')); });
  setInterval(() => { if (LS.get('smokies.push.saved') === 'anon' && accessToken() && LS.get('smokies.push.token')) saveToken(LS.get('smokies.push.token')); }, 30000);

  /* ---------- tiny UI: banner card + toast, styled to match the app ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .nb{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:9999;max-width:440px;margin:0 auto;
    background:rgba(16,26,21,.92);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);
    border:1px solid rgba(233,239,232,.12);border-radius:20px;padding:14px 14px 12px 16px;color:#e9efe8;font:15px/1.4 system-ui,-apple-system,Roboto,sans-serif;
    box-shadow:0 18px 40px rgba(0,0,0,.45);transform:translateY(-130%) scale(.96);opacity:0;transition:transform .55s cubic-bezier(.2,1.35,.4,1),opacity .3s ease}
  .nb.in{transform:none;opacity:1}.nb.out{transform:translateY(-130%) scale(.98);opacity:0;transition:transform .35s cubic-bezier(.6,-.3,.8,.4),opacity .3s ease}
  .nb b{display:block;font-size:15.5px;margin-bottom:2px}.nb p{margin:0;color:#a9bcae;font-size:14px}
  .nb .row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
  .nb button{border:0;border-radius:999px;padding:8px 16px;font:600 14px system-ui,-apple-system,Roboto,sans-serif;background:rgba(233,239,232,.1);color:#e9efe8;transition:transform .15s cubic-bezier(.3,1.6,.5,1)}
  .nb button.go{background:#f2a65a;color:#1b130b}.nb button:active{transform:scale(.93)}
  .nt{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 90px);z-index:9999;transform:translate(-50%,20px);opacity:0;
    background:rgba(16,26,21,.94);color:#e9efe8;border-radius:999px;padding:10px 18px;font:600 14px system-ui,-apple-system,Roboto,sans-serif;transition:all .4s cubic-bezier(.2,1.35,.4,1)}
  .nt.in{transform:translate(-50%,0);opacity:1}
  @media (prefers-reduced-motion:reduce){.nb,.nb.out,.nt{transition:opacity .2s}}`;
  document.head.appendChild(css);
  function banner(title, text, buttons, onYes, onNo) {
    const el = document.createElement('div'); el.className = 'nb'; el.setAttribute('role', 'alertdialog');
    el.innerHTML = `<b></b><p></p>${buttons ? `<div class="row"><button class="no"></button><button class="go"></button></div>` : ''}`;
    el.querySelector('b').textContent = title; el.querySelector('p').textContent = text;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    if (buttons) {
      el.querySelector('.go').textContent = buttons[0]; el.querySelector('.no').textContent = buttons[1];
      el.querySelector('.go').onclick = () => { close(); onYes && onYes(); };
      el.querySelector('.no').onclick = () => { close(); onNo && onNo(); };
    } else { el.onclick = () => { close(); onYes && onYes(); }; setTimeout(close, 6000); }
    document.body.appendChild(el); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    P.Haptics && P.Haptics.notification({ type: 'SUCCESS' }).catch(() => {});
  }
  function toast(text) {
    const el = document.createElement('div'); el.className = 'nt'; el.textContent = text; document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 450); }, 2400);
  }
})();
