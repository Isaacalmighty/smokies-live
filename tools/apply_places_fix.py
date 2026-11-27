"""Apply tools/places_fix.json to the map: remove bad business/landmark pins from the vector
tile packs (data/vector/*.wasm), the search index (data/search.json) and the news place list
(scripts/gazetteer.json), fix wrong categories, and add the few places listed in ADD.

It edits only the 'poi' layer inside each tile and copies every other byte as it was, so roads,
buildings and water are untouched. Safe to run more than once.

Usage: python3 tools/apply_places_fix.py
"""
import json, math, struct, glob, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = json.load(open(os.path.join(ROOT, 'tools/places_fix.json')))
# Places the map data is missing. [name, lng, lat, category]
ADD = [['Riverpark Apartments', -83.58234, 35.88464, 'apartments']]
# News still uses old names. The news place list matches the old name and shows the current one
# (an optional 6th field). old name -> (current name, lng, lat)
ALIASES = {'Clingmans Dome': ('Kuwohi', -83.4985, 35.5628), "Clingman's Dome": ('Kuwohi', -83.4985, 35.5628),
           'Ober Mountain': ('Ober Gatlinburg', -83.5594, 35.7106), 'Gatlinburg SkyLift': ('Gatlinburg SkyPark', -83.5154, 35.7109),
           'Gatlinburg Sky Lift': ('Gatlinburg SkyPark', -83.5154, 35.7109), 'Dixie Stampede': ("Dolly Parton's Stampede", -83.54671, 35.77985)}
CURRENT = [['Gatlinburg SkyPark', -83.5154, 35.7109, 'curated', 5], ['Ober Gatlinburg', -83.5594, 35.7106, 'curated', 5]]

def km(a, b): return math.hypot((a[0] - b[0]) * 90.3, (a[1] - b[1]) * 111.2)
def key(n): return n.replace('\n', ' · ').replace(';', ' · ').strip().lower()
CELL = 0.002
def grid(rows):
    g = {}
    for r in rows: g.setdefault((key(r[0]), round(r[1] / CELL), round(r[2] / CELL)), []).append(r)
    return g
def find(g, name, lng, lat, tol=0.012):
    k = key(name); cx, cy = round(lng / CELL), round(lat / CELL)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for r in g.get((k, cx + dx, cy + dy), []):
                if km((lng, lat), (r[1], r[2])) < tol: return r
    return None
DROP, RECAT, RENAME = grid(FIX['drop']), grid(FIX['recat']), grid(FIX.get('rename', []))
# Buildings (from OpenStreetMap via Overture) whose name changed. old -> new
BUILDING_RENAME = {'Ober Mountain': 'Ober Gatlinburg', 'Ober Mountain Lodge': 'Ober Gatlinburg Lodge'}

# ---------------------------------------------------------------- protobuf, just enough for MVT
def varint(b, i):
    v = s = 0
    while True:
        c = b[i]; i += 1; v |= (c & 0x7f) << s; s += 7
        if c < 0x80: return v, i
def enc_varint(v):
    out = bytearray()
    while True:
        c = v & 0x7f; v >>= 7
        if v: out.append(c | 0x80)
        else: out.append(c); return bytes(out)
def fields(b):
    i = 0
    while i < len(b):
        start = i; tag, i = varint(b, i); f, wt = tag >> 3, tag & 7
        if wt == 0: v, i = varint(b, i)
        elif wt == 2: n, i = varint(b, i); v = b[i:i + n]; i += n
        elif wt == 1: v = b[i:i + 8]; i += 8
        elif wt == 5: v = b[i:i + 4]; i += 4
        else: raise ValueError('wire type %d' % wt)
        yield f, wt, v, b[start:i]
def ld(f, payload): return enc_varint(f << 3 | 2) + enc_varint(len(payload)) + payload
def packed(b):
    out, i = [], 0
    while i < len(b): v, i = varint(b, i); out.append(v)
    return out
def zz(v): return (v >> 1) ^ -(v & 1)

def tile_ll(z, x, y, px, py, ext):
    n = 2 ** z; lon = (x + px / ext) / n * 360 - 180
    yy = (y + py / ext) / n; return lon, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy))))
