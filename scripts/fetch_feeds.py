#!/usr/bin/env python3
"""Smokies Live feed refresher.

Runs on a GitHub Actions schedule. Fetches public feeds that browsers can't
read directly (no CORS) or that need light processing, and writes small JSON
files the app reads from the `feeds` branch. Standard library only.

Every source is optional: a failure is logged in status.json and the last good
file is kept, so the app never goes blank because one site hiccuped.
"""
import csv, gzip, html, io, json, os, re, sys, time, traceback
import urllib.request, urllib.error, urllib.parse
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
BBOX = (-84.10, 35.30, -82.90, 36.10)  # w, s, e, n: the park plus Sevier County and nearby towns
UA = 'SmokiesLive/1.0 (+https://github.com/Isaacalmighty/smokies-live)'
NOW = datetime.now(timezone.utc)
status = {'updated': NOW.isoformat(timespec='seconds'), 'sources': {}}
PROBE = os.environ.get('PROBE') == '1'


def get(url, headers=None, timeout=25, raw=False):
    h = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip'}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        if r.headers.get('Content-Encoding') == 'gzip': data = gzip.decompress(data)
        if raw: return data, r.status, dict(r.headers)
        return data


def note(name, ok, n=0, err=None, sample=None, url=None):
    s = {'ok': ok, 'count': n}
    if err: s['error'] = str(err)[:300]
    if url: s['url'] = url
    if sample is not None and PROBE: s['sample'] = sample[:1500]
    status['sources'][name] = s
    print(('OK  ' if ok else 'ERR ') + name, n, err or '', flush=True)


def save(name, obj):
    with open(os.path.join(OUT, name), 'w') as f: json.dump(obj, f, separators=(',', ':'))


def in_bbox(lng, lat, pad=0.0):
    return BBOX[0] - pad <= lng <= BBOX[2] + pad and BBOX[1] - pad <= lat <= BBOX[3] + pad


# ---------------------------------------------------------------- places
GAZ = json.load(open(os.path.join(HERE, 'gazetteer.json')))  # [name, lng, lat, kind, priority], longest first
GAZ_RE = [(re.compile(r'(?<![\w\'])' + re.escape(n) + r'(?![\w])'), n, lng, lat, kind, pri) for n, lng, lat, kind, pri in GAZ]
TRUSTED = re.compile(r'Mountain Press|WBIR|WATE|WVLT|Knox ?News|News Sentinel|Smoky Mountain News|Smoky Mountain Times|Citizen[- ]Times|Daily Times|Cherokee One Feather|WLOS|WJHL|Tennessee Lookout|Tennessean|AP News|Associated Press|National Park Service|NPS\.gov|City of|County|Blue Ridge Public Radio|WUOT|Cardinal & Pine|Asheville|Knoxville|Tennessee|Gatlinburg|Pigeon Forge|Sevier', re.I)
LOCAL_WORDS = re.compile(r'Sevier|Gatlinburg|Pigeon Forge|Sevierville|Smoky|Smokies|Kodak|Seymour|Wears Valley|Townsend|Cosby|Pittman|Cherokee|Bryson|Cades Cove|Dollywood|LeConte|Le Conte|Newfound', re.I)


def geotag(*texts):
    """Find the most specific known place named in the text."""
    best = None
    t = ' '.join(x for x in texts if x)
    for rx, n, lng, lat, kind, pri in GAZ_RE:
        if rx.search(t):
            score = pri * 100 + len(n)
            if not best or score > best[0]: best = (score, {'name': n, 'lng': lng, 'lat': lat, 'kind': kind})
    return best[1] if best else None


def clean(s, n=280):
    if not s: return ''
    s = re.sub(r'<[^>]+>', ' ', html.unescape(s))
    s = re.sub(r'\s+', ' ', s).strip()
    return s if len(s) <= n else s[:n].rsplit(' ', 1)[0] + '…'


def when(s):
    if not s: return None
    for f in (lambda x: parsedate_to_datetime(x), lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))):
        try:
            d = f(s.strip())
            if d.tzinfo is None: d = d.replace(tzinfo=timezone.utc)
            return d.astimezone(timezone.utc).isoformat(timespec='seconds')
        except Exception: pass
    return None


