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
// the article page's share card: photo, the newsroom's own one-line summary, byline and section
// (what Facebook and iMessage show when someone shares the link). We never copy the article itself.
const NO_FETCH = /themountainpress\.com/; // rate-limits automated visitors, so we only link to it
const meta = (h: string, ...names: string[]) => {
  for (const n of names) {
    const m = h.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i')) || h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${n}["']`, 'i'));
    if (m && m[1].trim()) return unesc(m[1]).trim();
  }
  return '';
};
export async function pageMeta(url: string) {
  if (!url || /news\.google\.com/.test(url) || NO_FETCH.test(url)) return null;
  try {
    const h = (await get(url, 8000, 'text/html')).slice(0, 900000);
    const ld = h.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/) || h.match(/"image"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/) || h.match(/"image"\s*:\s*\[\s*"([^"]+)"/) || h.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    const img = meta(h, 'og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src') || (ld ? ld[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/') : '');
    let author = meta(h, 'author', 'article:author', 'parsely-author', 'byl', 'dc.creator').replace(/^by\s+/i, '');
    if (/^https?:|@|^admin|\b(staff|news|wbir|wate|wvlt|press|reports?)\b/i.test(author) || author.length > 60) author = '';
    return { img: img ? new URL(img, url).href : null, desc: clean(meta(h, 'og:description', 'twitter:description', 'description'), 320), author: author || null, section: meta(h, 'article:section') || null };
  } catch { return null; }
}
export const ogImage = async (url: string) => (await pageMeta(url))?.img || null;

// Google News links are redirects; ask Google for the real article address (same thing a browser does on tap)
export async function gnResolve(link: string) {
  const m = link.match(/news\.google\.com\/(?:rss\/)?articles\/([^?/#]+)/); if (!m) return link;
  const id = m[1];
  for (const page of [`https://news.google.com/rss/articles/${id}`, `https://news.google.com/articles/${id}`]) {
    try {
      const h = await get(page, 7000, 'text/html');
      const sg = h.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = h.match(/data-n-a-ts="([^"]+)"/)?.[1];
      if (!sg || !ts) continue;
      const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, +ts, sg]);
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 7000);
      const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', { method: 'POST', signal: c.signal, headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': UA }, body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])) }).finally(() => clearTimeout(t));
      const body = await r.text();
      const arr = JSON.parse(body.split('\n\n')[1]);
      const url = JSON.parse(arr[0][2])[1];
      if (typeof url === 'string' && /^https?:\/\//.test(url)) return url;
    } catch { /* try the other page, then give up */ }
  }
  return null;
}