def ll_tile(z, x, y, lon, lat, ext):
    n = 2 ** z; r = math.radians(lat)
    return round(((lon + 180) / 360 * n - x) * ext), round(((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n - y) * ext)

stats = {'dropped': 0, 'recat': 0, 'renamed': 0, 'added': 0}
def fix_layer(lb, z, x, y):
    parts = list(fields(lb))
    name = next(v for f, wt, v, raw in parts if f == 1).decode()
    if name not in ('poi', 'building'): return lb
    ext = next((v for f, wt, v, raw in parts if f == 5), 4096)
    keys = [v.decode() for f, wt, v, raw in parts if f == 3]
    vals = []
    for f, wt, v, raw in parts:
        if f == 4: vals.append(next((s.decode() for ff, _, s, _ in fields(v) if ff == 1), None))
    new_vals = []
    def val_index(s):
        if s in vals: return vals.index(s)
        if s in new_vals: return len(vals) + new_vals.index(s)
        new_vals.append(s); return len(vals) + len(new_vals) - 1
    def key_index(s): return keys.index(s) if s in keys else None
    feats = []
    seen = set()
    for f, wt, v, raw in parts:
        if f != 2: continue
        fp = list(fields(v))
        tags = next((packed(fv) for ff, _, fv, _ in fp if ff == 2), [])
        geom = next((packed(fv) for ff, _, fv, _ in fp if ff == 4), [])
        props = {keys[tags[j]]: vals[tags[j + 1]] for j in range(0, len(tags), 2)}
        n = props.get('n')
        def retag(k, new):
            ki = key_index(k); t = list(tags)
            for j in range(0, len(t), 2):
                if t[j] == ki: t[j + 1] = val_index(new)
            return ld(2, b''.join(ld(2, b''.join(enc_varint(x) for x in t)) if ff == 2 else fraw for ff, _, _, fraw in fp))
        if name == 'building':
            if n in BUILDING_RENAME: feats.append(retag('n', BUILDING_RENAME[n])); stats['renamed'] += 1
            else: feats.append(raw)
            continue
        if n and len(geom) >= 3 and (geom[0] & 7) == 1:
            lon, lat = tile_ll(z, x, y, zz(geom[1]), zz(geom[2]), ext)
            seen.add(key(n))
            if find(DROP, n, lon, lat): stats['dropped'] += 1; continue
            rn = find(RENAME, n, lon, lat)
            if rn: feats.append(retag('n', rn[3])); seen.add(key(rn[3])); stats['renamed'] += 1; continue
            rc = find(RECAT, n, lon, lat)
            if rc and props.get('c') != rc[3] and key_index('c') is not None:
                ci = key_index('c'); tags = list(tags)
                for j in range(0, len(tags), 2):
                    if tags[j] == ci: tags[j + 1] = val_index(rc[3])
                body = b''.join(ld(2, b''.join(enc_varint(t) for t in tags)) if ff == 2 else fraw for ff, _, _, fraw in fp)
                feats.append(ld(2, body)); stats['recat'] += 1; continue
        feats.append(raw)
    if z >= 13 and name == 'poi':
        for n, lon, lat, c in ADD:
            px, py = ll_tile(z, x, y, lon, lat, ext)
            if not (0 <= px < ext and 0 <= py < ext) or key(n) in seen: continue
            if key_index('n') is None or key_index('c') is None: continue
            tags = [key_index('n'), val_index(n), key_index('c'), val_index(c)]
            body = enc_varint(2 << 3 | 2) + enc_varint(len(b''.join(enc_varint(t) for t in tags))) + b''.join(enc_varint(t) for t in tags)
            body += enc_varint(3 << 3) + enc_varint(1)  # POINT
            g = b''.join(enc_varint(t) for t in [9, (px << 1) ^ (px >> 31), (py << 1) ^ (py >> 31)])
            body += ld(4, g)
            feats.append(ld(2, body)); stats['added'] += 1
    out, done_feats, last_val = [], False, max([i for i, p in enumerate(parts) if p[0] == 4], default=None)
    for i, (f, wt, v, raw) in enumerate(parts):
        if f == 2:
            if not done_feats: out.extend(feats); done_feats = True
            continue
        out.append(raw)
        if i == last_val: out.extend(ld(4, ld(1, s.encode())) for s in new_vals)
    if not done_feats: out.extend(feats)
    if last_val is None: out.extend(ld(4, ld(1, s.encode())) for s in new_vals)
    return b''.join(out)

def fix_tile(tb, z, x, y):
    return b''.join(ld(3, fix_layer(v, z, x, y)) if f == 3 else raw for f, wt, v, raw in fields(tb))

for path in sorted(glob.glob(os.path.join(ROOT, 'data/vector/*.wasm'))):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[4:8])[0]; idx = json.loads(b[8:8 + n]); st = 8 + n
    blobs, new_idx, off = [], {}, 0
    for k, (o, l) in idx.items():
        z, x, y = map(int, k.split('/'))
        t = b[st + o:st + o + l]
        t2 = fix_tile(t, z, x, y)
        new_idx[k] = [off, len(t2)]; blobs.append(t2); off += len(t2)
    head = json.dumps(new_idx, separators=(',', ':')).encode()
    new = b[:4] + struct.pack('<I', len(head)) + head + b''.join(blobs)
    if new != b: open(path, 'wb').write(new)

def fix_list(path, tier):
    rows = json.load(open(path)); out = []; names = {key(r[0]) for r in rows}
    for r in rows:
        if find(DROP, r[0], r[1], r[2]): stats['dropped'] += 1; continue
        rc = find(RECAT, r[0], r[1], r[2])
        if rc: r = [r[0], r[1], r[2], rc[3], r[4]]
        rn = find(RENAME, r[0], r[1], r[2])
        if rn: r = [rn[3]] + r[1:]
        out.append(r)
    for n, lon, lat, c in ADD:
        if key(n) not in names: out.append([n, lon, lat, c, tier])
    if 'gazetteer' in path:
        out = [r for r in out if r[0] not in ALIASES]
        out += [[old, lng, lat, 'curated', 5, new] for old, (new, lng, lat) in ALIASES.items()]
        have = {(r[0], r[3]) for r in out}
        out += [r for r in CURRENT if (r[0], r[3]) not in have]
        out.sort(key=lambda r: -len(r[0]))
    json.dump(out, open(path, 'w'), separators=(',', ':'))
fix_list(os.path.join(ROOT, 'data/search.json'), 3)
fix_list(os.path.join(ROOT, 'scripts/gazetteer.json'), 4)
print(stats)