NS = {'media': 'http://search.yahoo.com/mrss/', 'atom': 'http://www.w3.org/2005/Atom', 'content': 'http://purl.org/rss/1.0/modules/content/', 'dc': 'http://purl.org/dc/elements/1.1/'}


def parse_feed(data):
    try:
        root = ET.fromstring(data)
    except ET.ParseError:  # common feed sloppiness: bare ampersands and control characters
        t = data.decode('utf8', 'replace')
        t = re.sub(r'&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)', '&amp;', t)
        t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', t)
        root = ET.fromstring(t.encode('utf8'))
    items = []
    for it in root.iter('item'):
        g = lambda tag: (it.findtext(tag) or '').strip()
        img = None
        for m in it.findall('media:content', NS) + it.findall('media:thumbnail', NS) + it.findall('enclosure'):
            u = m.get('url')
            if u and (m.get('type', 'image').startswith('image') or m.tag.endswith('thumbnail')): img = u; break
        desc = g('description') or (it.findtext('content:encoded', namespaces=NS) or '')
        if not img:
            m = re.search(r'<img[^>]+src="([^"]+)"', desc)
            if m: img = html.unescape(m.group(1))
        src = it.find('source')
        items.append({'title': clean(g('title'), 200), 'link': g('link'), 'published': when(g('pubDate') or it.findtext('dc:date', namespaces=NS)),
                      'summary': clean(desc), 'img': img, 'via': src.text.strip() if src is not None and src.text else None})
    for e in root.findall('atom:entry', NS):
        link = e.find('atom:link', NS)
        items.append({'title': clean(e.findtext('atom:title', '', NS), 200), 'link': link.get('href') if link is not None else '',
                      'published': when(e.findtext('atom:updated', '', NS) or e.findtext('atom:published', '', NS)),
                      'summary': clean(e.findtext('atom:summary', '', NS) or e.findtext('atom:content', '', NS)), 'img': None, 'via': None})
    return items


# ---------------------------------------------------------------- news
NEWS = [
    # The Mountain Press rate-limits automated requests, so its stories come through Google News
    ('Google News', 'https://news.google.com/rss/search?q=site:themountainpress.com+when:7d&hl=en-US&gl=US&ceid=US:en'),
    ('WBIR 10News', 'https://www.wbir.com/feeds/syndication/rss/news/local'),
    ('WATE 6', 'https://www.wate.com/news/local-news/sevier-county/feed/'),
    ('WVLT', 'https://www.wvlt.tv/arc/outboundfeeds/rss/?outputType=xml'),
    ('Smoky Mountain News', 'https://www.smokymountainnews.com/news?format=feed&type=rss'),
    ('National Park Service', 'https://www.nps.gov/feeds/getNewsRSS.htm?id=grsm'),
    ('Google News', 'https://news.google.com/rss/search?q=%22Sevier+County%22+OR+Gatlinburg+OR+%22Pigeon+Forge%22+OR+Sevierville+when:7d&hl=en-US&gl=US&ceid=US:en'),
    ('Google News', 'https://news.google.com/rss/search?q=%22Great+Smoky+Mountains%22+when:7d&hl=en-US&gl=US&ceid=US:en'),
]


def fetch_news():
    seen, out = set(), []
    for name, url in NEWS:
        key = name + ' ' + url.split('?')[0][-30:]
        try:
            items = parse_feed(get(url))
            n = 0
            for it in items:
                src = it.pop('via') or name
                if name == 'Google News' and ' - ' in it['title']:
                    it['title'], src = it['title'].rsplit(' - ', 1)
                    if not TRUSTED.search(src): continue  # skip content farms that Google News mixes in
                k = re.sub(r'\W+', '', it['title'].lower())[:80]
                if not it['title'] or k in seen: continue
                text = it['title'] + ' ' + it['summary']
                broad = name in ('WVLT', 'WBIR 10News', 'Google News')
                if broad and not LOCAL_WORDS.search(text): continue
                seen.add(k); n += 1
                it['source'] = src.strip()
                it['place'] = geotag(it['title'], it['summary'])
                it['id'] = k[:40]
                out.append(it)
            note('news:' + key, True, n, url=url, sample=None)
        except Exception as e:
            note('news:' + key, False, err=e, url=url)
    out.sort(key=lambda x: x['published'] or '', reverse=True)
    cutoff = (NOW - timedelta(days=10)).isoformat()
    out = [x for x in out if (x['published'] or NOW.isoformat()) >= cutoff][:80]
    if out: save('news.json', {'updated': NOW.isoformat(timespec='seconds'), 'items': out})
    return len(out)


