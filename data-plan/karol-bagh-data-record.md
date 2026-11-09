# Karol Bagh route-scoring: data record

Status: planning record, written 28 Oct 2026. Nothing below has been fetched into a dataset yet except the OSM counts in section 4.
Rule for this file: every row says where the fact came from. `VERIFIED` = we queried or opened it. `RESEARCHED` = reported in the research notes (secondary or snippet). `CANDIDATE` = idea not yet checked. `NOT AVAILABLE` = researched and not public.

Related research (same project folder):
- `reports/Karol Bagh women safety routing.md` (problem, existing solutions, data layers, legal)
- `research_notes/Karol Bagh women safety routing/` (the four raw notes)
- `research_notes/Public camera feeds Karol Bagh/` (why live camera feeds are out)

## 1. What we are building (scope)

- Area: Karol Bagh only (own polygon, see decision D1).
- Mode: walking. User picks start and destination inside the area and a travel time.
- Output: 2-3 candidate routes (fastest, plus alternatives), each with a score and a plain-language breakdown.
- Name of the score: **Night Activity Score** (0-100), not "safety score". The reel's own UI labels it "Activity points, not a safety rating". We keep that wording, because no study found shows route information reduces victimisation, and the documented Karol Bagh incidents (following, groping, snatching in crowds) happen in busy places that an activity score would rate well.
- No live camera video. We only count mapped camera locations near a route.

## 2. Score factors: what each one measures and how it is computed

All distances and weights are placeholders until we tune them (decisions D2, D3). The reel showed six factors; the weights below are as far as they could be read from small text, so treat them as a starting point, not as the app's real values.

| # | Factor | What we count or measure on a route | Time-aware? | Starting max points |
|---|---|---|---|---|
| F1 | Open places along route | Number of shops, food places, pharmacies etc. within B metres of the route that are open when the user passes them | Yes | about 25 |
| F2 | Gaps between open places | Longest stretch (metres) with no open place; and count of gaps over G metres | Yes | about 15 |
| F3 | Help points nearby | Open police stations, hospitals, clinics, pharmacies within H metres of the route (distance-weighted) | Partly (hospitals 24h if tagged) | about 15 |
| F4 | Main-road share | Fraction of route length on primary, secondary, tertiary roads | No | about 15 |
| F5 | Transport nearby and running | Metro entrances and bus stops near the route; metro counts only if a train is running at passing time | Yes | about 10 |
| F6 | Fewer turns | Number of direction changes (turns over a threshold angle) per km | No | about 10 |
| F7 | Mapped cameras | Count of mapped camera locations within C metres of the route | No | small share, weight TBD (D4 resolved 28 Oct 2026: counted inside the activity score, labelled as activity, not safety) |
| F8 | Lighting | Share of route length on segments with lamps or `lit=yes`, from audit or imagery | Night only | not in v0 score; show as "observed / unknown" |
| F9 | Detour penalty | Extra minutes versus fastest route; routes above a cap are dropped | No | filter, not points |

Why F7 stays small and labelled: mapped cameras are locations, not working cameras. Delhi audits reported only 55-68% of cameras working (RESEARCHED, snippet in the camera notes). Camera presence is also not the same as safety. Decision (28 Oct 2026): cameras count toward the Night Activity Score as an activity and visibility signal, with a small weight, and the UI says so and shows the raw camera count in the breakdown.

Unknown hours rule: a place with no hours data is `unknown`, not `closed` and not `open`. It adds nothing to F1 and is displayed as "hours unknown". This matters a lot because only about 5% of Karol Bagh shops carry hours in OSM (section 4).

## 3. Data layer register

Columns: what we need, where it comes from, how to get it, licence, what we know about Karol Bagh coverage, status, how it is used.

