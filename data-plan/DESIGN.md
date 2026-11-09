# Design: Delhi Night Routes (from BRD.md)

## Direction

**Dusk streetlight.** A calm night interface for someone walking home who may be tired or anxious. Deep ink-blue surfaces, one warm sodium-lamp amber as the only accent, a soft serif for the few big numbers, a clean humanist sans for everything else. No red alerts for ordinary routes, no fear imagery, no gradients for decoration.

**The memorable idea: beads of light.** The map does not just draw a line. Along the selected route, places that are likely open glow as small lamps (solid = confirmed opening hours, hollow = estimated from the kind of place), and stretches with nothing open are dimmed and dashed. A user can see why one route scores higher without reading a number.

## Flow (BRD section 3)

1. **Start.** One big action, "Use my location". Below it, search a starting place or tap the map. A single line says location stays on this device.
2. **Destination.** "Where to?" with search suggestions from the loaded data (stations, areas, landmarks, streets, places). Choosing a result immediately finds routes.
3. **Results.** Two routes on the map and in a switch: **Fastest** and **Most active**. One selected route card at a time: time and distance, Night Activity Score, three facts, "Why this score".

The second route is named "Most active", with the line "our closest match to a safer walk", because no study shows route information reduces harm. The label is one string in `web/app.js` (`ROUTE_COPY`) if the developer wants a different word.

## Layout

- Mobile first (390 px): full-bleed map, floating top bar, bottom sheet (max 68% of the screen) holding the current step. Thumb reach decides placement: primary buttons sit in the lower half.
- Desktop (900 px and up): the sheet becomes a 400 px card on the left; the map fills the rest.

## Type and colour

- Display: Fraunces (headings, score numerals). UI: Manrope. System fonts as fallback.
- Ink surfaces #0a0f16 to #2a384b; text #eef2f6, secondary #a9b6c6 (AA on the surfaces); lamp amber #f4b84e; fastest route cool blue #86b0e0; quiet stretches slate #8b97a8; errors a soft coral #f08c7a, used only for real errors.
- Route differences are shown by colour, line style (solid vs dashed when not selected) and the label, never colour alone.

## Shape and motion

- 14 px control radius, 22 px sheet radius, pill chips. 48 px minimum tap height.
- Motion is short and functional: step cross-fade, route fade-in, a quiet shimmer on the loading state. All of it is off under `prefers-reduced-motion`.

## States covered

First visit, locating (spinner text), location refused / unavailable / timed out / outside Delhi, searching (no results, results), picking on the map, destination chosen, finding routes (skeleton), results with two routes, results with one route and the "no better alternative" note, errors from the server (same point, too far, no route), About dialog.

## Accessibility

Labelled controls, combobox pattern for search with arrow-key navigation, visible focus rings, `aria-live` status line, focus moved to each step's heading or input, dialog for About, reduced motion, text contrast at AA or better.