# ---------------------------------------------------------------- events
EVENTS = [
    ('Gatlinburg', 'https://www.gatlinburg.com/event/rss/'),
    ('Pigeon Forge', 'https://www.mypigeonforge.com/event/rss/'),
    ('Sevierville', 'https://www.visitsevierville.com/event/rss/'),
    ('Google News', 'https://news.google.com/rss/search?q=(Gatlinburg+OR+%22Pigeon+Forge%22+OR+Sevierville)+(festival+OR+parade+OR+concert+OR+event)+when:14d&hl=en-US&gl=US&ceid=US:en'),
]


def fetch_events():
    out, seen = [], set()
    for name, url in EVENTS:
        try:
            data = get(url)
            items = parse_feed(data)
            n = 0
            for it in items:
                src = it.pop('via') or name
                if name == 'Google News' and ' - ' in it['title']: it['title'], src = it['title'].rsplit(' - ', 1)
                if name == 'Google News' and not TRUSTED.search(src): continue
                k = re.sub(r'\W+', '', it['title'].lower())[:80]
                if not it['title'] or k in seen: continue
                seen.add(k); n += 1
                it['source'] = src; it['place'] = geotag(it['title'], it['summary']) or (geotag(name) if name != 'Google News' else None); it['id'] = k[:40]
                out.append(it)
            note('events:' + name, True, n, url=url, sample=data[:1500].decode('utf8', 'replace'))
        except Exception as e:
            note('events:' + name, False, err=e, url=url)
    try:  # NPS events (DEMO_KEY is rate limited but enough for this schedule)
        key = os.environ.get('NPS_API_KEY') or 'DEMO_KEY'
        j = json.loads(get(f'https://developer.nps.gov/api/v1/events?parkCode=grsm&pageSize=50&api_key={key}'))
        n = 0
        for e in j.get('data', []):
            lat, lng = e.get('latitude'), e.get('longitude')
            place = {'name': e.get('location') or 'Great Smoky Mountains', 'lng': float(lng), 'lat': float(lat), 'kind': 'nps'} if lat and lng else geotag(e.get('location', ''), e.get('title', ''))
            dates = e.get('dates') or []
            out.append({'id': 'nps' + str(e.get('id'))[:20], 'title': clean(e.get('title'), 200), 'link': e.get('infourl') or e.get('url') or 'https://www.nps.gov/grsm/planyourvisit/calendar.htm',
                        'summary': clean(e.get('description')), 'published': None, 'start': dates[0] if dates else e.get('datestart'), 'times': e.get('times'), 'source': 'National Park Service', 'place': place, 'img': None})
            n += 1
        note('events:nps', True, n)
    except Exception as e:
        note('events:nps', False, err=e)
    if out: save('events.json', {'updated': NOW.isoformat(timespec='seconds'), 'items': out[:80]})
    return len(out)


