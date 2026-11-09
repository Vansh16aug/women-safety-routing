# M2 results: priors updated, route scorer built and checked

Run on 29 Oct 2026. Code: `pipeline/scoring.py` (scorer), `pipeline/test_scoring.py` (checks), settings in `pipeline/config.py`. Check output: `data/out/m2_checks.json`.

## 1. M1 re-run with the new priors

Changes applied (our assumptions, decided 29 Oct): hotel night prior 1.0 to 0.3; hospital night prior 1.0 to 0.5; a place labelled "hospital" whose name looks like a small facility (nursing home, clinic, maternity, dispensary, dental, eye, physio, diagnostic) is treated as a clinic.

| Measure | Before | After |
|---|---|---|
| Night open-probability from hotels | 6,141 | 1,859 |
| Night open-probability from hospitals | 3,105 | 1,155 |
| Places labelled hospital / clinic | 3,109 / 3,919 | 2,305 / 4,723 |
| Mean expected-open places per segment at night, Delhi | 0.31 | 0.21 |
| Same, Karol Bagh box | 1.55 | 0.81 |
| Segments with open help points (expected 0.5+ at night), Delhi / Karol Bagh | n/a | 43.1% / 88.0% |

Night activity mass is now led by hotels (1,859), then shops (1,561), restaurants (1,392), ATMs (1,364), hospitals (1,155). Hotels are still the largest single term.

## 2. The scorer

A route is a list of street pieces in walking order. `Scorer.score(pieces, band)` returns a 0-100 Night Activity Score, points per factor, the raw measurements, and a confidence block. Starting weights (all assumptions, in config): open places 25, gaps 15, help points 15, main-road share 15, transport 10, turns 10, mapped cameras 3 (total 93, scaled to 100). Lighting is reported, not scored.

How each factor is measured on a route: unique places within 40 m, expected-open count per km (saturating curve); share of route length inside stretches over 150 m without an open place (a place counts as open at probability 0.5 or higher); police, hospitals, pharmacies and clinics within 250 m, weighted by open probability and distance (police double weight); share of length on trunk, primary, secondary or tertiary roads; metro entrances and bus stops within 200 m, weighted by assumed running hours; turns over 45 degrees per km; mapped cameras within 30 m per km.

## 3. Checks (random routes of 500-1,500 m, Karol Bagh and an outer area near Najafgarh, 40 each)

| Check | Result |
|---|---|
| All scores within 0-100 | Pass (0.4 to 87.8) |
| Karol Bagh night score below day score on at least 90% of routes | Pass (100%) |
| Karol Bagh above outer Delhi at night (mean) | Pass (40.2 vs 18.8) |
| Karol Bagh above outer Delhi by day (mean) | Pass (68.1 vs 34.1) |
| Reversing a route gives the same score | Pass (55.4 vs 55.4) |
| With no open places, place and gap points go to zero | Pass |
| With no open places, score is lower | Pass (23.4 vs 82.5) |
| Routes that avoid low-activity segments usually score higher at night (70% threshold) | **Fail: 68% of 19 pairs, mean detour 1.15x** |

Mean scores by band: Karol Bagh day 68.1, evening 66.1, night 40.2; outer area day 34.1, evening 32.4, night 18.8.

The failed check is a narrow miss on a small sample (19 route pairs). The threshold was set before running and has not been changed to pass. The activity-avoiding route is chosen by segment-level night activity, while the route score also rewards main roads, fewer turns, help points and transport, so the two can disagree. I have not diagnosed which factor pulls the other way.

## 4. What the checks show about the design

- **The checks are plausibility tests, not validation.** Karol Bagh beating outer Delhi is expected from data density alone (OSM and Overture have far more places mapped there), so it does not show the score measures real activity.
- **Help points saturate in Karol Bagh.** The worked example scored 14.95 of 15 on help points at night. With many pharmacies and hospitals nearby, the factor stops separating routes there. The reference constant is probably too low.
- **Transport overcounts clustered entrances.** The worked example counted 13 metro objects within 200 m, which are mostly entrances and platform nodes of a few stations. Even at the 0.15 night weight this gave 7.6 of 10. Metro objects should be merged per station.
- **Almost everything is estimated.** In the worked example none of the 45 nearby places had confirmed hours. The confidence block says so (confirmed share 0.0, lighting unknown).
- **Cameras scored 0** on that route; mapped cameras are rare in Karol Bagh.

## 5. Proposed fixes before routing (M3)

1. Raise `HELP_REF` so help points stop saturating (for example 3.0), and re-check.
2. Merge metro objects within about 100 m into one station before counting.
3. Diagnose the failed check: print per-factor differences for the pairs where the activity route scored lower.
4. Re-run the checks and keep the 70% threshold.

## 6. Example (Karol Bagh, night, 1,131 m, about 14 minutes)

Score 59.4. Points: open places 10.4 of 25, gaps 6.0 of 15, help 15.0 of 15, main roads 12.9 of 15, transport 7.6 of 10, turns 3.4 of 10, cameras 0 of 3. Raw: 9.2 expected-open places (8.1 per km), longest stretch with no open place 287 m, 60% of the route inside such gaps, 86% on main roads, 6 turns, 0 mapped cameras, lighting unknown, 0% of the open-place mass from confirmed hours.
