# M3-M5 results: routing server, web page, checks

Built and tested on 29 Oct 2026. Run with `run_app.cmd`; see `README.md`.

## What exists

- `pipeline/server.py`: loads the M1 segment table into a graph (353,432 segments, 256,476 junctions in the largest connected piece). For five detour settings it finds the cheapest path where a segment costs length x (1 + alpha x penalty); the penalty is higher on low-activity and non-main-road segments for the chosen time band. Every candidate is scored with the full route scorer. The page gets the fastest route plus the best-scoring routes within a 1.25x and a 1.6x length limit, and an alternative is shown only if it scores at least 2 points above the fastest route (otherwise the page says none does).
- `web/index.html`: MapLibre map on OpenFreeMap tiles; click start and end, pick a time, see up to three routes with score, per-factor bars, facts, and a data-confidence line; the disclaimer and credits are on screen.
- Delhi-wide, hour-aware: three time bands (day 6-18, evening 18-22, night 22-6).

## Checks

M2 route scorer (`data/out/m2_checks.json`): 8 of 8 passed after the fixes (help-point constant raised from 1.0 to 3.0, metro objects within 100 m merged into one station). The check "routes that avoid low-activity segments usually score higher at night" passed at 74% of 19 pairs against a 70% threshold (it failed at 68% before the fixes; the threshold was not changed). In the pairs where the activity route scored lower, it lost points on turns (average -3.4) and main roads (-1.8).

M5 server checks (`data/out/m5_api_checks.json`): 10 of 10 passed.
- 60 random Delhi trips of 0.8-6 km at 11:00, 19:00 and 23:00: all returned routes; response median 0.33 s, maximum 0.48 s.
- Mean fastest-route score by hour: 58.5 at 11:00, 54.6 at 19:00, 34.4 at 23:00.
- An alternative was shown for 85% of trips; mean score gain 14.7 points, mean extra walk 5.2 minutes (maximum 19.5).
- Karol Bagh: on 15 random pairs the fastest route scored lower at 23:00 than at 12:00 on every pair (mean 76.9 by day, 42.9 at night).
- Clear errors for same start and end, a point outside Delhi, and a trip over 15 km; an hour above 23 wraps.
- Browser test (Chrome): the page loaded, accepted two map clicks, returned routes, drew them with the selected route highlighted, and showed the cards and confidence line.

## How to read these results

- The checks are plausibility tests. There is no ground truth, so none of them shows that the score tracks real activity or safety.
- Alternatives are chosen to maximise the scorer's own score, so the 14.7-point average gain is by construction, not evidence that those routes are better.
- Karol Bagh scoring far above outer Delhi follows partly from how much of each area is mapped.
- Some Karol Bagh routes had a "Fastest" and a near-identical "Balanced" route; the 2-point rule now hides those.

## UI redesign (29 Oct 2026)

The first page was replaced after the developer found it confusing. It was rebuilt from `BRD.md` and `DESIGN.md`: a three-step flow (location, destination, routes), local place search, a dark "dusk streetlight" look, a bottom sheet on phones, and a left card on desktop.
- Tested in Chrome on the real server: start screen, "Use my location" (using the `?loc=` test point), destination search with keyboard selection, results with two routes, and the one-route case with its note. Also tested at phone width through a temporary 390 px frame (removed afterwards), including the collapse handle.
- Console: no errors; two warnings (a missing texture in the map style, and "cannot fit within bounds" from the small test frame, now capped in the padding code).
- API checks re-run after the change: 10 of 10 passed (median 0.51 s now that each returned route also carries its map data).
- Not tested: the browser's real location permission prompt (the test used the `?loc=` stand-in), an actual phone, screen readers, and keyboard-only use beyond the search box.

## Not done

- No public deployment. The app is a local Python server, not a static site, because routing and scoring run in Python; the earlier plan for browser routing was not built. Publishing would need either hosting a small server or porting the router and scorer to JavaScript (graph and places file size not measured).
- No walking-speed or time-of-day refinement beyond three bands; the time picker only chooses the band.
- Start and end snap to the nearest junction (up to 83 m in the random tests); the page does not draw a connector.
- Metro running hours and the category priors are assumptions, not checked against DMRC or any survey.
- No tests run on a phone browser; only desktop Chrome.