# ---------------------------------------------------------------- traffic and cameras
def fetch_traffic():
    incidents, cameras = [], []
    key = os.environ.get('TDOT_API_KEY')
    base = 'https://www.tdot.tn.gov/opendata/api/public/'
    for kind in ('RoadwayIncidents', 'RoadwayOperations', 'RoadwaySpecialEvents', 'RoadwayCameras'):
        url = base + kind
        try:
            data = get(url, headers={'ApiKey': key} if key else None)
            j = json.loads(data)
            rows = j if isinstance(j, list) else j.get('data') or j.get('features') or []
            n = 0
            for r in rows:
                p = r.get('properties', r) if isinstance(r, dict) else {}
                lat = p.get('lat') or p.get('latitude') or p.get('Latitude') or (p.get('location') or {}).get('lat')
                lng = p.get('lng') or p.get('lon') or p.get('longitude') or p.get('Longitude') or (p.get('location') or {}).get('lng')
                if lat is None and isinstance(r, dict) and r.get('geometry'):
                    c = r['geometry'].get('coordinates')
                    while isinstance(c, list) and c and isinstance(c[0], list): c = c[0]
                    if c: lng, lat = c[0], c[1]
                try: lat, lng = float(lat), float(lng)
                except Exception: continue
                if not in_bbox(lng, lat, 0.15): continue
                n += 1
                if kind == 'RoadwayCameras':
                    cameras.append({'id': str(p.get('id') or p.get('cameraId') or n), 'name': p.get('title') or p.get('name') or p.get('description') or 'TDOT camera', 'lng': lng, 'lat': lat,
                                    'img': p.get('thumbnailUrl') or p.get('imageUrl') or p.get('snapshotUrl') or p.get('httpVideoUrl'), 'video': p.get('httpsVideoUrl') or p.get('hlsUrl') or p.get('videoUrl'), 'source': 'TDOT SmartWay'})
                else:
                    incidents.append({'id': str(p.get('id') or p.get('eventId') or n), 'type': kind.replace('Roadway', '').rstrip('s').lower(), 'title': clean(p.get('eventType') or p.get('type') or p.get('headline') or kind, 120),
                                      'desc': clean(p.get('description') or p.get('message') or '', 300), 'road': p.get('roadway') or p.get('roadwayName') or p.get('route'), 'lng': lng, 'lat': lat,
                                      'severity': p.get('severity') or p.get('impact'), 'start': p.get('startTime') or p.get('start') or p.get('beginDate'), 'source': 'TDOT SmartWay'})
            note('traffic:tdot:' + kind, True, n, url=url)
        except urllib.error.HTTPError as e:
            note('traffic:tdot:' + kind, False, err=f'HTTP {e.code}' + ('' if key else ' (no TDOT_API_KEY secret set)'), url=url)
        except Exception as e:
            note('traffic:tdot:' + kind, False, err=e, url=url)
    # NC: Swain (87) and Haywood (44) counties, NCDOT TIMS
    for cid in (87, 44):
        url = f'https://eapps.ncdot.gov/services/traffic-prod/v1/counties/{cid}/incidents'
        try:
            j = json.loads(get(url))
            n = 0
            for r in j if isinstance(j, list) else []:
                lat, lng = r.get('latitude'), r.get('longitude')
                if lat is None: continue
                incidents.append({'id': 'nc' + str(r.get('id')), 'type': (r.get('incidentType') or 'incident').lower(), 'title': clean(r.get('incidentType') or 'Incident', 120), 'desc': clean(r.get('reason') or r.get('commonName') or '', 300),
                                  'road': r.get('road', {}).get('name') if isinstance(r.get('road'), dict) else r.get('road'), 'lng': float(lng), 'lat': float(lat), 'severity': r.get('severity'), 'start': r.get('start'), 'source': 'NCDOT'})
                n += 1
            note(f'traffic:ncdot:{cid}', True, n, url=url)
        except Exception as e:
            note(f'traffic:ncdot:{cid}', False, err=e, url=url)
    # park road status from NPS alerts
    try:
        key = os.environ.get('NPS_API_KEY') or 'DEMO_KEY'
        j = json.loads(get(f'https://developer.nps.gov/api/v1/alerts?parkCode=grsm&limit=50&api_key={key}'))
        n = 0
        for a in j.get('data', []):
            place = geotag(a.get('title', ''), a.get('description', ''))
            incidents.append({'id': 'nps' + str(a.get('id'))[:20], 'type': (a.get('category') or 'alert').lower(), 'title': clean(a.get('title'), 160), 'desc': clean(a.get('description'), 400),
                              'road': None, 'lng': place['lng'] if place else None, 'lat': place['lat'] if place else None, 'place': place, 'start': a.get('lastIndexedDate'), 'link': a.get('url'), 'source': 'National Park Service'})
            n += 1
        note('traffic:nps-alerts', True, n)
    except Exception as e:
        note('traffic:nps-alerts', False, err=e)
    try:
        key = os.environ.get('NPS_API_KEY') or 'DEMO_KEY'
        j = json.loads(get(f'https://developer.nps.gov/api/v1/webcams?parkCode=grsm&api_key={key}'))
        n = 0
        # NPS air-quality cameras publish a fresh still every few minutes at fixed URLs
        LIVE_STILL = {'look rock': 'https://www.nps.gov/featurecontent/ard/webcams/images/grsmlarge.jpg',
                      'purchase knob': 'https://www.nps.gov/featurecontent/ard/webcams/images/grpklarge.jpg'}
        KNOWN = {'kuwohi': (-83.4985, 35.5628), 'twin creek': (-83.4993, 35.6862), 'newfound gap': (-83.4255, 35.6111)}
        seen = set()
        for w in j.get('data', []):
            title = (w.get('title') or '').strip()
            if title in seen: continue
            seen.add(title)
            lat, lng = w.get('latitude'), w.get('longitude')
            key = next((k for k in KNOWN if k in title.lower()), None)
            if (not lat or not lng) and key: lng, lat = KNOWN[key]
            imgs = w.get('images') or []
            still = next((u for k, u in LIVE_STILL.items() if k in title.lower()), None)
            img = still or (imgs[0].get('url') if imgs else None)
            if img and img.startswith('/'): img = 'https://www.nps.gov' + img
            img = re.sub(r'^https://www\.nps\.gov(?=https?://)', '', img or '') or None
            cameras.append({'id': 'nps' + str(w.get('id'))[:20], 'name': title, 'lng': float(lng) if lng else None, 'lat': float(lat) if lat else None,
                            'img': img, 'still': bool(still), 'page': w.get('url'), 'live': bool(w.get('isStreaming')), 'status': w.get('status'), 'source': 'National Park Service'})
            n += 1
        note('cameras:nps', True, n)
    except Exception as e:
        note('cameras:nps', False, err=e)
    # hand-picked public webcams in town (scripts/cams.json): link to the operator's live page
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        extra = json.load(open(os.path.join(here, 'cams.json')))
        for c in extra:
            cameras.append({'id': c['id'], 'name': c['name'], 'lng': c['lng'], 'lat': c['lat'], 'img': c.get('img'), 'still': bool(c.get('still')),
                            'page': c['url'], 'live': True, 'source': c.get('operator') or 'Webcam', 'spot': c.get('spot')})
        note('cameras:curated', True, len(extra))
    except Exception as e:
        note('cameras:curated', False, err=e)
    save('traffic.json', {'updated': NOW.isoformat(timespec='seconds'), 'incidents': incidents, 'cameras': cameras})
    return len(incidents) + len(cameras)


