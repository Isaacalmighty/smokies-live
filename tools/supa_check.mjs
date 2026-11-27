// What is switched on in Supabase? Probes the public API with the publishable key (no secrets).
// Writes a plain report to <outdir>/report.txt. Run by .github/workflows/supa-check.yml.
import fs from 'node:fs';
const URL_ = 'https://uamuqhkpbszogmdusfqr.supabase.co', KEY = 'sb_publishable_Y0fiNms2M0TI1Ph_ITWk0Q_hk2TS848';
const out = process.argv[2] || 'supa'; fs.mkdirSync(out, { recursive: true });
const lines = []; const log = s => { lines.push(s); console.log(s); };
const H = { apikey: KEY, 'content-type': 'application/json' };
async function get(path) { const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H }); let b = ''; try { b = await r.text(); } catch { } return { s: r.status, b: b.slice(0, 300) }; }
async function rpc(fn, body = {}) { const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { s: r.status, b: (await r.text()).slice(0, 300) }; }
const exists = r => r.s === 200 || r.s === 206 || /42501|permission denied/.test(r.b) || r.s === 401 && !/PGRST20[25]/.test(r.b);
const say = (name, r) => log(`${exists(r) ? 'ON ' : 'OFF'}  ${name}   [${r.s} ${r.b.replace(/\s+/g, ' ').slice(0, 140)}]`);
log('Supabase check ' + new Date().toISOString());
say('posts table', await get('posts?select=id&limit=1'));
say('report votes (02)', await get('report_votes?select=post_id&limit=1'));
say('groups (03)', await get('groups?select=id&limit=1'));
say('group posts column (03)', await get('posts?select=group_id&limit=1'));
say('push devices (03_push)', await rpc('register_device', { p_token: 'x', p_platform: 'ios' }).then(r => ({ ...r, s: /bad token/.test(r.b) ? 200 : r.s })));
const n = await get('news_items?select=id,source,published,seen_at&order=seen_at.desc&limit=200');
say('news table (04)', n);
if (n.s === 200) { const rows = JSON.parse((await (await fetch(`${URL_}/rest/v1/news_items?select=source,seen_at,published&order=seen_at.desc&limit=500`, { headers: H })).text()) || '[]');
  const last = rows[0] && rows[0].seen_at; log(`     news rows: ${rows.length}, last collected: ${last || 'never'} (${last ? Math.round((Date.now() - new Date(last)) / 60000) + ' min ago' : ''})`);
  const per = {}; rows.forEach(r => per[r.source] = (per[r.source] || 0) + 1); log('     per outlet: ' + JSON.stringify(per)); }
say('video columns (05)', await get('posts?select=video_url,video_meta&limit=1'));
say('messages (05)', await get('dm_messages?select=id&limit=1'));
say('conversations (05)', await get('dm_threads?select=id&limit=1'));
say('notifications (05)', await get('notifications?select=id&limit=1'));
say('start_dm function (05)', await rpc('start_dm', { other: '00000000-0000-0000-0000-000000000000' }));
say('tags column (06)', await get('posts?select=tagged&limit=1'));
say('family locations (07)', await get('member_locations?select=*&limit=1'));
say('post_feed view has videos', await get('post_feed?select=video_url&limit=1'));
// edge functions
for (const [fn, body] of [['send-push', { notification_id: 0 }]]) {
  const r = await fetch(`${URL_}/functions/v1/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = (await r.text()).slice(0, 200); log(`${r.ok ? 'ON ' : 'OFF'}  function ${fn}   [${r.status} ${t}]`);
}
const nf = await fetch(`${URL_}/functions/v1/news`, { method: 'OPTIONS' }); log(`${nf.status === 404 ? 'OFF' : 'ON '}  function news (deployed?)   [${nf.status}]`);
const st = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } }); log('auth settings: ' + (await st.text()).slice(0, 300));
fs.writeFileSync(out + '/report.txt', lines.join('\n') + '\n');
