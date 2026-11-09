# M1 results: street-segment table for Delhi NCT

Run on 29 Oct 2026. Script: `pipeline/m1_segments.py`; settings and all assumed priors: `pipeline/config.py`. Outputs in `data/processed/`. Everything below was measured by running the script; priors and radii are our assumptions.

## What was built

| File | Contents |
|---|---|
| `segments.parquet` | 360,730 street segments between junctions, 23,711 km. Per segment: way id, highway class, main-road flag, `lit` tag, tunnel/bridge/alley/sidewalk/crossing flags, name, length, midpoint, geometry (WKT), places within 40 m, expected-open count per band, confirmed count, lamps within 20 m, cameras within 30 m, metro and bus stops within 200 m, nearest police and nearest health point within 250 m |
| `nodes.parquet` | 262,440 junction and end nodes |
| `places.parquet` | 77,739 places (17,320 OSM, 60,419 Overture) with kind, source, hours text, open probability per band, and status (confirmed or estimated) |
| `lamps`, `cctv`, `metro`, `bus_stops` parquet | OSM point layers |
| `m1_summary.json`, `m1_run.log` | Summary numbers and run log |

Build notes: 66,068 Overture places (confidence 0.5 or higher, inside the Delhi boundary) mapped to a kind we model, out of 150,214; 5,649 of those were dropped as likely duplicates of OSM places (same family within 10 m, or within 30 m with a shared name word). Hours handling: parsed from OSM `opening_hours` when it has a time range (weekdays ignored), otherwise a category prior.

## Results

| Measure | Delhi | Karol Bagh box | Main roads (Delhi) | Residential (Delhi) |
|---|---|---|---|---|
| Segments | 360,730 | 2,669 | 51,443 | 241,950 |
| Km | 23,711 | 153.3 | 4,880 | 13,822 |
| Segments with any place within 40 m | 40.8% | 86.8% | 56.2% | 37.9% |
| Mean expected-open places per segment, day / evening / night | 1.48 / 1.23 / 0.31 | 6.34 / 5.22 / 1.55 | 2.55 / 2.10 / 0.60 | 1.06 / 0.87 / 0.22 |
| Share of nearby places with confirmed hours | 2.4% | 1.0% | 2.4% | 1.3% |
| Segments with a lamp within 20 m | 0.7% | 1.9% | 1.0% | 0.2% |
| Segments with a `lit` tag | 0.8% | 0.1% | 1.6% | 0.2% |
| Segments with a camera within 30 m | 2.3% | 1.1% | 6.1% | 0.6% |
| Segments within 250 m of police | 11.7% | 9.8% | 16.7% | 9.1% |
| Segments within 250 m of a hospital, clinic or pharmacy | 65.0% | 97.4% | 66.1% | 66.9% |
| Segments with a metro entrance within 200 m | 6.4% | 9.3% | 11.3% | 3.4% |
| Segments with a bus stop within 200 m | 17.6% | 34.8% | 34.5% | 11.3% |

Places overall: 76,272 estimated, 1,467 confirmed (1.9%).

## What stands out

1. **The score will rest almost entirely on estimates.** Only 1.9% of places have parseable hours. Every night figure above is mostly our priors.
2. **The night signal is dominated by two assumptions.** Total night open-probability mass by kind: hotels 6,141, hospitals 3,105, shops 1,561, restaurants 1,392, ATMs 1,364. In Karol Bagh the top-scoring night segments are Deshbandhu Gupta Road, Tank Road, and Bangali Pooja Road: market roads, but also hotel-dense. Hotels and "hospitals" are set to 1.0 at night, and Overture's hospital kind probably includes small nursing homes. So "night activity" is currently mostly "hotels and hospitals nearby", not eyes on the street. These priors need your decision before scoring (decision P5).
3. **Lighting is effectively unknown.** Only 0.7% of Delhi segments have a mapped lamp within 20 m and 0.8% have a `lit` tag. Lighting must come from road class or stay "unknown".
4. **Cameras are sparse and uneven.** 2.3% of segments have a mapped camera within 30 m (1.1% in Karol Bagh, 6.1% on main roads). A camera term mostly separates mapped areas from unmapped ones.
5. **Health points barely discriminate.** 65% of segments are within 250 m of a hospital, clinic or pharmacy, and 97% in Karol Bagh. The help factor must be time-aware (open hospitals and pharmacies only) and probably weight police and hospitals above clinics.
6. **Most of Delhi's street length has no place nearby.** 59% of length has no place within 40 m, which is mainly residential interiors and outer areas.

## Checks and caveats

- Karol Bagh numbers (OSM counts, Overture places) matched M0.
- Walkable ways: 149,285 here versus 171,656 in M0, and 23,711 km versus 26,252 km. M1 excludes ways tagged `access=no` or `private` and ways with fewer than two located nodes. I have not verified how much of the gap each rule explains.
- Segment lengths: median 42 m, 99th percentile 408 m, 470 segments over 1 km (longest 12.6 km, between junctions), 2 segments rounded to 0 m.
- Hours parsing ignores weekdays and exceptions. Place coordinates for OSM building-style places use the way's first node.
- No ground truth exists for any of this. Overture junk rate is still unmeasured.

## Decisions needed before M2 (scoring)

- P5: priors. Proposed changes, still our guesses: lower the night prior for hotels (for example 0.3) and hospitals (for example 0.5 for small or unnamed ones, or treat only a subset as help points), and keep restaurants, ATMs, pharmacies and shops as they are. Or accept the current values.
- Help-point factor: count only police, and hospitals and pharmacies weighted by their open probability.
- Unknown lighting: show "inferred from road class" and leave it out of the score, as planned.