| ID | Layer | Fields we need | Source | Access | Licence and duty | Karol Bagh coverage (known) | Status | Used in |
|---|---|---|---|---|---|---|---|---|
| L1 | Street graph | way id, highway class, name, oneway, foot access, sidewalk, surface, length, geometry | OpenStreetMap | Overpass for a small area; or Geofabrik India extract, clipped | ODbL: credit "© OpenStreetMap contributors"; share-alike on published derived databases | 1,275 ways, about 191.8 km in our box | VERIFIED (researcher's own Overpass count, 28 Oct 2026) | routing, F4, F6, F9 |
| L2 | Places that can be open (shops, food, pharmacies, ATMs, banks) | type, name, lat/lon, opening_hours (raw string), where the hours came from, date checked | OpenStreetMap; plus CANDIDATE places datasets: Geoapify Places, Overture Maps Places, Foursquare open places; plus own field survey | Overpass `nwr["shop"]`, `nwr["amenity"]`; candidates need a terms and coverage check | OSM: ODbL. Candidates: licence unchecked | 194 shops, 249 amenities, 33 restaurants/cafes/fast food, 33 ATMs/banks (all in box) | OSM counts VERIFIED; candidates CANDIDATE | F1, F2 |
| L3 | Opening hours | parsed weekly schedule per place; `unknown` state | OSM `opening_hours` tag; candidate datasets; own survey | parse with an opening-hours library | as L2 | only 10 of 194 shops and 15 of 249 amenities have hours | VERIFIED (count 28 Oct 2026); this is the weakest layer | F1, F2, F5 |
| L4 | Help points | type (police, hospital, clinic, pharmacy), lat/lon, 24h flag | OSM `amenity=police`, `hospital`, `clinic`, `pharmacy`, `doctors` | Overpass | ODbL | 2 police, 20 hospital/clinic/pharmacy/doctors | VERIFIED (28 Oct 2026) | F3 |
| L5 | Cameras (mapped locations) | lat/lon, camera type if tagged | OSM `man_made=surveillance`; own field survey | Overpass | ODbL | 7 mapped | VERIFIED (28 Oct 2026); almost certainly incomplete | F7 |
| L6 | Metro | station or entrance lat/lon; first and last train times by direction | OSM `railway=station`, `subway_entrance`; DMRC timings page (terms unchecked); DMRC data on the Delhi open transit portal | Overpass; web page; portal download | OSM: ODbL; DMRC and portal: unchecked | 14 station or entrance objects in box | OSM VERIFIED; train times RESEARCHED/not fetched | F5 |
| L7 | Bus stops | stop lat/lon; routes serving it; night service if known | OSM `highway=bus_stop`; Delhi Open Transit Data static GTFS | Overpass; portal download (terms page not opened) | OSM: ODbL; portal: no licence named | 27 bus stops in OSM; GTFS not checked | OSM VERIFIED; GTFS RESEARCHED | F5 |
| L8 | Lighting | lamp lat/lon; `lit` on ways; audit rating by segment and time band | OSM `highway=street_lamp`, `lit`; Mapillary imagery detections (coverage unknown); own field audit | Overpass; Mapillary API; survey forms | OSM ODbL; Mapillary images CC BY-SA, detections licence unclear | 17 lamps; `lit` on 2 of 1,275 ways | VERIFIED (28 Oct 2026, `lit` count from the earlier researcher; our own `lit` query hit a server error and was not re-run) | F8 |
| L9 | Time context | sunset and twilight times; weekday; holidays; weekly market closing day (not known for Karol Bagh) | computed locally | astronomy library | none | citywide | CANDIDATE | time bands, F1, F2, F5 |
| L10 | Footfall or "busyness" | people per hour per street | NOT AVAILABLE as open data. Earlier research found no open station-wise metro ridership and no official Google popular-times API | n/a | n/a | none | NOT AVAILABLE | replaced by proxies: F1, F2, F5 |
| L11 | Crime or harassment by street | incidents with location | NOT AVAILABLE. NCRB is city or district level only; station-level crime appears only in NGO reports built on RTI; Safecity and Safetipin feeds not confirmed open | n/a | n/a | none | NOT AVAILABLE | context only, not in score |
| L12 | Own field observations | per segment and time band: lamps working, active frontage, obstructions, shops open/closed with hours seen, cameras seen, rater, date | our own walk audit (Kobo/ODK or similar) | field survey | our choice; keep separate from OSM | none yet | NOT COLLECTED | fills L2, L3, L5, L8 gaps |
| L13 | Area boundary | polygon of the Karol Bagh area we cover | our own polygon; official ward or zone boundaries not confirmed | draw from OSM and local knowledge | n/a | the box spills into Paharganj, Patel Nagar, Rajendra Nagar edges | CANDIDATE | clipping, UI limits |

Box used for all counts: south 28.640, west 77.180, north 28.660, east 77.205 (about 2.2 km by 2.8 km). It is a convenience box, not the official boundary.

## 3b. Places and opening-hours sources, researched (28 Oct 2026)

Raw notes: `research_notes/Places and opening hours data sources/` (three files). This section supersedes the "CANDIDATE" entries for L2 and L3 above. Overture figures were measured by a researcher with DuckDB against the public release; everything else is from documentation, snippets or searches, as labelled.

| Source | What it is | Karol Bagh box coverage | Opening hours? | Licence and storage | Verdict |
|---|---|---|---|---|---|
| OpenStreetMap | Community map | 441 shop/amenity features; 25 with `opening_hours` (re-run by researcher matches our 10 + 15) | Yes, but about 5% of features | ODbL, share-alike on derived databases | Only open source of hours; far too sparse alone |
| Overture Maps Places, release `2026-10-21.0` (measured) | Merged places from Meta, Microsoft, Foursquare, AllThePlaces and others | **5,644 places.** Shop/retail 1,874 (1,126 at confidence 0.5+); food and drink 299 (221); health/pharmacy 307 (239); ATM/bank 184 (179); police 5; other categories 2,975 | **No hours column.** `operating_status` set for 13 of 5,644 | Per source: CDLA Permissive 2.0 (Meta, Microsoft), Apache 2.0 (Foursquare), CC0 (AllThePlaces). No share-alike on Places. Keep a NOTICE file crediting sources. Read from docs, not full licence texts; not legal advice | Best source for "what places exist". Quality uneven: confidence mostly 0.3-0.6, only 317 at 1.0, clear junk seen (a foreign phone number on a Karol Bagh place). 72% of records carry an October 2026 source timestamp, which is a snapshot time, not proof the shop is open |
| Foursquare Open Source Places | Open places release | Not queried (Hugging Face repo gated, anonymous download returned 401) | No hours column in the open schema; has `date_closed` and `date_refreshed` | Apache 2.0, access gated | Not needed separately. 114 Foursquare-sourced places are already inside Overture in the box, mostly updated in 2025 |
| Geoapify Places | API over OpenStreetMap data (docs: "We use the OpenStreetMap as the data source") | Same as OSM | Place Details returns `opening_hours` only if present in OSM; one extra call per place | Free tier 3,000 credits/day, 5 requests/s; docs allow storing results "with no limits", terms of service silent; OSM attribution always, Geoapify attribution on free plan; walk routing exists but no custom weighting, no lighting | A convenient wrapper over OSM, adds no new hours. The reel's app probably had the same limits (inference) |
| Google Places | Commercial | n/a | Yes (Enterprise SKU) | Caching banned except place IDs; must show on a Google map | Ruled out |
| Ola Maps | Indian provider | not measured | not confirmed | pricing page read: 100,000 free calls per API per month from 1 Sep 2026; storage terms not found | Worth a closer look if we want an API |
| Mappls (MapmyIndia) | Indian provider | not measured | no hours found | no pricing or storage terms found | Unverified |
| Mapbox, Nominatim, Yelp | Various | n/a | Mapbox hours sales-gated | Mapbox forbids permanent storage; Nominatim forbids downloading all POIs and caps at 1 request/s; Yelp India coverage likely poor | Ruled out for this use |
| HERE, TomTom, Bing, LocationIQ, Photon, Justdial, Bhuvan | Various | not checked | not checked | pages 404'd or not fetched | Open gap |
| Indian registries (FSSAI FoSCoS, GST, Udyam, MCD licences) | Official business records | none give shop location plus hours (negative search result, portals not inspected one by one) | no | FSSAI verifies by licence number; GST needs a known GSTIN and reportedly bars scraping (secondary); Udyam district lists exist on data.gov.in under GODL-India with address and PIN but no hours (Delhi rows not verified; privacy risk for sole proprietors) | Not usable for hours |

**Closing days and market hours are not documented officially.** A snippet says a Delhi notification dated 7 Aug 2025 suspended the opening-hours, weekly-closing-day and women's-work-hours sections for most shops, with conditions; a Dec 2025 news report says shops may run 24 hours. Neither was checked against the notification text. Blogs disagree on the Karol Bagh closing day (Monday, Tuesday, or none), and give market hours from 09:00 to 23:00, 10:30 to 21:00, 10:00 to 21:00 and 11:00 to 22:00. Do not hard-code a closing day. Survey on both Monday and Tuesday.

**Field collection** (from the registries and field-collection notes, partly snippets): StreetComplete has an opening-hours quest. Useful OSM tags are `opening_hours`, `check_date:opening_hours`, `source:opening_hours=survey` and `opening_hours:signed=no`; `lit` goes on ways and `highway=street_lamp` on nodes. OSM has no standard tag for "seen open at 22:00", so keep timestamped observations in our private audit table and publish only regular hours. OSM import rules require ODbL-compatible data and owner permission, so do not copy hours from Google, Justdial, Zomato or similar. OSM Delhi runs regular market mapping parties (No. 27 on 8 Mar 2026), announced on the talk-in list and osmcal.org.

**What this means for the score:**
1. Existence: use Overture (5,644 places) plus OSM (441) to know which places are there, filtered by a confidence threshold, with a sample check for junk. Overture and OSM overlap only roughly (108 of 441 OSM features matched an Overture place by name within 50 m, without transliteration, so true overlap is higher).
2. Hours: **no open dataset has them.** Hours come from OSM (about 25 features) and our own survey. Where hours are unknown, use a category prior (pharmacy, hospital, ATM, food and drink are more likely to be open at night than clothing shops), shown as "estimated", never as "confirmed open".
3. The time-aware factors (F1, F2, F5) cannot be accurate until the survey is done. The score should display how many places in the breakdown are confirmed, estimated, or unknown.

## 4. Measured OSM counts (28 Oct 2026, Overpass API)

Our own query. Re-run before relying on them. One further query (`way["highway"]["lit"]`) failed with HTTP 502 and was not repeated.

| Query (inside the box) | Total | Nodes | Ways |
|---|---|---|---|
| `nwr["shop"]` | 194 | 193 | 1 |
| `nwr["shop"]["opening_hours"]` | 10 | 9 | 1 |
| `nwr["amenity"]` | 249 | 198 | 51 |
| `nwr["amenity"]["opening_hours"]` | 15 | 11 | 4 |
| `nwr["amenity"~"^(restaurant|cafe|fast_food)$"]` | 33 | 32 | 1 |
| `nwr["amenity"="police"]` | 2 | 2 | 0 |
| `nwr["amenity"~"^(hospital|clinic|pharmacy|doctors)$"]` | 20 | 18 | 2 |
| `nwr["highway"="street_lamp"]` | 17 | 17 | 0 |
| `nwr["man_made"="surveillance"]` | 7 | 7 | 0 |
| `nwr["railway"~"^(station|subway_entrance)$"]` | 14 | 13 | 1 |
| `nwr["highway"="bus_stop"]` | 27 | 27 | 0 |
| `nwr["amenity"~"^(atm|bank)$"]` | 33 | 32 | 1 |

What this tells us (our reading, not a measured fact): 194 shops looks low for a major market area, so OSM likely undercounts shops, and hours exist on about 5% of them. The graph, help points, metro and bus stops look usable. Hours, lamps and cameras are the gaps.

## 5. How the layers are used (computation outline)

1. Build the walking graph from L1, clipped to the area polygon (L13).
2. Snap every place, help point, camera, metro entrance and bus stop to the nearest graph edge, keeping the offset distance.
3. For a candidate route and a travel time, walk along the route and interpolate the time the user passes each point (walking speed assumption, decision D2).
4. For each place within B metres of the route, evaluate its hours at the passing time: open, closed, unknown.
5. F1 = count of `open` places (distance-weighted). F2 = longest gap between consecutive `open` places along the route, and count of gaps over G metres. `unknown` places are excluded from both and counted separately in the breakdown.
6. F3, F5, F7 = distance-weighted counts of help points, running transport, and cameras within their radii. Metro counts only if a train runs at the passing time (needs L6 timings).
7. F4 = fraction of length on primary, secondary and tertiary roads. F6 = turns per km.
8. Normalise each factor to its max points, sum to 0-100, show the breakdown and the number of `unknown` places so the user sees how much the score rests on missing data.
9. Weights and radii live in a config file, not in code.

## 6. Data dictionary (tables for the dataset we will build)

`segments`
- `osm_way_id`, `seg_id`, `highway`, `name`, `length_m`, `lit_osm`, `sidewalk_osm`, `geom`

`places`
- `place_id`, `source` (osm | candidate | survey), `source_id`, `category`, `name`, `lat`, `lon`, `opening_hours_raw`, `hours_source`, `hours_checked_on`, `snapped_seg_id`, `snap_distance_m`

`help_points`
- `hp_id`, `type`, `name`, `lat`, `lon`, `is_24h` (true | false | unknown), `source`

`cameras`
- `cam_id`, `lat`, `lon`, `source` (osm | survey), `confirmed_working` (unknown by default)

`transit_points`
- `tp_id`, `kind` (metro | bus), `name`, `lat`, `lon`, `first_service`, `last_service`, `source`

`audit_observations` (our own, kept separate from OSM; keyed by `osm_way_id` so share-alike does not absorb it)
- `obs_id`, `seg_id`, `time_band`, `date`, `lamps_working`, `active_frontage`, `obstruction`, `shops_open_seen`, `cameras_seen`, `rater_id`, `notes_code`

`config`
- radii (B, H, C), gap threshold G, walking speed, weights, time bands

## 7. Verification tasks before we trust each source

1. Re-run the OSM counts and the `lit` query; get the count of `opening_hours` completeness for food places and pharmacies separately.
2. DONE 28 Oct 2026: Geoapify Places draws on OpenStreetMap, so its hours are as sparse as OSM's; free tier and storage terms are in section 3b.
3. DONE 28 Oct 2026: Overture has 5,644 places in the box and no hours; Foursquare open places has no hours and is gated. Section 3b has the details. Still to check: how much of Overture is junk (sample check against the street).
4. DMRC: first and last train times for the Karol Bagh station area, and the terms for using them.
5. Delhi Open Transit Data: open the terms page, check the static GTFS downloads, and confirm what night service data exists.
6. Mapillary: check street-level coverage of Karol Bagh and the licence for detections.
7. Confirm the official Karol Bagh boundary, or decide to use our own polygon.
8. Closing day and market hours: not officially documented; sources conflict (Monday, Tuesday, or no fixed day). Confirm on a short field visit on both Monday and Tuesday. See section 3b.

## 8. Constraints that shape the data work

- OSM data: ODbL. Credit "© OpenStreetMap contributors". Publishing a derived dataset that merges OSM geometry may trigger share-alike. Keep our audit observations as a separate table keyed by `osm_way_id`. (This reading is from the researchers' background knowledge; get it checked before publishing.)
- Map and routing services: the public OSM tile server, Nominatim and the OSRM demo are not for production use. Policy limits: Nominatim 1 request per second, no autocomplete; OSRM demo 1 request per second, non-commercial. For the POC, run a router locally on a Karol Bagh extract.
- Google data: do not combine Google Maps or Places content with a custom overlay on a non-Google map, and do not use Street View as a dataset.
- Privacy: no accounts, no live location sent to a server, no analytics SDK. India's DPDP Rules phase in on 13 Nov 2026 and 13 May 2027, with a possible compression to check.
- Wording: no "safe" or "unsafe" labels. Show observed conditions, dates and `unknown`.

## 9. Open decisions (need your call)

- D1: Boundary. Our own polygon around the market and metro approaches, or a ward or zone boundary?
- D2: Walking speed and time bands (for example weekday midday, 19:00-21:00, 21:30-23:00).
- D3: Radii and thresholds: place radius B, help-point radius H, camera radius C, gap threshold G, and the cap on detours.
- D4: RESOLVED 28 Oct 2026: cameras are counted inside the activity score (small weight, labelled as activity), and the raw count is also shown.
- D5: Places source. Existence: Overture plus OSM (researched, section 3b). Hours: OSM plus our own survey, since no open dataset has hours. Open question: use a category night-prior (pharmacy, hospital, ATM, food and drink more likely open) as a labelled "estimated" input until the survey is done?
- D6: How to treat `unknown` hours in the score, for example excluded (our default) or given partial credit.

## 10. POC outline (for later)

- Data: the layers above, clipped to the polygon, loaded into one SQLite or GeoPackage file.
- Routing: a local router on a Karol Bagh extract with a walking profile; generate fastest plus 2 alternatives by penalising road classes, then score each with section 5.
- App: a static web page with MapLibre, start and destination pickers limited to the polygon, a time picker, and a breakdown panel.
- First measured experiment: audit one stretch (for example metro approach to a market lane) at day and night, to test the survey form and to measure real effort per kilometre.
