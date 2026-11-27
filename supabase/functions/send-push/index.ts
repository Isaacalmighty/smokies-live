// Smokies Live: send a neighbor alert to phones (Supabase Edge Function).
// POST { title, body, url?, lng?, lat?, radius_km?, topic? }  with header  x-push-secret: <PUSH_SECRET>
// or POST { notification_id } (sent by the database for likes, comments, messages; see 05_videos_messages.sql)
// Sends to every registered device, or only those within radius_km of (lng, lat).
// Secrets (Supabase > Edge Functions > Secrets):
//   PUSH_SECRET            any long random string; whoever calls this must send it
//   FCM_SERVICE_ACCOUNT    Firebase service account JSON (Android)
//   APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID   Apple push key (.p8 text) and its ids (iOS)
//   APNS_BUNDLE_ID         net.offnon.smokieslive    APNS_PRODUCTION  "true" for App Store / TestFlight builds
import { createClient } from 'npm:@supabase/supabase-js@2.79.0';
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

let fcmToken = { value: '', exp: 0 };
async function fcmAccess(sa: any) {
  if (fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt().setExpirationTime('1h').sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = await r.json(); fcmToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return fcmToken.value;
}

let apnsJwt = { value: '', exp: 0 };
async function apnsAuth() {
  if (apnsJwt.exp > Date.now()) return apnsJwt.value;
  const key = await importPKCS8(env('APNS_KEY').replace(/\\n/g, '\n'), 'ES256');
  apnsJwt.value = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: env('APNS_KEY_ID') }).setIssuer(env('APNS_TEAM_ID')).setIssuedAt().sign(key);
  apnsJwt.exp = Date.now() + 40 * 60_000; return apnsJwt.value;
}

const km = (a: number, b: number, c: number, d: number) => {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r * Math.cos(((b + d) / 2) * r), y = (d - b) * r; return R * Math.hypot(x, y);
};

// A like, comment, message or group post: the database hands us the new notification's id.
// No secret is needed for this: we look the notification up ourselves, send it only to the person
// it is for, and only once (pushed_at), so a stranger calling this can't send anything.
const LINES: Record<string, (who: string, n: number, t: string) => [string, string]> = {
  like: (w, n) => [n > 1 ? `${w} and ${n - 1} other${n > 2 ? 's' : ''} liked your post` : `${w} liked your post`, ''],
  comment: (w, _n, t) => [`${w} commented`, t],
  dm: (w, _n, t) => [w, t],
  group_post: (w, _n, t) => [`${w} posted in your group`, t],
  group_join: w => [`${w} joined your group`, ''],
};
async function forNotification(id: number) {
  const { data: n } = await db.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', id).is('pushed_at', null).select('id,user_id,actor,kind,n,text,post_id,thread_id,group_id').maybeSingle();
  if (!n) return null;
  const { data: a } = n.actor ? await db.from('profiles').select('name,handle').eq('id', n.actor).maybeSingle() : { data: null };
  const who = a?.name || a?.handle || 'Someone';
  const [title, body] = (LINES[n.kind] ?? (() => ['Smokies Live', n.text ?? '']))(who, n.n ?? 1, n.text ?? '');
  const url = n.kind === 'dm' ? `#dm=${n.thread_id}` : n.post_id ? `#post=s${n.post_id}` : '#activity';
  return { title, body, url, user_ids: [n.user_id], topic: '*' };
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('no', { status: 405 });
  let m = await req.json().catch(() => ({}));
  if (m.notification_id != null) { m = await forNotification(Number(m.notification_id)); if (!m) return Response.json({ skipped: true }); }
  else if (!env('PUSH_SECRET') || req.headers.get('x-push-secret') !== env('PUSH_SECRET')) return new Response('no', { status: 401 });
  if (!m.title) return new Response('title required', { status: 400 });
  let q = db.from('devices').select('token,platform,lng,lat,topics');
  if (m.user_ids) q = q.in('user_id', m.user_ids);
  const { data: devs, error } = await q;
  if (error) return new Response(error.message, { status: 500 });
  const topic = m.topic || 'alerts';
  const list = (devs ?? []).filter(d => (topic === '*' || (d.topics ?? []).includes(topic)) &&
    (m.lng == null || m.lat == null || d.lng == null || km(m.lng, m.lat, d.lng, d.lat) <= (m.radius_km ?? 40)));
  const data: Record<string, string> = {}; if (m.url) data.url = String(m.url); if (m.lng != null) { data.lng = String(m.lng); data.lat = String(m.lat); }
  const sa = env('FCM_SERVICE_ACCOUNT') ? JSON.parse(env('FCM_SERVICE_ACCOUNT')) : null;
  const apnsHost = env('APNS_PRODUCTION') === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const dead: string[] = []; let sent = 0;
  await Promise.all(list.map(async d => {
    try {
      if (d.platform === 'android' && sa) {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: 'POST',
          headers: { authorization: 'Bearer ' + await fcmAccess(sa), 'content-type': 'application/json' },
          body: JSON.stringify({ message: { token: d.token, notification: { title: m.title, body: m.body ?? '' }, data,
            android: { priority: 'high', notification: { channel_id: 'alerts', color: '#F2A65A' } } } }) });
        if (r.ok) sent++; else if (r.status === 404 || r.status === 400) dead.push(d.token);
      } else if (d.platform === 'ios' && env('APNS_KEY')) {
        const r = await fetch(`${apnsHost}/3/device/${d.token}`, { method: 'POST',
          headers: { authorization: 'bearer ' + await apnsAuth(), 'apns-topic': env('APNS_BUNDLE_ID') || 'net.offnon.smokieslive', 'apns-push-type': 'alert', 'apns-priority': '10' },
          body: JSON.stringify({ aps: { alert: { title: m.title, body: m.body ?? '' }, sound: 'default' }, ...data }) });
        if (r.ok) sent++; else if (r.status === 410 || r.status === 400) dead.push(d.token);
      }
    } catch (_) { /* one bad device never stops the rest */ }
  }));
  if (dead.length) await db.from('devices').delete().in('token', dead);
  return Response.json({ matched: list.length, sent, removed: dead.length });
});
