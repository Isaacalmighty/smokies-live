/* ---------- "Wrong name?": locals fix place names on the map ----------
   Tap a place, then "Wrong name?", and say what it's called now or that it's closed.
   Your own fix shows for you right away. Once 2 people agree, everyone sees it
   (supabase/08_place_names.sql). Fixes are drawn over the map: the old label is hidden
   only at that spot, and the new one is drawn in the same style. */
const Names = (() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const KEY = 'sl-namefix';
  const km = (a, b) => Math.hypot((a.lng - b.lng) * 90.3, (a.lat - b.lat) * 111.2);
  const mine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const saveMine = a => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-200))); } catch (e) { } };
  let agreed = [], base = {};
  const fixes = () => [...mine(), ...agreed];
  const same = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();
  // the fix for a name near a spot (about 80 m), newest first so your own fix wins
  function find(name, ll) { const all = fixes(); for (let i = all.length - 1; i >= 0; i--) { const f = all[i]; if (same(f.old_name, name) && km(f, ll) < 0.08) return f; } return null; }
  function label(name, ll) { const f = find(name, ll); return !f ? name : f.closed ? null : f.new_name; }

  const LAYERS = { poi: 'lbl-poi', peak: 'lbl-peak', place: 'lbl-place' };
  function square(f) { const d = 0.0007; return { type: 'Polygon', coordinates: [[[f.lng - d, f.lat - d], [f.lng + d, f.lat - d], [f.lng + d, f.lat + d], [f.lng - d, f.lat + d], [f.lng - d, f.lat - d]]] }; }
  function draw() {
    const m = window.__smokies && window.__smokies.map; if (!m || !m.getLayer('lbl-poi')) return;
    const all = fixes();
    Object.entries(LAYERS).forEach(([kind, id]) => {
      if (!m.getLayer(id)) return;
      if (!(id in base)) base[id] = m.getFilter(id) || null;
      const hide = all.filter(f => (f.kind || 'poi') === kind).map(f => ['all', ['==', ['get', 'n'], f.old_name], ['within', square(f)]]);
      const keep = hide.length ? ['!', ['any', ...hide]] : null;
      const flt = base[id] && keep ? ['all', base[id], keep] : base[id] || keep;
      try { m.setFilter(id, flt); } catch (e) { console.warn('[names] filter', e); }
    });
    const data = { type: 'FeatureCollection', features: all.filter(f => !f.closed && f.new_name).map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { n: f.new_name, kind: f.kind || 'poi' } })) };
    if (m.getSource('namefix')) m.getSource('namefix').setData(data);
    else {
      m.addSource('namefix', { type: 'geojson', data });
      const poi = m.getLayer('lbl-poi'), L = k => m.getLayoutProperty('lbl-poi', k), P = k => m.getPaintProperty('lbl-poi', k);
      const layout = {}; ['text-font', 'text-size', 'text-max-width', 'text-offset', 'text-anchor', 'icon-image', 'icon-text-fit', 'icon-text-fit-padding'].forEach(k => { const v = L(k); if (v != null) layout[k] = v; });
      const paint = {}; ['text-color', 'text-halo-color', 'text-halo-width'].forEach(k => { const v = P(k); if (v != null) paint[k] = v; });
      m.addLayer({ id: 'lbl-namefix', type: 'symbol', source: 'namefix', minzoom: Math.min(13, poi.minzoom || 13), layout: { ...layout, 'text-field': ['get', 'n'], 'text-allow-overlap': false }, paint });
    }
  }

  async function loadAgreed() {
    const C = window.Social && Social.Cloud; if (!C || !C.on || !C.sb) return;
    try { const { data, error } = await C.sb.rpc('name_fixes'); if (error) throw error; agreed = data || []; draw(); }
    catch (e) { /* the database update isn't installed yet: own fixes still work */ }
  }

  function spotOf(f) {
    const g = f.geometry; if (!g) return null;
    let c = g.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    return Array.isArray(c) && typeof c[0] === 'number' ? { lng: c[0], lat: c[1] } : null;
  }
  function kindOf(f) { return f.layer.id === 'buildings' ? 'building' : f.layer.id === 'lbl-peak' ? 'peak' : f.layer.id === 'lbl-place' ? 'place' : 'poi'; }
  // called by the map's place card: show the fixed name, and offer "Wrong name?"
  function card(el, f, ll, h) {
    const name = f.properties && f.properties.n; if (!name) return;
    ll = spotOf(f) || ll; // the place's own point, so everyone reporting it lands on the same spot
    const fx = find(name, ll);
    if (fx) { h.textContent = fx.closed ? name : fx.new_name; const t = document.createElement('div'); t.className = 'nf-note'; t.textContent = fx.closed ? 'Locals say this place has closed' : 'Name updated by locals'; h.after(t); }
    const b = document.createElement('button'); b.className = 'link nf-btn'; b.type = 'button'; b.textContent = 'Wrong name?';
    b.onclick = ev => { ev.stopPropagation(); clearTimeout(el._t); el.hidden = true; ask({ old_name: name, lng: +ll.lng.toFixed(6), lat: +ll.lat.toFixed(6), kind: kindOf(f) }); };
    el.append(b);
  }

  function ask(p) {
    const S = window.Social; if (!S || !S.sheet) return;
    S.sheet(`<h4>Fix this name</h4><p class="fine" style="text-align:center;margin:0 0 14px">Map says <b>${esc(p.old_name)}</b></p>
      <form class="pform nf-form"><label>What's it called now?<input name="n" maxlength="120" autocomplete="off" placeholder="New name"></label>
      <label class="nf-closed"><input type="checkbox" name="c"> It closed or isn't there anymore</label>
      <button class="btn primary">Send fix</button></form>
      <p class="fine">You'll see your fix right away. When another local sends the same fix, everyone sees it.</p>`, sh => {
      const fm = sh.querySelector('form'); setTimeout(() => fm.n.focus(), 250);
      fm.c.onchange = () => { fm.n.disabled = fm.c.checked; };
      fm.onsubmit = async e => {
        e.preventDefault();
        const closed = fm.c.checked, nn = fm.n.value.trim().replace(/\s+/g, ' ');
        if (!closed && (nn.length < 2 || same(nn, p.old_name))) { fm.n.focus(); return; }
        const r = { ...p, new_name: closed ? null : nn, closed };
        const C = S.Cloud;
        if (C && C.on && !C.user && S.needSignIn) { S.needSignIn('Sign in to send name fixes, so one person can\'t flood the map.'); return; }
        saveMine([...mine().filter(x => !(same(x.old_name, r.old_name) && km(x, r) < 0.08)), r]); draw();
        let sent = false;
        if (C && C.on && C.user) {
          try { const { error } = await C.sb.from('name_reports').upsert(r, { onConflict: 'user_id,spot' }); if (error) throw error; sent = true; } catch (er) { console.warn('[names] send', er); }
        }
        S.closeSheet(); toast(sent ? 'Thanks! Fixed for you now, and for everyone once a neighbor agrees.' : 'Fixed on your phone. We\'ll share it once the database update is on.');
        loadAgreed();
      };
    });
  }
  function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 3200); }

  function init() {
    const st = document.createElement('style');
    st.textContent = '.nf-btn{display:block;margin:6px 0 -4px;padding:4px 0;font-size:12.5px}.nf-note{font-size:11.5px;color:var(--ink-faint,#9aa59d);margin:-2px 0 4px}.nf-closed{flex-direction:row!important;align-items:center;gap:8px;font-size:14px}.nf-closed input{width:auto}';
    document.head.appendChild(st);
    const go = () => { const m = window.__smokies && window.__smokies.map; if (!m || !m.isStyleLoaded() || !m.getLayer('lbl-poi')) return setTimeout(go, 1500); setTimeout(() => { draw(); loadAgreed(); }, 2500); setInterval(loadAgreed, 15 * 60e3); };
    go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { card, label, find, draw, reload: loadAgreed };
})();
window.Names = Names;
