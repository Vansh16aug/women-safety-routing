# M0 results: what public data exists for all of Delhi NCT

Run on 29 Oct 2026. Script: `pipeline/m0_measure.py`. Raw numbers: `data/out/m0_counts.json`. Everything here was measured by running the script; group definitions are ours (see notes).

Inputs:
- OpenStreetMap: openstreetmap.fr Delhi NCT extract, 27,024,222 bytes, md5 checked, data timestamp 2026-10-29 00:16 UTC. Already clipped to the Delhi boundary polygon.
- Overture Maps Places, release 2026-10-21.0, queried with DuckDB for the Delhi bounding box, then clipped to the boundary polygon (21.8 MB parquet saved locally).

## 1. Karol Bagh box reproduces the earlier numbers

Box: S 28.640, W 77.180, N 28.660, E 77.205.

| Item | Earlier (28 Oct) | This run | Note |
|---|---|---|---|
| OSM shops | 194 | 194 | match |
| OSM shops with hours | 10 | 10 | match |
| OSM amenities | 249 | 246 | ways counted by first node, so a few edge cases differ |
| OSM amenities with hours | 15 | 13 | same reason |
| OSM food, ATM/bank, lamps, cameras, metro, bus stops | 33, 33, 17, 7, 13+1, 27 | 33, 33, 17, 7, 14, 27 | match |
| OSM health/pharmacy | 20 | 19 | same reason |
| Overture places | 5,644 | 5,644 | match; groups also match (1,874 shop/retail, 299 food/drink, 307 health/pharmacy, 184 ATM/bank, 5 police, 2,975 other) |
| Walkable ways | 1,275 ways, 191.8 km (all highway ways) | 1,220 ways, 171.6 km (walkable classes only) | different definition |

## 2. All of Delhi: OpenStreetMap

| Layer | Count | Note |
|---|---|---|
| Walkable street network | 171,656 ways, about 26,252 km | main roads (trunk, primary, secondary, tertiary) about 4,800 km |
| Ways with a `lit` tag | 957 (754 yes, 196 no, 7 limited) | about 0.6% of walkable ways |
| Shops | 8,315 | 631 (7.6%) have `opening_hours` |
| Amenities | 16,944 | 1,108 (6.5%) have hours |
| Food (restaurant, cafe, fast food) | 2,794 | |
| Police | 203 | |
| Hospital, clinic, pharmacy, doctors | 1,631 | |
| ATM and bank | 1,611 | |
| Street lamps (mapped) | 1,461 | |
| Mapped cameras | 3,208 | 1,473 in the central box; only 7 in Karol Bagh |
| Metro stations and entrances | 736 | |
| Bus stops | 2,090 | |

## 3. All of Delhi: Overture Places

Total 225,438 places inside the boundary.

| Group (our rule) | All | Confidence 0.5+ | Confidence 0.7+ |
|---|---|---|---|
| Shop/retail | 43,862 | 27,663 | 13,835 |
| Food and drink | 16,286 | 11,677 | 6,204 |
| Health and pharmacy | 18,084 | 13,744 | 8,421 |
| ATM and bank | 7,648 | 7,378 | 6,855 |
| Police | 418 | 382 | 145 |
| Other (services, lodging, education, etc.) | 139,140 | 89,373 | 45,874 |

Confidence histogram: under 0.3: 39,514; 0.3-0.6: 77,632; 0.6-0.99: 107,031; exactly 1.0: 1,261. First-listed source: Meta 184,652; Microsoft 29,785; Foursquare 7,233; AllThePlaces 2,249; DAC 988; others under 300.
There is still no opening-hours field in Overture.

## 4. Comparison and what it means

- Overture shop/retail at confidence 0.5+ is 27,663 versus 8,315 OSM shops: about 3.3 times as many Delhi-wide. In Karol Bagh the gap is wider (1,126 versus 194, about 5.8 times).
- On a roughly 2 km grid (322 cells with shop data), 73 cells have 20+ Overture shops and fewer than 5 OSM shops. In those cells Overture holds 5,455 shops and OSM holds 73. OSM is nearly empty in about a fifth of the cells that have any shop data.
- Hours are scarce everywhere, not just in Karol Bagh: 7.6% of OSM shops and 6.5% of amenities. Estimated hours will drive the score across all of Delhi.
- Lighting data is thin Delhi-wide (0.6% of walkable ways have a `lit` tag), so lighting will mostly be inferred from road class.
- Mapped cameras are very uneven (3,208 Delhi-wide, 1,473 in the central box, 7 in Karol Bagh). A camera term in the score would favour areas that are heavily mapped, so keep its weight small and say so on screen.

## 5. Caveats

- Overture quality is unmeasured: junk and stale records exist (seen earlier in Karol Bagh). The confidence field is a weak filter (most records sit at 0.3-0.6).
- OSM counts for ways use the first node's location; Overture counts use the bounding-box point. Small edge differences are expected.
- Group definitions are ours (see `pipeline/m0_measure.py`): Overture groups use taxonomy fields; OSM groups use tags.
- Nothing here says whether a shop is open at night.

## 6. Files created

- `data/raw/delhi.osm.pbf` (27 MB), `delhi.poly`, `delhi.osm.pbf.md5`, `delhi.state.txt`
- `data/raw/overture_places_delhi_bbox.parquet` (21.8 MB; Delhi bounding box, not clipped to the polygon in the file)
- `data/out/m0_counts.json`, `data/out/m0_run.log`
- `pipeline/m0_measure.py`
- `.venv/` (duckdb, osmium, numpy, shapely, pandas, pyarrow)
