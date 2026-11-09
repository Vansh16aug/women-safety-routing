# Business Requirements: Delhi Night Route Finder (v0.2 UI)

Written 29 Oct 2026 from the developer's requests in this project. Items marked ASSUMPTION are mine and can be changed.

## 1. Purpose

Help a person walking in Delhi choose between two routes for the time they travel: the **fastest** route, and a route that passes **more activity** (open places, help points, main roads) and is therefore the closest stand-in this product has for a "safest" route. Delhi NCT only for now; other cities later.

## 2. Users

- Primary: a woman walking alone in Delhi in the evening or at night, on her phone, often in a hurry, sometimes anxious. One hand, small screen, possibly poor signal.
- Secondary: anyone planning a walk at a particular hour; the developer showing the project in a portfolio.

## 3. The flow the developer asked for (in order)

1. The app **asks for the current location**, or reads it itself (browser location permission). If this is refused, unavailable, or outside Delhi, the user can instead search for a starting point or tap one on the map.
2. The app **asks for the destination**.
3. The app **shows the safest route and the fastest route**, side by side, with enough information to choose.

Nothing else should come before step 1 or between the steps.

## 4. Functional requirements

| ID | Requirement |
|---|---|
| F1 | On first screen, one primary action: "Use my location". Secondary: search a starting place, or pick on the map. |
| F2 | Location is requested only when the user taps the action; explain in one line why. If denied or failing, show a plain reason and the fallbacks. |
| F3 | Destination is chosen by typing a place, street, locality or metro station name and picking from suggestions (searched on this computer from the data already loaded, no external search service), or by tapping the map. |
| F4 | Travel time defaults to the current time in Delhi and can be changed ("Leaving now" with a time chip). |
| F5 | Results show two routes on the map, clearly different colours, with a switch between them. Each has: name, walking time, distance, Night Activity Score, three plain-language facts. |
| F6 | A "Why this score" view shows the factor breakdown and the data-confidence line (how much rests on estimated opening hours, lighting unknown). |
| F7 | If no alternative scores meaningfully higher, say so; show the fastest route only. |
| F8 | Clear errors: point outside Delhi, same start and end, trip too long (over 15 km), no route found, location refused. |
| F9 | The disclaimer is visible on the results screen and reachable from every screen: the score is an activity estimate, not a guarantee of safety; most opening hours are estimated. |
| F10 | Works on a phone-width screen first, then desktop. |
| F11 | Credits for OpenStreetMap, Overture Maps and the map tiles on screen. |

## 5. Content rules

- Do not call a route "safe" or "unsafe" as a fact. The second route is named **Most active**, with the line "our closest match to a safer walk" (ASSUMPTION; the developer asked for "safest route"). No claim that following it reduces risk: no study found shows route information reduces harm.
- Do not use alarming language, red warnings for ordinary routes, or fear imagery.
- Show uncertainty in plain words ("estimated", "unknown") instead of hiding it.
- Do not tell the user a place is open; say "likely open".

## 6. Non-functional requirements

- Privacy: no accounts, no analytics, no storage of locations. The current location is used in the browser and sent only to the local server to find a route.
- Speed: a route result in under 2 seconds on the local server (measured 0.33 s median).
- Accessibility: tap targets at least 44 px, text contrast meeting WCAG AA, labels on every control, works with the keyboard, route differences not shown by colour alone.
- Reduced motion respected.
- Low-signal friendly: after first load, the only network calls are map tiles and the local server.

## 7. Out of scope (this version)

Turn-by-turn navigation, live tracking, sharing location with contacts, SOS, accounts, saving places, user reports, other cities, publishing online.

## 8. Acceptance criteria

1. A new user reaches routes in three steps with no instruction.
2. With location allowed inside Delhi, the start is filled without typing.
3. With location refused, the user can still finish via search or map tap.
4. Typing "Karol Bagh" suggests the locality and the metro station.
5. Two routes appear and can be switched; their scores, times and distances match the server's answer.
6. The disclaimer and the data-confidence line are visible without scrolling on a 390 px wide screen after choosing a route (ASSUMPTION: collapsed to a one-line summary with a "Why this score" link).
7. No console errors on a normal run.
