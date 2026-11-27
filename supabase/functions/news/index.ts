// Smokies Live news collector (Supabase Edge Function "news").
// Every few minutes it reads the local newsrooms' feeds, finds where each story happens,
// grabs the article's photo, and saves new stories to public.news_items. The app shows
// them as posts the moment they land (realtime).
//
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > Via editor,
// name it "news", paste this file, turn OFF "Verify JWT", Deploy.
// Then run supabase/04_news.sql, which schedules it every 5 minutes.

const GAZ_URL = 'https://raw.githubusercontent.com/Isaacalmighty/smokies-live/main/scripts/gazetteer.json';
const UA = 'SmokiesLive/1.0 (+https://isaacalmighty.github.io/smokies-live/)';

// [outlet name, feed url, mode] mode: 'local' = everything is local; 'broad' = keep only stories that mention the Smokies area;
// 'gn' = Google News search (the outlet name comes from the headline suffix)
export const FEEDS: [string, string, string][] = [
  ['WBIR 10News', 'https://www.wbir.com/feeds/syndication/rss/news/local', 'broad'],
  ['WVLT', 'https://www.wvlt.tv/arc/outboundfeeds/rss/?outputType=xml', 'broad'],
  ['WATE 6 On Your Side', 'https://www.wate.com/news/local-news/sevier-county/feed/', 'local'],
  ['WATE 6 On Your Side', 'https://www.wate.com/news/local-news/feed/', 'broad'],
  ['Smoky Mountain News', 'https://www.smokymountainnews.com/news?format=feed&type=rss', 'broad'],
  ['National Park Service', 'https://www.nps.gov/feeds/getNewsRSS.htm?id=grsm', 'local'],
  ['The Mountain Press', gn('site:themountainpress.com when:7d'), 'gn'],
  ['Knox News', gn('site:knoxnews.com (Sevier OR Gatlinburg OR "Pigeon Forge" OR Sevierville OR Smokies OR "Smoky Mountains") when:7d'), 'gn'],
  ['The Daily Times', gn('site:thedailytimes.com (Townsend OR Smokies OR "Smoky Mountains" OR Sevier OR Walland) when:7d'), 'gn'],
  ['WLOS', gn('site:wlos.com (Smokies OR "Smoky Mountains" OR Cherokee OR Maggie OR Haywood OR "Bryson City") when:7d'), 'gn'],
  ['Citizen Times', gn('site:citizen-times.com (Smokies OR "Smoky Mountains" OR Cherokee OR "Bryson City") when:7d'), 'gn'],
  ['Google News', gn('"Sevier County" OR Gatlinburg OR "Pigeon Forge" OR Sevierville when:3d'), 'gn'],
  ['Google News', gn('"Great Smoky Mountains" when:3d'), 'gn'],
];
function gn(q: string) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en'; }

// outlet names normalized so each station is one account in the app
const OUTLETS: [RegExp, string][] = [
  [/mountain press/i, 'The Mountain Press'], [/wbir/i, 'WBIR 10News'], [/wate/i, 'WATE 6 On Your Side'], [/wvlt/i, 'WVLT'],
  [/knox ?news|news sentinel/i, 'Knox News'], [/daily times/i, 'The Daily Times'], [/smoky mountain news/i, 'Smoky Mountain News'],
  [/smoky mountain times/i, 'Smoky Mountain Times'], [/wlos/i, 'WLOS'], [/citizen[- ]times/i, 'Citizen Times'], [/one feather/i, 'Cherokee One Feather'],
  [/wjhl/i, 'WJHL'], [/national park service|nps\.gov/i, 'National Park Service'], [/tennessee lookout/i, 'Tennessee Lookout'],
  [/wuot/i, 'WUOT'], [/blue ridge public radio|bpr/i, 'Blue Ridge Public Radio'], [/associated press|ap news/i, 'AP News'],
];
const TRUSTED = /Mountain Press|WBIR|WATE|WVLT|Knox ?News|News Sentinel|Smoky Mountain News|Smoky Mountain Times|Citizen[- ]Times|Daily Times|One Feather|WLOS|WJHL|Tennessee Lookout|Tennessean|AP News|Associated Press|National Park Service|City of|County|Blue Ridge Public Radio|WUOT/i;
const LOCAL = /Sevier|Gatlinburg|Pigeon Forge|Sevierville|Smoky|Smokies|Kodak|Seymour|Wears Valley|Townsend|Cosby|Pittman|Cherokee|Bryson|Cades Cove|Dollywood|Le ?Conte|Newfound|Walland|Maggie Valley|Cataloochee|Hartford|Jefferson County|Blount/i;

