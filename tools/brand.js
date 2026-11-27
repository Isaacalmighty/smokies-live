/* Smokies Live brand: Misty Ridges mark, animated intro, motion helpers, adaptive map resolution.
   Runs early (right after the loader markup) so the intro plays while the map library downloads.
   Motion follows the 12 principles: anticipation, squash and stretch, overlap, slow in and out, arcs, follow-through. */
(() => {
  'use strict';
  let uid = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The round emblem: sunrise over four ridgelines with fog drifting between them.
  function mark(size = 32, { anim = false, ring = true, cls = '' } = {}) {
    const k = 'sl' + (++uid);
    return `<svg class="slmark ${anim ? 'anim' : ''} ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
<defs>
<linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9b98a"/><stop offset=".6" stop-color="#efd9bf"/><stop offset="1" stop-color="#dfe6e6"/></linearGradient>
<linearGradient id="${k}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="${k}g"><stop offset="0" stop-color="#fff6e6" stop-opacity=".9"/><stop offset="1" stop-color="#fff6e6" stop-opacity="0"/></radialGradient>
<clipPath id="${k}c"><circle cx="50" cy="50" r="44"/></clipPath>
</defs>
<circle class="sky" cx="50" cy="50" r="44" fill="url(#${k}s)"/>
<g clip-path="url(#${k}c)">
<g class="sunarc"><circle class="glow" cx="34" cy="40" r="17" fill="url(#${k}g)"/><circle class="sun" cx="34" cy="40" r="9" fill="#f7efe0"/></g>
<path class="r r1" d="M-10 52 Q4 40 14 46 T36 40 T60 44 T84 38 T110 42 V100 H-10Z" fill="#b9c9d3"/>
<rect class="m m1" x="-40" y="48" width="180" height="12" fill="url(#${k}m)"/>
<path class="r r2" d="M-10 62 Q2 52 16 58 T42 52 T66 58 T90 52 T110 56 V100 H-10Z" fill="#88a3b6"/>
<rect class="m m2" x="-40" y="58" width="180" height="12" fill="url(#${k}m)"/>
<path class="r r3" d="M-10 72 Q6 62 22 68 T52 64 T82 66 T110 64 V100 H-10Z" fill="#587a8f"/>
<rect class="m m3" x="-40" y="69" width="180" height="10" fill="url(#${k}m)" opacity=".8"/>
<path class="r r4" d="M-10 82 Q10 74 32 80 T70 76 T110 80 V100 H-10Z" fill="#2f4a46"/>
</g>
${ring ? `<circle class="rim" cx="50" cy="50" r="44" fill="none" stroke="#2f4a46" stroke-width="3.5"/><circle class="rim2" cx="50" cy="50" r="48.5" fill="none" stroke="#c9d6d4" stroke-width="1.2" opacity=".45"/>` : ''}
</svg>`;
  }
  const wordmark = () => `<span class="slword">Smokies <em>Live</em></span>`;

  // favicon follows the mark
  function favicon() {
    const svg = mark(64).replace(/class="[^"]*"/g, '');
    let l = document.querySelector('link[rel="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  // ---------- intro ----------
  function intro() {
    const L = document.getElementById('loader'); if (!L) return;
    const msg = document.getElementById('loadMsg');
    const inner = L.querySelector('.inner');
    inner.innerHTML = `<div class="slintro">${mark(132, { anim: !reduce })}</div><h2>${wordmark()}</h2><div class="sltrail"><i></i></div>`;
    if (msg) inner.appendChild(msg);
    // the trail fills as map pieces arrive, never quite finishing until the map is ready
    const bar = inner.querySelector('.sltrail i'); let p = 0.04;
    const tick = setInterval(() => { p += (0.92 - p) * 0.06; bar.style.transform = `scaleX(${p})`; }, 120);
    // hand-off: when the loader fades, the emblem flies along an arc into the header badge
    const mo = new MutationObserver(() => {
      if (!L.classList.contains('done')) return;
      mo.disconnect(); clearInterval(tick); bar.style.transform = 'scaleX(1)';
      flyHome(inner.querySelector('.slintro svg'));
      document.body.classList.add('sl-revealed');
    });
    mo.observe(L, { attributes: true, attributeFilter: ['class'] });
  }
  function flyHome(svg) {
    const dest = document.querySelector('#brand .slmark');
    if (!svg || !dest || reduce || !svg.animate) return;
    const a = svg.getBoundingClientRect(), b = dest.getBoundingClientRect();
    if (!b.width) return;
    const clone = svg.cloneNode(true); clone.classList.remove('anim');
    Object.assign(clone.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', zIndex: 40, pointerEvents: 'none', transformOrigin: '0 0' });
    document.body.appendChild(clone); dest.style.opacity = '0';
    const s = b.width / a.width, dx = b.left - a.left, dy = b.top - a.top;
    // arc: travel up first, then across (two keyframes offset the path), squash on landing
    clone.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * 0.35}px,${dy * 0.75}px) scale(${(1 + s) / 2})`, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(${s * 1.08},${s * 0.92})`, offset: 0.88 },
      { transform: `translate(${dx}px,${dy}px) scale(${s})` }
    ], { duration: 950, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).onfinish = () => {
      dest.style.opacity = ''; dest.classList.add('land'); clone.remove();
    };
  }

  // ---------- header badge ----------
  function header() {
    const b = document.getElementById('brand'); if (!b) return;
    const old = b.querySelector(':scope > svg'); if (old) old.outerHTML = mark(38);
    const h = b.querySelector('h1'); if (h) h.innerHTML = wordmark();
  }

  // ---------- motion helpers ----------
  // Squash on press, follow-through on release, for every button and tappable row.
  const TAP = 'button, .li, .stop, .post .media, .story, [role="tab"], .chips > *, .rbtn';
  function presses() {
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest && e.target.closest(TAP); if (!t || t.disabled) return;
      t.classList.remove('sl-release'); t.classList.add('sl-press');
      const up = () => { t.classList.remove('sl-press'); t.classList.add('sl-release'); setTimeout(() => t.classList.remove('sl-release'), 520); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
      addEventListener('pointerup', up); addEventListener('pointercancel', up);
    }, { passive: true });
  }
  // Newly inserted feed cards, results and rows arrive in a staggered cascade (overlapping action).
  const ENTER = '#results > *, .sideHead ~ *, .gcard, .grow';
  function cascade() {
    if (reduce) return;
    let batch = [], raf = 0;
    const flush = () => {
      raf = 0; const vis = batch.filter(el => el.isConnected); batch = [];
      vis.forEach((el, i) => { el.style.setProperty('--sl-i', Math.min(i, 8)); el.classList.add('sl-enter'); setTimeout(() => el.classList.remove('sl-enter'), 900 + i * 60); });
    };
    new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(ENTER)) batch.push(n);
        else if (n.querySelectorAll) n.querySelectorAll(ENTER).forEach(x => batch.push(x));
      }
      if (batch.length && !raf) raf = requestAnimationFrame(flush);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ---------- adaptive map resolution ----------
  // Phones with 3x screens render the 3D map at up to 2x, then the governor steps the
  // resolution down while frames run slow and back up when there is headroom.
  function governor() {
    const wait = setInterval(() => {
      const map = window.__smokies && window.__smokies.map; if (!map || !map.setPixelRatio) return;
      clearInterval(wait);
      const dpr = devicePixelRatio || 1, phone = matchMedia('(pointer:coarse)').matches;
      const cap = Math.min(dpr, phone ? 2 : 2.5), floor = Math.min(dpr, 1);
      let pr = Math.min(map.getPixelRatio(), cap); map.setPixelRatio(pr);
      let last = 0, frames = [], moving = false, calm = 0;
      map.on('movestart', () => { moving = true; }); map.on('moveend', () => { moving = false; });
      map.on('render', () => {
        const now = performance.now(); if (last) frames.push(now - last); last = now;
        if (frames.length < 45) return;
        frames.sort((a, b) => a - b); const med = frames[frames.length >> 1]; frames = [];
        if (med > 28 && pr > floor) { pr = Math.max(floor, +(pr - 0.25).toFixed(2)); map.setPixelRatio(pr); calm = 0; }
        else if (med < 15 && pr < cap && moving) { if (++calm > 3) { pr = Math.min(cap, +(pr + 0.25).toFixed(2)); map.setPixelRatio(pr); calm = 0; } }
      });
      window.__smokies.quality = () => ({ pixelRatio: pr, cap });
      // body.sl-moving pauses decorative loops during gestures
      map.on('movestart', () => document.body.classList.add('sl-moving'));
      map.on('moveend', () => document.body.classList.remove('sl-moving'));
      // coming back to the map from the feed: redraw once so the animated layers resume
      new MutationObserver(() => { if (document.body.dataset.view === 'map' || document.body.classList.contains('picking')) map.triggerRepaint(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
    }, 500);
  }


  // ---------- phone navigation: one clear row of labeled buttons under the search ----------
  // The panels themselves belong to other modules; the dock drives their existing buttons so it never drifts out of sync.
  const ICON = {
    local: '<path d="M3 20h18M5 20l5-8 3 4 2-3 4 7"/><circle cx="17" cy="6" r="2.5"/>',
    live: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.2 4.5 4.5 0 0 0 7 18z"/>',
    tours: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'
  };
  const DOCK = [['local', 'm-local', 'Local'], ['live', 'm-live', 'Weather'], ['tours', 'm-tours', 'Places'], ['layers', 'm-layers', 'Layers']];
  const phone = () => matchMedia('(max-width:760px)').matches;
  const pressed = id => { const b = document.getElementById(id); return !!b && b.getAttribute('aria-pressed') === 'true'; };
  function closeAll(except) {
    if (except !== 'm-local' && pressed('m-local')) { const x = document.querySelector('#lhub [data-close]'); if (x) x.click(); }
    for (const id of ['m-live', 'm-tours', 'm-layers']) if (id !== except && pressed(id)) document.getElementById(id).click();
  }
  function dock() {
    const mb = document.getElementById('mobileBar'); if (!mb || document.getElementById('sldock')) return;
    const nav = document.createElement('nav'); nav.id = 'sldock'; nav.setAttribute('aria-label', 'Map menus');
    nav.innerHTML = DOCK.map(([k, id, label]) => `<button data-proxy="${id}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg><span>${label}</span></button>`).join('');
    document.body.appendChild(nav);
    const sync = () => nav.querySelectorAll('[data-proxy]').forEach(b => { const t = document.getElementById(b.dataset.proxy); b.hidden = !t; b.setAttribute('aria-pressed', pressed(b.dataset.proxy)); });
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-proxy]'); if (!b) return; const id = b.dataset.proxy, t = document.getElementById(id); if (!t) return;
      const was = pressed(id); closeAll(id);
      if (was && id === 'm-local') { const x = document.querySelector('#lhub [data-close]'); if (x) x.click(); } else t.click();
      setTimeout(sync, 30);
    });
    new MutationObserver(sync).observe(mb, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
    sync();
    // tapping the map itself puts any open menu away
    const wait = setInterval(() => {
      const map = window.__smokies && window.__smokies.map; if (!map) return; clearInterval(wait);
      map.on('click', () => { if (phone()) closeAll(); });
    }, 500);
  }
  // the logo moves into the search bar on phones, so the header row is gone and the map gets the space
  function searchLogo() {
    const box = document.querySelector('#search .box'); if (!box || box.querySelector('.slmark')) return;
    box.insertAdjacentHTML('afterbegin', mark(26, { cls: 'insearch' }));
  }

  // ---------- desktop: the long side panel folds into sections you can open and close ----------
  const FOLD_KEY = 'sl-fold', FOLD_DEFAULT = { 'Layers': true, 'Live': true };
  let fold = FOLD_DEFAULT; try { fold = { ...FOLD_DEFAULT, ...JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') }; } catch (e) {}
  function folds() {
    const rail = document.getElementById('rail'); if (!rail) return;
    const apply = () => rail.querySelectorAll(':scope > .group').forEach(g => {
      const h = g.querySelector(':scope > .eyebrow'); if (!h) return;
      const k = h.textContent.trim(); if (!h.dataset.fold) { h.dataset.fold = k; h.setAttribute('role', 'button'); h.tabIndex = 0; }
      g.classList.toggle('sl-folded', !!fold[k]); h.setAttribute('aria-expanded', !fold[k]);
    });
    rail.addEventListener('click', e => {
      const h = e.target.closest('.group > .eyebrow[data-fold]'); if (!h) return;
      const k = h.dataset.fold; fold[k] = !fold[k];
      try { localStorage.setItem(FOLD_KEY, JSON.stringify(fold)); } catch (err) {}
      apply();
    });
    new MutationObserver(apply).observe(rail, { childList: true });
    apply();
  }

  window.Brand = { mark, wordmark, closeAll };
  favicon(); intro(); presses(); cascade();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { header(); governor(); searchLogo(); folds(); setTimeout(dock, 0); addEventListener('load', () => setTimeout(dock, 2500)); });
  else { header(); governor(); searchLogo(); folds(); dock(); }
})();
