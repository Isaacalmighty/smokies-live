"""Find wrong or duplicate business/landmark points in the Overture places data.

Overture's places come partly from social check-in pages. Some of those pages sit in the
wrong spot: a misspelled copy of a real place ("Walter State Community College") dropped on
an apartment complex, the same page pinned in two towns, or a check-in called
"Pigeon Forge, Smoky Mountains, Tn". When the app names a spot it uses the nearest
business, so one bad point renames everything around it.

Usage: python3 tools/clean_places.py places.parquet  -> writes tools/places_fix.json
  places.parquet = Overture places for the map area (pipeline/overture.py theme=places/type=place)
Then run tools/apply_places_fix.py to patch the map tiles and search index.
"""
import sys, json, math, re, collections
import pyarrow.parquet as pq, shapely.wkb

def km(a, b): return math.hypot((a[0] - b[0]) * 90.3, (a[1] - b[1]) * 111.2)
def norm(s): return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', s.lower().replace('&', ' and '))).strip()
def lev(a, b):
    if abs(len(a) - len(b)) > 2: return 9
    p = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        c = [i]
        for j, cb in enumerate(b, 1): c.append(min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (ca != cb)))
        p = c
    return p[-1]
def domain(u): m = re.match(r'https?://(?:www\.)?([^/]+)', u or ''); return m and m.group(1).lower()
def street(r):  # a real street address has a house number: "1720 Old Newport Hwy", not "US-441"
    a = r['addresses'] and r['addresses'][0].get('freeform') or ''
    return a if re.match(r'\s*\d+[a-z]?\s+[a-z]', a, re.I) else ''
# Trails, falls and overlooks rarely have addresses and the same name can be a trailhead and the
# feature itself, so the duplicate rules leave nature alone.
NATURE = {'park', 'national_park', 'state_park', 'mountain', 'waterfall', 'hiking_trail', 'trail', 'lake', 'river', 'forest',
          'campground', 'scenic_viewpoint', 'landmark_and_historical_building', 'historic_site', 'nature_reserve', 'beach',
          'natural_feature', 'scenic_spot'}

TOWNS = {'gatlinburg', 'pigeon forge', 'sevierville', 'cherokee', 'townsend', 'maryville', 'knoxville', 'bryson city',
         'maggie valley', 'waynesville', 'cosby', 'wears valley', 'kodak', 'seymour', 'newport', 'walland'}
REGION = re.compile(r'\b(the|great|smok(e)?y|smokies|mountains?|mtns?|national park|tn|tenn|tennessee|nc|north carolina|usa|east|of|in|area|blue ridge)\b')
def region_only(n):
    rest = REGION.sub(' ', n); rest = re.sub(r'\s+', ' ', rest).strip()
    return rest == '' or rest in TOWNS

APTS = re.compile(r'\b(apartments?|apts|apartment homes|condominiums?|condos?|townhomes?|townhouses?|flats|lofts|villas|residences|duplexes|mobile home park|subdivision)\b', re.I)
WRONG_FOR_HOMES = {'historic_site', 'place', 'mountain', 'landmark_and_historical_building', 'park', None}

rows = []
for r in pq.read_table(sys.argv[1]).to_pylist():
    n = (r['names'] or {}).get('primary')
    if not n: continue
    g = shapely.wkb.loads(r['geometry'])
    rows.append(dict(closed=r.get('operating_status') == 'permanently_closed', id=r['id'], name=n, n=norm(n), xy=(g.x, g.y), conf=r['confidence'] or 0, cat=r['basic_category'],
                     addr=street(r), web={domain(w) for w in (r['websites'] or []) if domain(w)},
                     fb={s for s in (r['socials'] or []) if 'facebook' in s}))

drop = {}   # id -> reason
rename = {}  # id -> new name

# 0. businesses Overture marks as permanently closed
for r in rows:
    if r['closed']: drop[r['id']] = 'permanently closed'