export const outletOf = (s: string) => { for (const [rx, n] of OUTLETS) if (rx.test(s)) return n; return s.trim(); };
const ent: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
export const unesc = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ent[e.toLowerCase()] ?? m);
export const clean = (s: string, n = 280) => { const t = unesc(unesc(s || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…'; };
const tag = (x: string, t: string) => { const m = x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].trim() : ''; };
const attr = (x: string, t: string, a: string) => { const m = x.match(new RegExp(`<${t}\\s[^>]*${a}="([^"]+)"`, 'i')); return m ? unesc(m[1]) : ''; };

export function parseFeed(xml: string) {
  const out: { title: string; link: string; published: string | null; summary: string; img: string | null; via: string | null }[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const desc = tag(it, 'description') || tag(it, 'content:encoded');
    let img = attr(it, 'media:content', 'url') || attr(it, 'media:thumbnail', 'url') || (/<enclosure[^>]+type="image/i.test(it) ? attr(it, 'enclosure', 'url') : '');
    if (!img) { const im = unesc(desc).match(/<img[^>]+src="([^"]+)"/i); if (im) img = unesc(im[1]); }
    const d = tag(it, 'pubDate') || tag(it, 'dc:date');
    out.push({ title: clean(tag(it, 'title'), 200), link: unesc(tag(it, 'link')).trim(), published: d && !isNaN(+new Date(d)) ? new Date(d).toISOString() : null, summary: clean(desc), img: img || null, via: clean(tag(it, 'source')) || null });
  }
  for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const e = m[0]; const d = tag(e, 'updated') || tag(e, 'published');
    out.push({ title: clean(tag(e, 'title'), 200), link: attr(e, 'link', 'href'), published: d ? new Date(d).toISOString() : null, summary: clean(tag(e, 'summary') || tag(e, 'content')), img: null, via: null });
  }
  return out;
}

type Gaz = [string, number, number, string, number][];
let GAZ: { rx: RegExp; n: string; lng: number; lat: number; kind: string; pri: number }[] | null = null;
async function gazetteer() {
  if (GAZ) return GAZ;
  const g: Gaz = await (await fetch(GAZ_URL)).json();
  GAZ = g.map(([n, lng, lat, kind, pri]) => ({ rx: new RegExp(`(?<![\\w'])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`), n, lng, lat, kind, pri }));
  return GAZ;
}
export function geotag(gaz: NonNullable<typeof GAZ>, text: string) {
  let best: { s: number; p: { name: string; lng: number; lat: number; kind: string } } | null = null;
  for (const g of gaz) if (g.rx.test(text)) { const s = g.pri * 100 + g.n.length; if (!best || s > best.s) best = { s, p: { name: g.n, lng: g.lng, lat: g.lat, kind: g.kind } }; }
  return best ? best.p : null;
}
export const keyOf = (title: string) => title.toLowerCase().replace(/\W+/g, '').slice(0, 80);

async function get(url: string, ms = 12000, accept = 'application/rss+xml, application/xml, text/xml, */*') {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: c.signal, redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
// the article page's share image (what Facebook and iMessage show)
export async function ogImage(url: string) {
  if (!url || /news\.google\.com/.test(url)) return null;
  try {
    const h = (await get(url, 6000, 'text/html')).slice(0, 200000);
    const m = h.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["']/i) || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? new URL(unesc(m[1]), url).href : null;
  } catch { return null; }
}

export async function collect(log: (s: string) => void = () => {}) {
  const gaz = await gazetteer().catch(() => [] as NonNullable<typeof GAZ>);
  const seen = new Set<string>(); const rows: Record<string, unknown>[] = []; const per: Record<string, number> = {};
  const results = await Promise.allSettled(FEEDS.map(([, url]) => get(url)));
  results.forEach((r, i) => {
    const [name, url, mode] = FEEDS[i];
    if (r.status !== 'fulfilled') { log(`fail ${name} ${String(r.reason).slice(0, 80)} ${url.slice(0, 80)}`); return; }
    let n = 0;
    for (const it of parseFeed(r.value)) {
      let src = it.via || name, title = it.title;
      if (mode === 'gn' && / - [^-]+$/.test(title)) { const k = title.lastIndexOf(' - '); src = title.slice(k + 3); title = title.slice(0, k); if (!TRUSTED.test(src)) continue; }
      const text = title + ' ' + it.summary;
      if (!title || ((mode === 'broad' || mode === 'gn') && !LOCAL.test(text))) continue;
      const id = keyOf(title).slice(0, 60); if (!id || seen.has(id)) continue; seen.add(id);
      const source = outletOf(src);
      if (it.published && Date.now() - +new Date(it.published) > 7 * 864e5) continue;
      rows.push({ id, source, title, summary: it.summary && it.summary !== title ? it.summary : '', link: it.link, img: it.img, published: it.published || new Date().toISOString(), place: geotag(gaz, text) });
      n++; per[source] = (per[source] || 0) + 1;
    }
    log(`ok ${name} ${n}`);
  });
  return { rows, per };
}

async function db(path: string, init: RequestInit = {}) {
  const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`db ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

// Expired community posts (reports, sightings, outages, trail reports, lost and found pets) and their files.
// People's ordinary posts, group posts, memories, board posts and events are never touched.
const KEEP_DAYS: [RegExp, number][] = [[/^R:(lostpet|foundpet)$/, 21], [/^R:/, 3], [/^[WOTP]:/, 21]];
async function tidy(log: (s: string) => void | number) {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const rows = await db(`posts?select=id,tag,image_url,video_url,created_at&group_id=is.null&created_at=lt.${since}&or=(tag.like.R:*,tag.like.W:*,tag.like.O:*,tag.like.T:*,tag.like.P:*)&order=created_at.asc&limit=300`) as { id: string; tag: string; image_url: string | null; video_url: string | null; created_at: string }[];
  let old = rows.filter(r => { const k = KEEP_DAYS.find(([re]) => re.test(r.tag)); return k && Date.now() - +new Date(r.created_at) > k[1] * 864e5; });
  if (!old.length) return;
  // a report people still confirm in the last day stays up
  const votes = await db(`report_votes?select=post_id&vote=eq.still&created_at=gt.${new Date(Date.now() - 864e5).toISOString()}&post_id=in.(${old.map(r => r.id).join(',')})`).catch(() => []) as { post_id: string }[];
  const alive = new Set(votes.map(v => v.post_id)); old = old.filter(r => !alive.has(r.id));
  if (!old.length) return;
  const files = old.flatMap(r => [r.image_url, r.video_url]).filter((u): u is string => !!u && u.includes('/storage/v1/object/public/photos/')).map(u => u.split('/storage/v1/object/public/photos/')[1].split('?')[0]);
  if (files.length) {
    const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    await fetch(`${url}/storage/v1/object/photos`, { method: 'DELETE', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: files }) });
  }
  await db(`posts?id=in.(${old.map(r => r.id).join(',')})`, { method: 'DELETE' });
  log(`tidy: removed ${old.length} expired community posts and ${files.length} files`);
}

export async function run(dry = false) {
  const lines: string[] = [];
  const { rows, per } = await collect(s => lines.push(s));
  let known = new Map<string, { img: string | null }>();
  if (!dry && rows.length) { const have = await db(`news_items?select=id,img&id=in.(${rows.map(r => `"${String(r.id).replace(/"/g, '')}"`).join(',')})`) as { id: string; img: string | null }[]; known = new Map(have.map(h => [h.id, h])); }
  // photos: only for stories we don't have yet (or that came without one), a few at a time
  const need = rows.filter(r => !r.img && !/news\.google\.com/.test(String(r.link)) && !(known.get(String(r.id))?.img)).slice(0, 30);
  await Promise.all(need.map(async r => { r.img = await ogImage(String(r.link)); }));
  rows.forEach(r => { if (!r.img && known.get(String(r.id))?.img) r.img = known.get(String(r.id))!.img; });
  const fresh = rows.filter(r => !known.has(String(r.id)));
  if (!dry && rows.length) {
    await db('news_items?on_conflict=id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.map(r => ({ ...r, seen_at: new Date().toISOString() }))) });
    await db(`news_items?published=lt.${new Date(Date.now() - 7 * 864e5).toISOString()}`, { method: 'DELETE' }); // the feed shows 3 days; keep a week
    if (new Date().getUTCMinutes() < 5) await tidy(s => lines.push(s)).catch(e => lines.push('tidy failed: ' + e)); // once an hour
  }
  return { stories: rows.length, fresh: fresh.length, withPhoto: rows.filter(r => r.img).length, perOutlet: per, photosFetched: need.length, log: lines, sample: dry ? rows.slice(0, 8) : undefined };
}

if (import.meta.main && typeof Deno.serve === 'function' && !Deno.args.includes('--dry')) {
  Deno.serve(async () => {
    try { return Response.json(await run(false)); }
    catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
  });
} else if (import.meta.main) {
  console.log(JSON.stringify(await run(true), null, 1));
}
