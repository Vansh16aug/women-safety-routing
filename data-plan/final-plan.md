# Delhi Night Activity Map: final plan (no survey, available data only)

Written 29 Oct 2026. Replaces the survey-based approach in `karol-bagh-data-record.md`; that record stays as the data inventory. Decisions made by the developer: scope is all of Delhi NCT first, India later (29 Oct 2026; Karol Bagh stays as the pilot and test area, and the counts below were measured there only); no manual survey; only data that is available; cameras count inside the activity score; the score is labelled activity, not safety.

Status tags: VERIFIED = we opened or measured it. RESEARCHED = from research notes (secondary or snippet). ASSUMPTION = our own design choice, to be tuned.

## 1. What we build

A static web page for Delhi NCT. The user taps a start and a destination anywhere in Delhi, picks a time, and sees 2-3 walking routes (fastest plus alternatives). Each route shows a **Night Activity Score (0-100)**, a breakdown, and a **data confidence** line. Wording on screen: "Activity estimate, not a safety rating."

No accounts, no server, no location sent anywhere. Routing runs in the browser.

## 2. Data we use (all public, all free)

| # | Layer | Source | What we take | Status |
|---|---|---|---|---|
| D1 | Street network and land use | OpenStreetMap (daily Delhi extract clipped to our polygon, or Overpass for the area) | Walkable ways, road class, lit tags, footway/sidewalk, underpasses, parks and industrial land | VERIFIED: 1,275 ways, about 192 km in our box |
| D2 | Places that exist | Overture Maps Places, release 2026-10-21.0 (DuckDB over the public S3 files) | Shops, food, pharmacies, ATMs, banks, health, police; keep confidence 0.5 and above | VERIFIED: 5,644 places in the box, 1,126 shop/retail at confidence 0.5+ |
| D3 | Places (second source and hours) | OpenStreetMap POIs | Same categories, plus `opening_hours` where tagged | VERIFIED: 441 features, about 25 with hours |
| D4 | Help points | OSM and Overture | Police, hospitals, clinics, pharmacies | VERIFIED: OSM 2 police, 20 health; Overture 5 police, 307 health |
| D5 | Transport | OSM (metro entrances, bus stops) | Locations; metro running hours as a constant to verify against the DMRC timings page | OSM VERIFIED: 14 metro objects, 27 bus stops; hours RESEARCHED only |
| D6 | Mapped cameras | OSM `man_made=surveillance` | Locations | VERIFIED: 7 mapped (almost certainly incomplete) |
| D7 | Street lamps | OSM lamps and `lit`; optional Mapillary light detections | Lamp points, lit flags | OSM VERIFIED: 17 lamps, `lit` on 2 of 1,275 ways. Mapillary needs a free developer token the developer registers; coverage in Delhi is thin per the reference project's README |
| D8 | Map display | OpenFreeMap tiles with MapLibre | Base map | RESEARCHED (reference project README); check terms before launch |

Dropped: manual survey, camera feeds, Google Places and Maps data, Geoapify (it is only OSM), government registries and RTI (no public hours exist; the RTI research did not finish).

## 3. Handling opening hours without a survey

No open dataset has hours. Every place gets one of three states, and the UI shows the counts:

- **Confirmed:** OSM `opening_hours` parsed for the passing time (about 25 places).
- **Estimated:** no hours, so use a category prior for the time band (ASSUMPTION). Starting values, fraction likely open in day / evening / night, to be kept in a config file and tuned:
  - pharmacy 1.0 / 0.9 / 0.15; hospital 1.0 / 1.0 / 1.0; ATM 1.0 / 1.0 / 0.5; bank 1.0 / 0.1 / 0.0
  - restaurant, cafe, fast food 0.9 / 1.0 / 0.2; clothing or general shop 1.0 / 0.8 / 0.05; police 1.0 / 1.0 / 1.0
  - The reference project (Delhi Safe Routes) uses a table of this shape. Our numbers are our own guesses, not copied.
- **Unknown:** category not in the table, so it adds nothing to the score.

Closing day: not documented; sources conflict (Monday, Tuesday, or none). Not modelled; noted in the UI.

## 4. Score factors (starting weights are ASSUMPTIONS; config file, not code)

Per route, at the user's chosen time band (day 6-18, evening 18-22, night 22-6, same banding as the reference project):

| Factor | How it is computed | Starting max points |
|---|---|---|
| F1 Open places along route | Sum of open-probability over places within 40 m of the route (distance-weighted); confirmed counts fully, estimated at its prior | 25 |
| F2 Gaps between open places | Longest stretch with no expected-open place, and number of gaps over 150 m | 15 |
| F3 Help points | Distance-weighted police, hospitals, pharmacies within 250 m | 15 |
| F4 Main-road share | Fraction of length on primary, secondary, tertiary | 15 |
| F5 Transport | Metro entrances and bus stops within 200 m; metro counts only inside running hours | 10 |
| F6 Fewer turns | Turns over a threshold angle, per km | 10 |
| F7 Cameras (mapped) | Count within 30 m, small weight, raw count shown too | included in F1 pool, about 3 |
| F8 Lighting | `lit` tags and lamps within 20 m; otherwise a road-class prior; Mapillary if enabled. Shown as "observed" or "inferred" | feeds a dark-stretch warning, not points in v0 |