# ---------------------------------------------------------------- fires
FIRMS = [
    ('VIIRS NOAA-20', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv'),
    ('VIIRS NOAA-21', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv'),
    ('VIIRS S-NPP', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv'),
    ('MODIS', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_USA_contiguous_and_Hawaii_24h.csv'),
]


def fetch_fires():
    out = []
    ok = False
    for name, url in FIRMS:
        try:
            rows = csv.DictReader(io.StringIO(get(url, timeout=60).decode('utf8', 'replace')))
            n = 0
            for r in rows:
                lat, lng = float(r['latitude']), float(r['longitude'])
                if not in_bbox(lng, lat, 0.3): continue
                out.append({'lng': lng, 'lat': lat, 'sat': name, 'frp': float(r.get('frp') or 0), 'conf': r.get('confidence'), 'date': r.get('acq_date'), 'time': r.get('acq_time'), 'dn': r.get('daynight')})
                n += 1
            ok = True
            note('fires:' + name, True, n, url=url)
        except Exception as e:
            note('fires:' + name, False, err=e, url=url)
    if ok: save('fires.json', {'updated': NOW.isoformat(timespec='seconds'), 'items': out})
    return len(out)


# ---------------------------------------------------------------- rivers (fallback for the browser's direct call)
GAUGES = '03469000,03470000,03469175,03471500,03497300,03498500,03512000,03460000,03461500,03463300,03465500,03513000,03503000'


def fetch_gauges():
    url = f'https://waterservices.usgs.gov/nwis/iv/?format=json&sites={GAUGES}&parameterCd=00060,00065&period=PT24H&siteStatus=active'
    try:
        j = json.loads(get(url, timeout=40))
        sites = {}
        for ts in j['value']['timeSeries']:
            si = ts['sourceInfo']; code = si['siteCode'][0]['value']
            g = si['geoLocation']['geogLocation']
            s = sites.setdefault(code, {'id': code, 'name': si['siteName'], 'lng': g['longitude'], 'lat': g['latitude']})
            p = ts['variable']['variableCode'][0]['value']
            vals = [(v['dateTime'], float(v['value'])) for v in ts['values'][0]['value'] if v['value'] not in ('', '-999999')]
            if not vals: continue
            s['cfs' if p == '00060' else 'ft'] = vals[-1][1]
            s['t'] = vals[-1][0]
            s[('cfs' if p == '00060' else 'ft') + '24'] = [round(v, 2) for _, v in vals[::4]]
        save('gauges.json', {'updated': NOW.isoformat(timespec='seconds'), 'items': list(sites.values())})
        note('gauges:usgs', True, len(sites), url=url)
    except Exception as e:
        note('gauges:usgs', False, err=e, url=url)


# ---------------------------------------------------------------- probes (only when PROBE=1): checks what the browser can call directly
PROBES = {
    'open-meteo': 'https://api.open-meteo.com/v1/forecast?latitude=35.7,35.6&longitude=-83.5,-83.4&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m,dew_point_2m&timezone=America%2FNew_York',
    'rainviewer': 'https://api.rainviewer.com/public/weather-maps.json',
    'gibs-caps': 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    'nws-alerts': 'https://api.weather.gov/alerts/active?point=35.71,-83.51',
    'iss': 'https://api.wheretheiss.at/v1/satellites/25544',
    'nps-cam-lookrock': 'https://www.nps.gov/featurecontent/ard/webcams/images/grsmlarge.jpg',
    'nps-cam-purchase': 'https://www.nps.gov/featurecontent/ard/webcams/images/grpklarge.jpg',
    'smartway-home': 'https://smartway.tn.gov/',
    'smartway-cams': 'https://smartway.tn.gov/allcams',
    'smartway-api-cams': 'https://smartway.tn.gov/api/cameras',
}


def probe():
    for name, url in PROBES.items():
        try:
            data, code, hdr = get(url, raw=True, timeout=25)
            ctype = hdr.get('Content-Type', '')
            text = data[:3000].decode('utf8', 'replace') if 'image' not in ctype else f'<{len(data)} bytes image>'
            status['sources']['probe:' + name] = {'ok': True, 'code': code, 'type': ctype, 'cors': hdr.get('Access-Control-Allow-Origin'), 'sample': text}
            if name == 'gibs-caps':
                ids = sorted(set(re.findall(r'<ows:Identifier>(GOES-East[^<]*)</ows:Identifier>', data.decode('utf8', 'replace'))))
                tms = re.findall(r'<ows:Identifier>GOES-East_ABI_Band13_Clean_Infrared</ows:Identifier>.*?<TileMatrixSet>([^<]+)</TileMatrixSet>', data.decode('utf8', 'replace'), re.S)
                status['sources']['probe:' + name]['sample'] = json.dumps({'layers': ids, 'band13_tms': tms[:1]})
            if name.startswith('smartway'):
                status['sources']['probe:' + name]['links'] = sorted(set(re.findall(r'["\'](/[A-Za-z0-9_/\-\.]*(?:api|Api|cam|Cam|event|Event|incident|Incident)[A-Za-z0-9_/\-\.]*)["\']', data.decode('utf8', 'replace'))))[:80]
            print('PROBE', name, code, ctype, flush=True)
        except Exception as e:
            status['sources']['probe:' + name] = {'ok': False, 'error': str(e)[:300]}
            print('PROBE', name, 'ERR', e, flush=True)


if __name__ == '__main__':
    for fn in (fetch_news, fetch_events, fetch_traffic, fetch_fires, fetch_gauges):
        try: fn()
        except Exception: traceback.print_exc()
    if PROBE: probe()
    save('status.json', status)
