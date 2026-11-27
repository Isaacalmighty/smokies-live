"""Live road speeds for the local features (Local's mode and the "Is it worth going?" score).

Asks TomTom's flow API for the current and free-flow speed on a short list of
roads locals care about: the Parkway through Sevierville, Pigeon Forge and
Gatlinburg, the back roads around it, and the park roads to Cades Cove, Kuwohi
and Newfound Gap. Writes flow.json next to the other feeds.

It also times the Parkway drive (Sevierville to Gatlinburg and back) now and
for leaving in 30, 60, 90 and 120 minutes, for the Parkway clock.

TomTom's free plan allows 2,500 of these calls a day, so this runs on every
other feed refresh (about every 20 minutes): (17 roads + 6 routes) x 72 runs
= 1,656 calls.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
KEY = os.environ.get('TOMTOM_KEY') or 'j81wnoR8SajwacDSKgn20e1SNEzZzf1r'  # same public browser key the map uses

# id, name, lat, lng, group. Points were snapped to the named road in the map's own road data.
ROADS = [
    ('pkwy_sev', 'Parkway, Sevierville', 35.86649, -83.55489, 'parkway'),
    ('pkwy_forks', 'Forks of the River Pkwy', 35.86093, -83.56563, 'parkway'),
    ('pkwy_pf', 'Parkway, Pigeon Forge', 35.81200, -83.57792, 'parkway'),
    ('pkwy_pfs', 'Parkway, south Pigeon Forge', 35.77293, -83.53626, 'parkway'),
    ('spur', 'The Spur', 35.75438, -83.52397, 'parkway'),
    ('pkwy_gat', 'Parkway, downtown Gatlinburg', 35.71293, -83.51394, 'parkway'),
    ('veterans', 'Veterans Blvd', 35.79843, -83.54329, 'back'),
    ('teaster', 'Teaster Ln', 35.80592, -83.57280, 'back'),
    ('middlecreek', 'Middle Creek Rd', 35.81748, -83.53723, 'back'),
    ('dollywood', 'Dollywood Ln', 35.78932, -83.53614, 'back'),
    ('wears', 'Wears Valley Rd', 35.74210, -83.63048, 'back'),
    ('bypass', 'Gatlinburg Bypass', 35.71476, -83.53016, 'back'),
    ('eastpkwy', 'East Parkway (US-321)', 35.72610, -83.48011, 'back'),
    ('newfound', 'Newfound Gap Rd', 35.64183, -83.49767, 'park'),
    ('kuwohi', 'Clingmans Dome Rd', 35.59767, -83.45307, 'park'),
    ('laurel', 'Laurel Creek Rd', 35.62079, -83.73309, 'park'),
    ('loop', 'Cades Cove Loop', 35.60505, -83.79964, 'park'),
]


def flow(lat, lng):
    url = f'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/12/json?point={lat},{lng}&unit=mph&key={KEY}'
    req = urllib.request.Request(url, headers={'User-Agent': 'smokies-live-feeds'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r).get('flowSegmentData', {})


SEV = (35.8681, -83.5617)  # Sevier County Courthouse
GAT = (35.7114, -83.5133)  # Parkway at the aquarium, downtown Gatlinburg


def route(a, b, depart=None):
    when = 'now' if depart is None else urllib.parse.quote(depart.strftime('%Y-%m-%dT%H:%M:%SZ'))
    url = (f'https://api.tomtom.com/routing/1/calculateRoute/{a[0]},{a[1]}:{b[0]},{b[1]}/json'
           f'?traffic=true&departAt={when}&routeType=fastest&travelMode=car&computeTravelTimeFor=all&key={KEY}')
    req = urllib.request.Request(url, headers={'User-Agent': 'smokies-live-feeds'})
    with urllib.request.urlopen(req, timeout=15) as r:
        sm = json.load(r)['routes'][0]['summary']
    return {'min': round(sm['travelTimeInSeconds'] / 60), 'free': round(sm.get('noTrafficTravelTimeInSeconds', sm['travelTimeInSeconds']) / 60),
            'delay': round(sm.get('trafficDelayInSeconds', 0) / 60), 'km': round(sm['lengthInMeters'] / 1000, 1)}


def clock():
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    out = {'sg': [], 'gs': None}
    for k in (0, 30, 60, 90, 120):
        try:
            r = route(SEV, GAT, None if k == 0 else now + timedelta(minutes=k))
            r['in'] = k
            out['sg'].append(r)
            time.sleep(0.3)  # the free plan allows only a few calls a second
        except Exception as e:
            print('route sev->gat +%d failed:' % k, e)
    try:
        time.sleep(0.3)
        out['gs'] = route(GAT, SEV)
    except Exception as e:
        print('route gat->sev failed:', e)
    return out if out['sg'] else None


def main():
    path = os.path.join(OUT, 'flow.json')
    force = os.environ.get('FORCE') == '1'
    try:
        old = json.load(open(path))
        age = time.time() - datetime.fromisoformat(old['updated'].replace('Z', '+00:00')).timestamp()
        if age < 17 * 60 and not force:
            print('flow.json is fresh, skipping to stay inside the TomTom free plan')
            return
    except Exception:
        pass
    items, errors = [], 0
    for rid, name, lat, lng, grp in ROADS:
        try:
            time.sleep(0.15)
            f = flow(lat, lng)
            items.append({'id': rid, 'name': name, 'group': grp, 'lat': lat, 'lng': lng,
                          'cur': f.get('currentSpeed'), 'free': f.get('freeFlowSpeed'),
                          'tt': f.get('currentTravelTime'), 'ftt': f.get('freeFlowTravelTime'),
                          'conf': f.get('confidence'), 'closed': bool(f.get('roadClosure'))})
        except Exception as e:
            errors += 1
            print('flow', rid, 'failed:', e)
    if not items:
        print('no flow data this run')
        return
    with open(path, 'w') as fh:
        json.dump({'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': 'TomTom', 'items': items, 'clock': clock()}, fh, separators=(',', ':'))
    print(f'flow.json: {len(items)} roads, {errors} errors')


if __name__ == '__main__':
    main()