Output: score, per-factor breakdown, longest dark/empty stretch, counts of confirmed / estimated / unknown places, and the detour in minutes versus the fastest route.

## 5. Build steps

| Step | Work | Done when |
|---|---|---|
| M0 | Pull and measure for all of Delhi NCT: OSM extract; Overture places via DuckDB; counts by category and by area; confirm the Karol Bagh numbers still match section 2 | Delhi-wide counts table written; Karol Bagh numbers reproduced |
| M1 | Segment table: snap places, help points, cameras, transport to segments; compute static features | Every segment has features, no orphans |
| M2 | Scoring module and config; unit tests with hand-made routes | Scores reproducible and explainable |
| M3 | Routing: precompute a small graph JSON; A* in the browser; alternatives by penalising high-risk or low-activity edges | 2-3 distinct routes between any two points |
| M4 | UI: MapLibre map, tap start and end, time picker, breakdown panel, confidence line, attribution | Works on a phone browser |
| M5 | Sanity checks: compare routes on a few well-known pairs (metro exit to Gaffar Market via main road versus lane) and see whether the ranking is plausible. No ground truth exists, so this is review, not validation | Notes written; weights adjusted once |
| M6 | Static deploy (GitHub Pages or similar), licence file, credits | Public link |

## 6. Licences and obligations

- OSM: credit "© OpenStreetMap contributors"; publishing a segment dataset built from OSM geometry may trigger ODbL share-alike (reading from the researchers' background knowledge; check before publishing).
- Overture Places: per source (CDLA Permissive 2.0 for Meta and Microsoft, Apache 2.0 for Foursquare, CC0 for AllThePlaces per the researcher); keep a NOTICE file. Not legal advice.
- Mapillary: CC BY-SA 4.0 attribution if used.
- Do not copy code from Delhi Safe Routes: its repo states no licence. Ideas and the published README approach are fine to learn from.
- No accounts, no tracking, no analytics; DPDP phases in on 13 Nov 2026 and 13 May 2027.

## 7. Accepted weak spots (and how the UI says so)

- Hours are mostly estimated, so F1, F2 and F5 are estimates; the confidence line shows the confirmed share.
- OSM lighting and cameras are nearly empty; Overture has junk at low confidence; all weights are uncalibrated guesses.
- Busy does not mean safe. The documented Karol Bagh incidents are crowd-based (following, groping, snatching), and an activity score rates busy lanes well. This is why the score is labelled activity and why no route is called safe.
- No study found shows route information reduces victimisation.

## 8. Open decisions

- P1: Time resolution: three bands (same as the reference project) or hourly profiles. Recommendation: three bands first.
- P2: Boundary: the Delhi NCT boundary (the openstreetmap.fr Delhi extract is already clipped to it, per the reference project). Karol Bagh stays as the pilot and test area.
- P3: Overture confidence cutoff (starting at 0.5) and a quick junk check on a sample.
- P4: Whether to register a Mapillary token for lamp detections (free; the developer has to sign up).
- P5: Starting weights and priors above: accept as-is or adjust.

## 9. Next step

M0: pull the OSM and Overture data for all of Delhi NCT, reproduce the Karol Bagh counts, and write the first segment table.

## 10. Scope change to all of Delhi (29 Oct 2026)

What changes:
- Data volume: the reference project's Delhi graph is about 23,000 km of streets, 256k junctions and a 5.7 MB file that runs in the browser (RESEARCHED, its README). Our graph should be a similar size, so browser routing is still plausible; confirm in M3.
- Overture Places for all of Delhi: total unknown until M0. We only measured Karol Bagh (5,644 places in a 2.2 x 2.8 km box, central Delhi). Coverage and quality outside the centre are untested.
- Uneven data: the reference project reports fewer mapped shops in outer Delhi (Narela, Bawana, Najafgarh), so scores there lean on road type. Expect the same. Add a per-area data-confidence layer so the UI says when a route passes through thin data.
- Priors and weights are untuned everywhere. A prior that fits a central market (many shops open late) will not fit an outer-Delhi industrial road or a residential colony.
- Karol Bagh becomes the benchmark area: it is the only place where we already know the counts, so we check outputs there first.

Risk of this scope: a Delhi-wide, OSM-based, time-band route app already exists (Delhi Safe Routes, one month old, no stated licence). Our plan differs by adding Overture for place existence, a gap-between-open-places factor, confirmed/estimated/unknown labelling and a data-confidence line, not by coverage.

India later: the pipeline should keep the area (extract URL, boundary, constants such as map centre, metro hours and emergency numbers) in config, not hard-coded, so another city is a config change.
