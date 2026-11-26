# Smokies Live

A live 3D map of the Great Smoky Mountains and its gateway towns, built from free public data.

**Site:** https://isaacalmighty.github.io/smokies-live/

- `index.html` is the whole app (MapLibre GL JS, no build step).
- `data/` holds the map tiles, bundled into packs (Sentinel-2 imagery, USGS 3DEP terrain and LiDAR, Overture Maps vectors).
- `scripts/fetch_feeds.py` runs every 10 minutes on GitHub Actions and writes news, events, road alerts, cameras, fire detections and river gauges to the `feeds` branch, which the app reads.
- Weather, clouds, radar, NWS alerts and the ISS position are fetched by the browser directly.

Optional secrets (Settings → Secrets and variables → Actions):
- `TDOT_API_KEY`: free key from TDOT's open data portal, adds Tennessee traffic incidents and cameras.
- `NPS_API_KEY`: free key from developer.nps.gov, raises the National Park Service rate limit.
