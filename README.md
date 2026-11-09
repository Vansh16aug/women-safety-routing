# Delhi Night Routes (prototype)

Compares walking routes across Delhi NCT by a **Night Activity Score** (0-100) for the hour you travel. It is an activity estimate, **not a safety rating**: it counts places that are probably open, gaps between them, help points, main-road share, transport, turns and mapped cameras. Public data only (OpenStreetMap and Overture Maps); no survey data and no live camera data.

A step toward a hard problem, not a solution to it. See "Known limits".

## Stack

- **Runtime:** Next.js (App Router) + TypeScript. The map page is static (`public/`, MapLibre GL JS); the API is one route handler (`app/api/[...path]/route.ts`) over an engine in `lib/` (Dijkstra routing, the scorer, search, help lookup).
- **Data build:** Python (`pipeline/`: pyosmium, pandas, scipy). It runs offline and writes `data/runtime/` (flat binary files, 47 MB), which the runtime loads. The Python engine (`pipeline/server.py`) stays as the reference implementation.

## Run locally

```
npm install
npm run dev          # http://localhost:3000
```

## Deploy to Vercel

Import the repo in Vercel. No settings or environment variables are needed: it is detected as a Next.js project, and `next.config.ts` ships `data/runtime/` with the API function. Check the function's region and memory in the project settings if you change them (the engine uses about 200 MB of memory and loads in about 0.3 s per cold instance, measured locally).

## API (prototype)

Read-only JSON under `/api/v1`. Contract: `docs/openapi.json`, also served at `/api/v1/openapi.json`.

| Endpoint | Returns |
|---|---|
| `GET /api/v1/route?slat=&slon=&elat=&elon=&hour=` | Fastest route plus more-active alternatives, each with a Night Activity Score |
| `GET /api/v1/help?lat=&lon=&hour=` | Nearest police stations and hospitals |
| `GET /api/v1/search?q=` | Place search |
| `GET /api/v1/places?kind=` | Whole-city places of one kind |
| `GET /api/v1/layer?name=` | Bus stops, cameras, lamps, coloured metro lines |
| `GET /api/v1/health`, `/info` | Liveness, coverage and weights |

```
curl "https://<your-host>/api/v1/route?slat=28.6806&slon=77.2039&elat=28.6461&elon=77.2430&hour=22"
```

- Every response carries a `meta` block (disclaimer, attribution, version). **Keep the disclaimer visible to your users.**
- CORS is open on `/api/v1`. Limit: 60 calls/min per client, 10/min for `places` and `layer` (`429` with `Retry-After`). The limiter lives in each serverless instance's memory, so it slows casual abuse but is not a hard guarantee; add Vercel Firewall rules for a real limit.
- Unversioned `/api/*` paths serve the web page and may change; build against `/api/v1`.
- Coverage: Delhi NCT, walking only, straight-line distance up to 15 km.

## Rebuild the data

Needs Python with the packages in `pipeline/requirements.txt`, and the Delhi OSM extract (openstreetmap.fr) in `data/raw/`.

| Step | Script | Output |
|---|---|---|
| Measure the data | `pipeline/m0_measure.py` | `data/out/m0_counts.json` |
| Street segments and features | `pipeline/m1_segments.py` | `data/processed/*.parquet` |
| Search index | `pipeline/build_search.py` | `data/processed/search.parquet` |
| Metro lines with colours | `pipeline/build_metro_lines.py` | `data/processed/metro_lines.geojson` |
| Scorer checks | `pipeline/test_scoring.py` | `data/out/m2_checks.json` |
| Export for the runtime | `pipeline/export_runtime.py --processed data/processed --out data/runtime` | `data/runtime/` |

Run Python with `-I -X utf8`. Settings, assumed priors and weights: `pipeline/config.py` (copied into `data/runtime/config.json` by the export).

**Check the TypeScript port against Python:**

```
python -I -X utf8 pipeline/dump_reference.py --processed data/processed --out tests/reference.json
npm run parity
```

It compares routes, help lookups, search results and error messages. Scores and lengths match within rounding; ties (equal-probability places, equal-rank search hits) may come back in a different order.

`run_app.cmd` still starts the Python reference server on http://127.0.0.1:8765/.

## Data and credits

See `NOTICE`. Street and place data © OpenStreetMap contributors (ODbL; the derived data in `data/runtime/` is shared under the same licence). Places: Overture Maps Foundation. Tiles: OpenFreeMap. Icons: Google Material Icons (Apache 2.0).

## Known limits

- Only about 2% of places have confirmed opening hours; the rest use a category guess (`config.py`). The page shows the confirmed share for each route.
- Street lighting is almost absent from the data (under 1% of segments), so it is reported as unknown and not scored.
- Weights and priors are untuned guesses. There is no ground truth, and no study found shows route information reduces harm.
- Busy does not mean safe: documented incidents in markets like Karol Bagh are crowd-based, and an activity score rates crowded streets well.
- Police points come from map data and include duplicates and outposts, so the count overstates real stations.
- Start and end snap to the nearest junction, which can be 100 m or more away.

## Phone use

- **Help near me**: one-tap calls to 112 and 1091 (Delhi Police women's helpline), plus the three nearest police stations and hospitals as straight-line distances with Google Maps directions.
- **Share route**: opens the share sheet with a Google Maps walking link through three points of the route.
- **Install**: a manifest and service worker make the page installable. The GPS button and install need `https` or `localhost`, which Vercel provides.