# 0b. places that were renamed or are gone, checked against current sources (Nov 2026):
#   Clingmans Dome -> Kuwohi (US Board on Geographic Names, Sept 18 2024, nps.gov)
#   Ober Mountain -> Ober Gatlinburg (name restored April 2026, visitmysmokies.com)
#   Gatlinburg SkyLift Park -> Gatlinburg SkyPark (June 2023, gatlinburgskypark.com)
#   Dixie Stampede -> Dolly Parton's Stampede (2018); the map already has a pin under the new name
#   Belz Factory Outlet World closed; the building is now The Mountain Mile
KUWOHI = (-83.4985, 35.5629); GATLINBURG = (-83.5150, 35.7110)
RULES = [  # pattern, new name (None = drop), near, within km (outside it: drop as misplaced)
    (r"^clingman'?s? ?dome$", 'Kuwohi', KUWOHI, 1.5),
    (r"^clingman'?s? ?dome\b.*(smok|park|nc|ft)", None, None, 0),
    (r"^dixie stampede$", None, None, 0),
    (r"^belz factory outlet world$", None, None, 0),
    (r"^ober mountain", lambda n: re.sub(r'(?i)^ober mountain', 'Ober Gatlinburg', n), GATLINBURG, 6),
    (r"^(gatlinburg )?sky ?lift( park)?( in gatlinburg.*)?$|^skylift in gatlinburg", 'Gatlinburg SkyPark', GATLINBURG, 2.5),
]
for r in rows:
    if r['id'] in drop: continue
    for pat, new, near, within in RULES:
        if not re.search(pat, r['name'].strip(), re.I): continue
        if new is None: drop[r['id']] = 'closed or renamed; current name already on the map'
        elif near and km(r['xy'], near) > within: drop[r['id']] = 'misplaced copy of ' + (new if isinstance(new, str) else r['name'])
        else: rename[r['id']] = new(r['name']) if callable(new) else new
        break
byname = collections.defaultdict(list)
for r in rows: byname[r['n'][:6]].append(r)
rank = lambda r: (bool(r['addr']), r['conf'])

# names with two or more different street addresses are chains: their branches are all real
addrs_of = collections.defaultdict(set)
for r in rows:
    if r['addr']: addrs_of[r['n']].add(norm(r['addr']))
chain = {n for n, a in addrs_of.items() if len(a) > 1}

for r in rows:
    # 1. a copy of a real place, with a near-identical name but no street address, somewhere else
    if not r['addr'] and len(r['n']) >= 8 and r['cat'] not in NATURE and r['n'] not in chain:
        for q in byname[r['n'][:6]] + byname.get(r['n'][:5] + 's', []) + [x for k, v in byname.items() if k[:4] == r['n'][:4] for x in v]:
            if q is r or not q['addr'] or q['n'] in chain or km(r['xy'], q['xy']) < 0.3: continue
            same = r['n'] == q['n'] or lev(r['n'], q['n']) <= 2
            linked = (r['web'] & q['web']) or (r['fb'] & q['fb']) or r['cat'] == q['cat']
            if same and linked: drop[r['id']] = f"copy of '{q['name']}' ({km(r['xy'], q['xy']):.1f} km away, no street address)"; break
    # 2. a check-in named after the region or a town, not a real place
    if r['id'] not in drop and not r['addr'] and region_only(r['n']):
        drop[r['id']] = 'named after the region, not a place'

# 3. the same page or the same name + address pinned in more than one spot: keep the best one
groups = collections.defaultdict(list)
for r in rows:
    for f in r['fb']: groups['fb' + f].append(r)
    if r['addr']: groups['ad' + r['n'] + '|' + norm(r['addr'])].append(r)
for k, g in groups.items():
    g = [r for r in g if r['id'] not in drop and r['cat'] not in NATURE and r['n'] not in chain]
    if len(g) < 2: continue
    if k.startswith('fb'):
        # one page = one place, unless they have different street addresses (a chain's branches)
        g = [r for r in g if r['n'] == g[0]['n'] or lev(r['n'], g[0]['n']) <= 2]
        addrs = {norm(r['addr']) for r in g if r['addr']}
        if len(addrs) > 1 or len(g) < 2: continue
    best = max(g, key=rank)
    for r in g:
        if r is not best and km(r['xy'], best['xy']) > 0.15:
            drop[r['id']] = f"duplicate of '{best['name']}' {km(r['xy'], best['xy']):.1f} km away"

def home_kind(n):
    n = n.lower()
    return 'neighborhood' if 'subdivision' in n else 'condos' if re.search(r'condo', n) else 'townhomes' if re.search(r'town ?(homes?|houses?)', n) else 'apartments'
recat = {r['id']: home_kind(r['name']) for r in rows if r['id'] not in drop and r['cat'] in WRONG_FOR_HOMES and APTS.search(r['name'])}

out = {'drop': [[r['name'], round(r['xy'][0], 5), round(r['xy'][1], 5), drop[r['id']]] for r in rows if r['id'] in drop],
       'rename': [[r['name'], round(r['xy'][0], 5), round(r['xy'][1], 5), rename[r['id']]] for r in rows if r['id'] in rename and r['id'] not in drop],
       'recat': [[r['name'], round(r['xy'][0], 5), round(r['xy'][1], 5), recat[r['id']]] for r in rows if r['id'] in recat]}
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else 'tools/places_fix.json', 'w'), indent=0)
print('drop', len(out['drop']), 'rename', len(out['rename']), 'recategorize', len(out['recat']))