// what the story is about, for the section labels in the app
const CATS: [string, RegExp][] = [
  ['Sports', /\b(football|basketball|baseball|softball|soccer|volleyball|wrestling|playoffs?|semifinals?|quarterfinals?|championship|coach|Vols\b|tournament|Lady \w+s\b|Bulldogs|Bears\b|Cougars|Smoky Bears|season opener|scores?\b)/i],
  ['Safety', /\b(police|sheriff|deput|arrest|charged|indict|shooting|stabb|murder|homicide|missing|rescued?|search(ed|ing)? for|jury|trial|sentenc|pleads?|guilty|convicted|crime|suspect|investigat|firefighters? (are|battl)|brush fire|house fire|structure fire|blaze|acres|contained|burn ban|burn permits?|fire danger|evacuat|fatal|killed in|dies after|died after)/i],
  ['Weather', /\b(weather|forecast|storms?\b|snow|icy|freezing rain|flood|tornado|freeze|frost|heat wave|wind (advisory|gusts)|NWS|winter storm)/i],
  ['Roads', /\b(road|crash|wreck|closures?|lanes?\b|traffic|I-40|I-75|interstate|highway|parkway|spur\b|TDOT|detour|construction|bridge|US-?441|paving)/i],
  ['Outdoors', /\b(national park|Smokies|Great Smoky|NPS\b|trails?\b|hik(e|ing|ers?)|bears?\b|elk\b|wildlife|Cades Cove|rangers?\b|Clingmans|campgrounds?|waterfalls?|fishing|mushrooms?|fall colou?rs?|backcountry|Appalachian Trail)/i],
  ['Things to do', /\b(festival|Dollywood|concerts?|parades?|holiday|Christmas|lights?\b|Winterfest|shows?\b|theat(er|re)|museum|attractions?|celebrat|fair\b|market|tickets?|music|singles?\b|album|art\b|crafts?|performances?)/i],
  ['Business', /\b(business|restaurants?|grand opening|now open|opens\b|to close|closing|jobs?\b|hiring|hotels?|resort|develop|economy|sales\b|shopping|Black Friday|revenue|tourism|retail|stores?\b|brewery|distillery|cabin rental|real estate|property|hospital|health)/i],
  ['Government', /\b(mayor|commission|city council|alderm|board\b|schools?\b|vote|election|budget|ordinance|lawmakers|state law|governor|legislat|approves?|utility)/i],
];
// "SEVIER COUNTY, Tenn. (WATE) — " at the start of a summary
export const undateline = (t: string) => (t || '').replace(/^[A-Z][A-Z .,'’-]{2,40},\s*(Tenn|Tennessee|N\.?C|North Carolina|TN|NC|Ga|Va)\.?\s*(\([^)]{1,30}\))?\s*[—–-]+\s*/, '').replace(/^\([^)]{1,20}\)\s*[—–-]+\s*/, '');
export const catOf = (text: string) => { for (const [c, rx] of CATS) if (rx.test(text)) return c; return 'Community'; };

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
      // Google News "summaries" are just the headline and outlet again; drop those
      it.summary = undateline(it.summary);
      const sum = it.summary && !it.summary.toLowerCase().startsWith(title.toLowerCase().slice(0, 40)) && it.summary !== title ? it.summary : '';
      rows.push({ id, source, title, summary: sum, link: it.link, img: it.img, published: it.published || new Date().toISOString(), place: geotag(gaz, title + ' ' + sum), cat: catOf(title + ' ' + sum), author: null });
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

type Row = Record<string, unknown>;
const JUNK = /holiday-marketplace|things-to-do\/events|local-events|\/events\/?\?|_evDiscovery|\/obituar/i;
type Known = { id: string; link?: string | null; img?: string | null; summary?: string | null; cat?: string | null; author?: string | null; enriched?: boolean };
// fill in what each story's feed left out: the real article address, its photo, the newsroom's summary, byline.
// Stories we already know keep what we found before, so each run only visits the handful that are new.
export async function enrich(rows: Row[], known: Map<string, Known>, budget = 30, log: (s: string) => void = () => {}) {
  for (const r of rows) {
    const k = known.get(String(r.id)); if (!k) continue;
    if (k.link && /news\.google\.com/.test(String(r.link)) && !/news\.google\.com/.test(k.link)) r.link = k.link;
    if (!r.img && k.img) r.img = k.img;
    if (k.summary && String(k.summary).length > String(r.summary || '').length) r.summary = k.summary;
    if (k.author) r.author = k.author;
    if (k.cat) r.cat = k.cat;
  }
  const need = rows.filter(r => { const k = known.get(String(r.id)); return !(k && k.enriched) && (!r.img || !r.summary || /news\.google\.com/.test(String(r.link))); }).slice(0, budget);
  let resolved = 0, photos = 0;
  const one = async (r: Row) => {
    if (/news\.google\.com/.test(String(r.link))) { const u = await gnResolve(String(r.link)); if (u) { r.link = u; resolved++; } }
    const m = await pageMeta(String(r.link));
    if (m) {
      if (!r.img && m.img) { r.img = m.img; photos++; }
      m.desc = undateline(m.desc);
      if (m.desc && m.desc.length > String(r.summary || '').length && !m.desc.toLowerCase().startsWith(String(r.title).toLowerCase().slice(0, 40))) r.summary = m.desc;
      if (m.author) r.author = m.author;
      r.cat = catOf(`${r.title} ${r.summary || ''} ${m.section || ''}`);
    }
    r.enriched = true;
  };
  for (let i = 0; i < need.length; i += 5) await Promise.all(need.slice(i, i + 5).map(one)); // a few at a time, politely
  // event listings and calendar pages that ride along in search results are not news
  const seenLink = new Set<string>();
  for (let i = rows.length - 1; i >= 0; i--) if (JUNK.test(String(rows[i].link))) rows.splice(i, 1);
  for (let i = 0; i < rows.length; i++) { const l = String(rows[i].link).split(/[?#]/)[0]; if (seenLink.has(l)) { rows.splice(i, 1); i--; } else seenLink.add(l); }
  log(`enrich: ${need.length} visited, ${resolved} links resolved, ${photos} photos found`);
  return need.length;
}

export async function run(dry = false) {
  const lines: string[] = [];
  const { rows, per } = await collect(s => lines.push(s));
  let known = new Map<string, Known>();
  if (!dry && rows.length) { const have = await db(`news_items?select=id,link,img,summary,cat,author&id=in.(${rows.map(r => `"${String(r.id).replace(/"/g, '')}"`).join(',')})`) as Known[]; known = new Map(have.map(h => [h.id, { ...h, enriched: !/news\.google\.com/.test(String(h.link)) }])); }
  const visited = await enrich(rows, known, dry ? 12 : 30, s => lines.push(s));
  const fresh = rows.filter(r => !known.has(String(r.id)));
  rows.forEach(r => delete r.enriched);
  if (!dry && rows.length) {
    await db('news_items?on_conflict=id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.map(r => ({ ...r, seen_at: new Date().toISOString() }))) });
    await db(`news_items?published=lt.${new Date(Date.now() - 7 * 864e5).toISOString()}`, { method: 'DELETE' }); // the feed shows 3 days; keep a week
    if (new Date().getUTCMinutes() < 5) await tidy(s => lines.push(s)).catch(e => lines.push('tidy failed: ' + e)); // once an hour
  }
  return { stories: rows.length, fresh: fresh.length, withPhoto: rows.filter(r => r.img).length, withSummary: rows.filter(r => r.summary).length, perOutlet: per, visited, log: lines, sample: dry ? rows.slice(0, 8) : undefined };
}

// The backup file the app reads when the database isn't set up: GitHub Actions runs
//   deno run -A supabase/functions/news/index.ts --json feeds/live/news.json --prev last-run.json
// every 10 minutes. It keeps what earlier runs found (photos, real links) and a week of stories.
export async function writeJson(path: string, prevPath = path) {
  const lines: string[] = [];
  const { rows } = await collect(s => lines.push(s));
  let prev: Row[] = [];
  try { prev = JSON.parse(await Deno.readTextFile(prevPath)).items || []; } catch { /* first run */ }
  const known = new Map<string, Known>(prev.map(p => [String(p.id), { ...(p as Known), enriched: !!p.enriched }]));
  await enrich(rows, known, 30, s => lines.push(s));
  const ids = new Set(rows.map(r => String(r.id))), week = Date.now() - 7 * 864e5;
  const short = new Set(rows.map(r => String(r.id).slice(0, 40))); // the plain backup list uses shorter ids for the same stories
  const keep = prev.filter(p => !ids.has(String(p.id)) && !short.has(String(p.id).slice(0, 40)) && +new Date(String(p.published)) > week); // stories that scrolled off a station's feed stay for the week
  const items = [...rows, ...keep].sort((a, b) => +new Date(String(b.published)) - +new Date(String(a.published))).slice(0, 120);
  if (!items.length) throw new Error('no stories');
  await Deno.writeTextFile(path, JSON.stringify({ updated: new Date().toISOString(), items }));
  console.log(lines.join('\n'));
  console.log(`wrote ${items.length} stories (${items.filter(i => i.img).length} with photos, ${items.filter(i => i.summary).length} with summaries)`);
}

if (import.meta.main && Deno.args.includes('--json')) {
  const out = Deno.args[Deno.args.indexOf('--json') + 1] || 'news.json', pi = Deno.args.indexOf('--prev');
  await writeJson(out, pi > -1 ? Deno.args[pi + 1] : out);
} else if (import.meta.main && typeof Deno.serve === 'function' && !Deno.args.includes('--dry')) {
  Deno.serve(async () => {
    try { return Response.json(await run(false)); }
    catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
  });
} else if (import.meta.main) {
  console.log(JSON.stringify(await run(true), null, 1));
}
