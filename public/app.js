(function () {
  "use strict";

  // The name and tagline of each route. "Most active" is the closest this app gets to a "safest" route.
  const ROUTE_COPY = {
    fast: { name: "Fastest", tag: "The shortest walk" },
    active: { name: "Most active", tag: "Our closest match to a safer walk: more open places, help points and main roads" },
  };
  const FACTORS = [
    ["open_places", "Places likely open"], ["gaps", "No long quiet stretches"], ["help", "Help points nearby"],
    ["main_road", "Main roads"], ["transport", "Transport nearby"], ["turns", "Fewer turns"], ["cameras", "Mapped cameras"],
  ];
  const BAND_NAME = { day: "Day", evening: "Evening", night: "Night" };
  // One icon per kind of landmark: a white shape on a coloured disc. Police, hospital, pharmacy, metro, fuel and shop are Google Material Icons (Apache 2.0, 24 px grid); the ATM mark is our own so it can show the rupee sign.
  const STORE = '<path d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z"/>';
  const POI = {
    police: { label: "Police", generic: "Police station", color: "#2f6fe0", glyph: '<path d="M12,1L3,5v6c0,5.55,3.84,10.74,9,12c5.16-1.26,9-6.45,9-12V5L12,1z M14.5,12.59l0.9,3.88L12,14.42l-3.4,2.05l0.9-3.87 l-3-2.59l3.96-0.34L12,6.02l1.54,3.64L17.5,10L14.5,12.59z"/>' },
    hospital: { label: "Hospital", generic: "Hospital", color: "#d83a43", glyph: '<path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/>' },
    pharmacy: { label: "Pharmacy", generic: "Pharmacy", color: "#16955f", glyph: '<path d="M21 5h-2.64l1.14-3.14L17.15 1l-1.46 4H3v2l2 6-2 6v2h18v-2l-2-6 2-6V5zm-5 9h-3v3h-2v-3H8v-2h3V9h2v3h3v2z"/>' },
    metro: { label: "Metro", generic: "Metro station", color: "#7d4fd6", glyph: '<path d="M15.5 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM9.5 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7.01 9h10v5h-10zM17.8 2.8C16 2.09 13.86 2 12 2c-1.86 0-4 .09-5.8.8C3.53 3.84 2 6.05 2 8.86V22h20V8.86c0-2.81-1.53-5.02-4.2-6.06zm.2 13.08c0 1.45-1.18 2.62-2.63 2.62l1.13 1.12V20H15l-1.5-1.5h-2.83L9.17 20H7.5v-.38l1.12-1.12C7.18 18.5 6 17.32 6 15.88V9c0-2.63 3-3 6-3 3.32 0 6 .38 6 3v6.88z"/>' },
    fuel: { label: "Fuel", generic: "Petrol pump", color: "#d4701a", glyph: '<path d="m19.77 7.23.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>' },
    atm: { label: "ATM", generic: "ATM", color: "#566377", glyph: '<text x="12" y="17.2" text-anchor="middle" font-size="14.5" font-weight="800" font-family="Manrope,system-ui,sans-serif" fill="#fff">₹</text>' },
    busy: { label: "Shops & food", generic: "Shop", color: "#c0457a", glyph: STORE },
    hotel: { label: "Hotel", generic: "Hotel", color: "#4558c9", glyph: '<path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/>' },
    bank: { label: "Bank", generic: "Bank", color: "#2b7a9b", glyph: '<path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z"/>' },
    worship: { label: "Worship", generic: "Place of worship", color: "#a8742b", glyph: '<path d="M12 2l1.4 2.6h-2.8L12 2zm0 3.6c-3.1 0-5.6 2.3-5.6 5.2V12h11.2v-1.2c0-2.9-2.5-5.2-5.6-5.2zM5 13.5h14V21h-3.5v-3.5a3.5 3.5 0 0 0-7 0V21H5v-7.5z"/>' },
  };
  // the chips along the top of the map: browse a kind of place anywhere in view, no route needed
  const EXPLORE = [["pharmacy", "Pharmacies"], ["atm", "ATMs"], ["fuel", "Petrol"], ["hospital", "Hospitals"], ["police", "Police"], ["hotel", "Hotels"], ["bank", "Banks"], ["worship", "Worship"], ["metro", "Metro"]];
  // Everything that differs between the light and dark themes on the map. The dark map canvas is brightened 1.6x in CSS,
  // so its route and cluster colours are the intended colours divided by 1.6. Pin labels use a darker (light theme) or lighter (dark theme)
  // shade of each pin colour, the way Google Maps colours its labels.
  const BASE = "https://tiles.openfreemap.org/styles/";
  const THEMES = {
    light: {
      style: BASE + "positron", meta: "#ffffff", casing: "#ffffff", casingOp: 0.95, glowLo: [138, 151, 168], glowHi: [0, 150, 136], off: "#a3aebd",
      cluster: "#c0457a", clusterLine: "#ffffff", clusterText: "#ffffff", hut: "#c0457a", hutLine: "#fff",
      label: { police: "#1f4fb8", hospital: "#b3261e", pharmacy: "#0b7a4b", metro: "#5b34b0", fuel: "#a65200", atm: "#46566a", busy: "#a02f63", hotel: "#34449e", bank: "#1f5f7c", worship: "#855a1f" },
    },
    dark: {
      style: BASE + "dark", meta: "#0a0f16", casing: "#0a0f16", casingOp: 0.85, glowLo: [70, 79, 91], glowHi: [28, 132, 119], off: "#47505d",
      cluster: "#782b4c", clusterLine: "#0a0f16", clusterText: "#ffffff", hut: "#782b4c", hutLine: "#0a0f16",
      label: { police: "#8db4ff", hospital: "#ff8f95", pharmacy: "#5fd9a2", metro: "#c9a9ff", fuel: "#ffb877", atm: "#b9c4d2", busy: "#f08ab5", hotel: "#9fb0ff", bank: "#7fc4e0", worship: "#e6b877" },
    },
  };
  let theme = "light";
  try { const t = localStorage.getItem("theme"); if (t === "dark" || t === "light") theme = t; } catch (e) { /* storage blocked: stay on light */ }
  document.documentElement.dataset.theme = theme;
  const TH = () => THEMES[theme];
  const POI_RANK = { police: 0, hospital: 1, metro: 2, pharmacy: 3, fuel: 4, atm: 5 };
  const MINOR = new Set(["pharmacy", "fuel", "atm"]);   // hidden when zoomed far out so pins do not pile up
  const BUSY_KINDS = new Set(["restaurant", "fast_food", "cafe", "bar", "shop", "convenience", "market"]);
  // Route glow: dim slate where nothing is open, warm amber where it is lively.
  const glow = (t) => "rgb(" + TH().glowLo.map((lo, i) => Math.round(lo + (TH().glowHi[i] - lo) * t)).join(",") + ")";

  const S = {
    info: null, map: null, ready: false, step: "start", lastStep: null,
    start: null, end: null, pick: null, locating: false, locMsg: null,
    timeMode: "now", timeStr: "", timeOpen: false,
    loading: false, error: null, routes: [], sel: "fast", note: null,
    layers: { police: true, hospital: true, pharmacy: true, metro: true, fuel: true, atm: true, busy: true }, allPoi: false,
    explore: new Set(), exData: {}, over: { terrain: false, transit: false, cctv: false, lamps: false, bus: false }, overData: {},
  };
  let startMarker = null, endMarker = null, poiMarkers = [];
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet");

  // ---------- tiny DOM helper (text only, never innerHTML for data) ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  }
  const svg = (markup) => { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstChild; };
  const ICON_LOC = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>';
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  async function api(path) {
    const r = await fetch(path);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  // ---------- time ----------
  const pad = (n) => String(n).padStart(2, "0");
  const nowStr = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const curTime = () => (S.timeMode === "now" ? nowStr() : S.timeStr || nowStr());
  const hourOf = (t) => parseInt(t.split(":")[0], 10);
  function to12(hr) { const h12 = hr % 12 === 0 ? 12 : hr % 12; return h12 + (hr % 24 < 12 ? "am" : "pm"); }
  function fmtTime(t) { const [hh, mm] = t.split(":").map(Number); return ((hh % 12) || 12) + ":" + pad(mm) + " " + (hh < 12 ? "AM" : "PM"); }
  function bandOf(hr) {
    for (const b of S.info.bands) {
      const inside = b.end > b.start ? hr >= b.start && hr < b.end : hr >= b.start || hr < b.end;
      if (inside) return { ...b, label: BAND_NAME[b.name] + " (" + to12(b.start) + " to " + to12(b.end) + ")" };
    }
  }
  const inDelhi = (lat, lon) => { const b = S.info.bounds; return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east; };

  // ---------- map ----------
  function initMap() {
    const b = S.info.bounds;
    S.map = new maplibregl.Map({
      container: "map", style: TH().style,
      center: [77.209, 28.6139], zoom: 11, attributionControl: { compact: true },
      maxBounds: [[b.west - 0.15, b.south - 0.15], [b.east + 0.15, b.north + 0.15]],
    });
    S.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    S.map.on("moveend", declutter);
    // the compact credit opens by itself on first load; keep it as a closed "i" button until tapped
    const closeCredit = () => { const a = document.querySelector(".maplibregl-ctrl-attrib"); if (a) { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); } };
    S.map.once("load", () => { closeCredit(); setTimeout(closeCredit, 400); });
    S.map.on("load", () => { addOverlay(); bindOverlayEvents(); S.ready = true; applyRoutes(false); });
    S.map.on("click", (ev) => {
      if (!S.pick) return;
      const p = { lat: ev.lngLat.lat, lon: ev.lngLat.lng };
      const which = S.pick;
      setPick(null);
      if (!inDelhi(p.lat, p.lon)) { S.locMsg = { text: "That point is outside Delhi. This version only covers Delhi.", soft: false }; render(); return; }
      which === "start" ? setStart(p, "Point on the map") : setEnd(p, "Point on the map");
    });
  }

  // Route lines, shops-and-food layers and the shop icon. A style change wipes them, so this runs again after one.
  function addOverlay() {
    const t = TH(), empty = { type: "FeatureCollection", features: [] };
    // lineMetrics lets the route line be coloured by how far along it is (the glow)
    ["fast", "active"].forEach((id) => S.map.addSource(id, { type: "geojson", data: empty, lineMetrics: true }));
    S.map.addSource("busy", { type: "geojson", data: empty, cluster: true, clusterRadius: 38, clusterMaxZoom: 16 });
    ["fast", "active"].forEach((id) => {
      S.map.addLayer({ id: id + "-casing", type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": t.casing, "line-width": 9, "line-opacity": t.casingOp } });
      S.map.addLayer({ id: id + "-line", type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, t.off, 1, t.off], "line-width": 5 } });
    });
    // shops and food: counts when zoomed out, single icons when zoomed in (off unless switched on)
    const vis = S.layers.busy ? "visible" : "none";
    S.map.addLayer({ id: "busy-cl", type: "circle", source: "busy", filter: ["has", "point_count"], layout: { visibility: vis }, paint: { "circle-color": t.cluster, "circle-opacity": 0.6, "circle-radius": ["step", ["get", "point_count"], 9, 10, 12, 40, 16], "circle-stroke-width": 1.5, "circle-stroke-color": t.clusterLine } });
    S.map.addLayer({ id: "busy-n", type: "symbol", source: "busy", filter: ["has", "point_count"], layout: { visibility: vis, "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 11 }, paint: { "text-color": t.clusterText } });
    // a single shop or eatery is drawn as the same storefront icon the chip uses
    const hut = new Image(40, 40), forTheme = theme;
    hut.onload = () => {
      if (forTheme !== theme || S.map.hasImage("hut")) return;
      S.map.addImage("hut", hut);
      S.map.addLayer({ id: "busy-pt", type: "symbol", source: "busy", filter: ["!", ["has", "point_count"]], layout: { visibility: S.layers.busy ? "visible" : "none", "icon-image": "hut", "icon-size": 0.75, "icon-allow-overlap": true } });
    };
    addExploreLayer(t);
    addOverlayLayers();
    hut.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40"><circle cx="12" cy="12" r="11" fill="' + t.hut + '" stroke="' + t.hutLine + '" stroke-width="1.5"/><g transform="translate(4.8 4.8) scale(.6)" fill="#fff">' + STORE + "</g></svg>");
  }
  // The dark map canvas is brightened 1.6x in CSS, so colours drawn on it are divided by 1.6 to come out as intended.
  const canvasColor = (hex) => (theme === "dark" ? "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) / 1.6).toString(16).padStart(2, "0")).join("") : hex);
  const EMPTY = { type: "FeatureCollection", features: [] };
  const bandIdx = () => Math.max(0, ["day", "evening", "night"].indexOf(bandOf(hourOf(curTime())).name));
  const exFeatures = (kind) => ({
    type: "FeatureCollection",
    features: (S.exData[kind] || []).map((r) => ({ type: "Feature", properties: { name: r[2] || "", kind, p0: r[3], p1: r[4], p2: r[5], c: r[6] }, geometry: { type: "Point", coordinates: [r[0], r[1]] } })),
  });
  const FONT = ["Noto Sans Regular"];
  // One clustered source per kind of place, so the whole of Delhi can be on screen: counts when zoomed out, icons when zoomed in.
  // Everything sits under the route lines.
  function addExploreLayer(t) {
    EXPLORE.forEach(([k]) => {
      const src = "ex-" + k, col = canvasColor(POI[k].color);
      S.map.addSource(src, { type: "geojson", data: S.explore.has(k) && S.exData[k] ? exFeatures(k) : EMPTY, cluster: true, clusterRadius: 42, clusterMaxZoom: 14 });
      S.map.addLayer({ id: "exc-" + k, type: "circle", source: src, filter: ["has", "point_count"],
        paint: { "circle-color": col, "circle-opacity": 0.92, "circle-radius": ["step", ["get", "point_count"], 12, 10, 15, 50, 19, 200, 24], "circle-stroke-width": 2, "circle-stroke-color": t.hutLine } }, "fast-casing");
      S.map.addLayer({ id: "exn-" + k, type: "symbol", source: src, filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": "#ffffff" } }, "fast-casing");
      S.map.addLayer({ id: "ex-" + k, type: "symbol", source: src, filter: ["!", ["has", "point_count"]],
        layout: { "icon-image": "exi-" + k, "icon-size": 0.8, "icon-allow-overlap": false, "text-field": ["step", ["zoom"], "", 15, ["get", "name"]], "text-font": FONT, "text-size": 11,
          "text-anchor": "left", "text-offset": [1.3, 0], "text-optional": true, "text-max-width": 9 },
        paint: { "text-color": canvasColor(t.label[k]), "text-halo-color": t.casing, "text-halo-width": 1.6 } }, "fast-casing");
    });
    const forTheme = theme;
    EXPLORE.forEach(([k]) => {
      const img = new Image(64, 64);
      img.onload = () => { if (forTheme === theme && !S.map.hasImage("exi-" + k)) S.map.addImage("exi-" + k, img, { pixelRatio: 2 }); };
      img.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64"><circle cx="12" cy="12" r="11" fill="' + canvasColor(POI[k].color) + '" stroke="' + t.hutLine + '" stroke-width="1.5"/><g transform="translate(4.8 4.8) scale(.6)" fill="#fff">' + POI[k].glyph + "</g></svg>");
    });
  }
  const chipOf = (k) => document.querySelector('.xchip[data-kind="' + k + '"]');
  async function toggleExplore(k, on) {
    on ? S.explore.add(k) : S.explore.delete(k);
    if (chipOf(k)) chipOf(k).setAttribute("aria-pressed", String(on));
    if (on && !S.exData[k]) {
      try { S.exData[k] = (await api("/api/places?kind=" + k)).places; }
      catch (e) { S.explore.delete(k); chipOf(k).setAttribute("aria-pressed", "false"); toast("Couldn't load those places. Try again."); return; }
    }
    if (S.ready && S.map.getSource("ex-" + k)) S.map.getSource("ex-" + k).setData(S.explore.has(k) ? exFeatures(k) : EMPTY);
  }
  function buildExplore() {
    $("explore").replaceChildren(...EXPLORE.map(([k, label]) => h("button", { type: "button", class: "xchip", "data-kind": k, "aria-pressed": "false", onclick: () => toggleExplore(k, !S.explore.has(k)) }, pinIcon(k), label)));
  }

  // ---------- map details: terrain, transit, cameras, lamps ----------
  const SOFT = { bus: "#2b7a9b", cctv: "#8a97a8", lamps: "#e6a23c" };
  const OVER_TILES = [
    ["terrain", "Terrain", "Hills and the Ridge", '<path d="M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z"/>'],
    ["transit", "Transit", "Metro lines, stations, bus stops", '<path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>'],
    ["cctv", "Cameras", "Mapped by volunteers", '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>'],
    ["lamps", "Street lamps", "Mapped by volunteers", '<path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>'],
  ];
  // the yellow line (#FFDF00) is pale on a light map, so it is deepened a little
  const lineColor = (hex) => (hex.toUpperCase() === "#FFDF00" && theme === "light" ? "#E6B800" : hex);
  const dotLayer = (id, src, color) => S.map.addLayer({ id, type: "circle", source: src, paint: {
    "circle-color": canvasColor(color), "circle-opacity": 0.9, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 15, 3, 18, 5],
    "circle-stroke-width": 1, "circle-stroke-color": TH().hutLine } }, "fast-casing");
  // the extra layers are added again after a theme change, because a new map style drops them
  function addOverlayLayers() {
    const before = (S.map.getStyle().layers.find((l) => l.type === "symbol") || {}).id;
    if (S.over.terrain && !S.map.getLayer("terrain-hs")) {
      S.map.addSource("terrain", { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "Terrain: Mapzen, SRTM and others (AWS Terrain Tiles)" });
      S.map.addLayer({ id: "terrain-hs", type: "hillshade", source: "terrain", paint: { "hillshade-exaggeration": 0.9, "hillshade-shadow-color": theme === "dark" ? "#000000" : "#4d5b70", "hillshade-highlight-color": theme === "dark" ? "#6b7685" : "#ffffff", "hillshade-accent-color": theme === "dark" ? "#20262e" : "#8896aa" } }, before);
    }
    if (S.over.transit && S.overData.lines && !S.map.getLayer("transit-line")) {
      // our own line data (each line in the colour OSM records for it), so the lines show at every zoom
      const data = { type: "FeatureCollection", features: S.overData.lines.features.map((f) => ({ ...f, properties: { ...f.properties, color: canvasColor(lineColor(f.properties.color)) } })) };
      S.map.addSource("ov-lines", { type: "geojson", data });
      S.map.addLayer({ id: "transit-casing", type: "line", source: "ov-lines", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": TH().casing, "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 16, 9] } }, "fast-casing");
      S.map.addLayer({ id: "transit-line", type: "line", source: "ov-lines", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 16, 5.5] } }, "fast-casing");
    }
    ["bus", "cctv", "lamps"].forEach((name) => {
      if (!S.over[name] || !S.overData[name] || S.map.getLayer("ov-" + name)) return;
      S.map.addSource("ov-" + name, { type: "geojson", data: { type: "FeatureCollection", features: S.overData[name].map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } })) } });
      dotLayer("ov-" + name, "ov-" + name, SOFT[name]);
    });
  }
  function removeOverlayLayers(name) {
    const ids = { terrain: ["terrain-hs"], transit: ["transit-casing", "transit-line"], bus: ["ov-bus"], cctv: ["ov-cctv"], lamps: ["ov-lamps"] }[name];
    ids.forEach((id) => S.map.getLayer(id) && S.map.removeLayer(id));
    ["terrain", "ov-" + name, "ov-lines"].forEach((src) => { if (S.map.getSource(src) && !S.map.getStyle().layers.some((l) => l.source === src)) S.map.removeSource(src); });
  }
  async function toggleOver(name, on) {
    const need = name === "transit" ? ["transit", "bus"] : [name];
    const NEEDS_DATA = ["bus", "cctv", "lamps"];
    need.forEach((n) => { S.over[n] = on; });
    paintTray();
    if (on) {
      for (const n of need) {
        if (n === "transit" && !S.overData.lines) {
          try { S.overData.lines = await api("/api/layer?name=metro_lines"); }
          catch (e) { need.forEach((m) => { S.over[m] = false; }); paintTray(); toast("Couldn't load the metro lines. Try again."); return; }
        }
        if (NEEDS_DATA.includes(n) && !S.overData[n]) {
          try { S.overData[n] = (await api("/api/layer?name=" + n)).points; }
          catch (e) { need.forEach((m) => { S.over[m] = false; }); paintTray(); toast("Couldn't load that layer. Try again."); return; }
        }
      }
      paintTray();
      if (name === "transit") toggleExplore("metro", true);
    }
    if (!S.ready) return;
    need.forEach(removeOverlayLayers);
    addOverlayLayers();
  }
  // one dot and name per metro line, in the line's own colour
  function legend() {
    const seen = new Map();
    S.overData.lines.features.forEach((f) => seen.set(f.properties.line, f.properties.color));
    return h("div", { class: "legend", "aria-label": "Metro lines" }, [...seen].map(([name, color]) =>
      h("span", { class: "lgd" }, h("i", { style: "background:" + lineColor(color) }), name.replace(" Line", "").replace("Delhi–Meerut RRTS", "RapidX"))));
  }
  function paintTray() {
    $("layerTray").replaceChildren(
      h("h2", { class: "tray-title", text: "Map details" }),
      h("div", { class: "tiles4" }, OVER_TILES.map(([k, label, sub, glyph]) => h("button", { type: "button", class: "ltile", "aria-pressed": String(!!S.over[k]), onclick: () => toggleOver(k, !S.over[k]) },
        h("span", { class: "ico" }, svg('<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><g fill="currentColor">' + glyph + "</g></svg>")),
        h("span", { class: "lb", text: label }), h("small", { text: sub })))),
      ...(S.over.transit && S.overData.lines ? [legend()] : []),
      h("p", { class: "fine", text: "Cameras and lamps are mapped by volunteers and many are missing, so a street with none shown is not necessarily dark or unwatched." }));
  }
  function buildTray() {
    paintTray();
    $("layersBtn").addEventListener("click", () => {
      const t = $("layerTray"), open = t.hidden;
      t.hidden = !open; $("layersBtn").setAttribute("aria-expanded", String(open));
    });
  }
  // Map event handlers are tied to layer ids, so they are bound once and keep working when the layers are re-added.
  function bindOverlayEvents() {
    const shop = (f) => ({ name: f.properties.name, kind: "busy", p: f.properties.p, c: f.properties.c === true || f.properties.c === "true" });
    S.map.on("mouseenter", "busy-pt", (ev) => { S.map.getCanvas().style.cursor = "pointer"; const f = ev.features[0]; showTip(f.properties.name || BUSY_LABEL[f.properties.kind], f.geometry.coordinates); });
    S.map.on("mouseleave", "busy-pt", () => { S.map.getCanvas().style.cursor = ""; closeTip(); });
    S.map.on("click", "busy-pt", (ev) => { const f = ev.features[0]; closeTip(); showPopup(shop(f), f.geometry.coordinates, BUSY_LABEL[f.properties.kind] || "Shop"); });
    const place = (f) => ({ name: f.properties.name || null, kind: f.properties.kind, p: f.properties["p" + bandIdx()], c: f.properties.c === true || f.properties.c === "true" });
    EXPLORE.forEach(([k]) => {
      S.map.on("mouseenter", "ex-" + k, (ev) => { S.map.getCanvas().style.cursor = "pointer"; const f = ev.features[0]; showTip(f.properties.name || POI[k].generic, f.geometry.coordinates); });
      S.map.on("mouseleave", "ex-" + k, () => { S.map.getCanvas().style.cursor = ""; closeTip(); });
      S.map.on("click", "ex-" + k, (ev) => { const f = ev.features[0]; closeTip(); showPopup(place(f), f.geometry.coordinates, POI[k].label); });
      S.map.on("mouseenter", "exc-" + k, () => { S.map.getCanvas().style.cursor = "pointer"; });
      S.map.on("mouseleave", "exc-" + k, () => { S.map.getCanvas().style.cursor = ""; });
      S.map.on("click", "exc-" + k, (ev) => {
        const f = ev.features[0];
        S.map.getSource("ex-" + k).getClusterExpansionZoom(f.properties.cluster_id).then((z) => S.map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 }));
      });
    });
    S.map.on("mouseenter", "busy-cl", () => { S.map.getCanvas().style.cursor = "pointer"; });
    S.map.on("mouseleave", "busy-cl", () => { S.map.getCanvas().style.cursor = ""; });
    S.map.on("click", "busy-cl", (ev) => {
      const f = ev.features[0];
      S.map.getSource("busy").getClusterExpansionZoom(f.properties.cluster_id).then((z) => S.map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 }));
    });
    S.map.on("zoom", () => { const z = S.map.getZoom(), c = $("map").classList; c.toggle("lowzoom", z < 14.3); c.toggle("z15", z >= 15); c.toggle("z16", z >= 16); });
  }

  // ---------- theme ----------
  const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function paintThemeButton() {
    const b = $("themeBtn"), next = theme === "light" ? "dark" : "light";
    b.replaceChildren(svg(theme === "light" ? ICON_MOON : ICON_SUN), h("span", { text: theme === "light" ? "Dark" : "Light" }));
    b.setAttribute("aria-label", "Switch to " + next + " theme");
    document.querySelector('meta[name="theme-color"]').setAttribute("content", TH().meta);
  }
  function setTheme(next) {
    if (next === theme) return;
    theme = next;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch (e) { /* not saved, still applies for this visit */ }
    paintThemeButton();
    if (!S.map) return;
    closePopup();
    S.ready = false;
    // diff:false so the old style, with our layers, is dropped completely and "style.load" fires for the new one
    S.map.once("style.load", () => { addOverlay(); S.ready = true; applyRoutes(false); });
    S.map.setStyle(TH().style, { diff: false });
  }

  function pin(cls) { return h("div", {}, h("span", { class: cls, style: "display:block" })); }
  function placeMarkers() {
    if (startMarker) { startMarker.remove(); startMarker = null; }
    if (endMarker) { endMarker.remove(); endMarker = null; }
    if (S.start) startMarker = new maplibregl.Marker({ element: pin(S.start.me ? "mk-me" : "mk-start"), anchor: "center" }).setLngLat([S.start.lon, S.start.lat]).addTo(S.map);
    if (S.end) endMarker = new maplibregl.Marker({ element: pin("mk-end"), anchor: "bottom" }).setLngLat([S.end.lon, S.end.lat]).addTo(S.map);
  }
  const mobile = () => !window.matchMedia("(min-width: 900px)").matches;
  // leave room for the sheet, but never so much that the map has nowhere left to fit the route
  const padding = () => {
    if (!mobile()) return { top: 90, bottom: 60, left: Math.min(470, Math.round(window.innerWidth * 0.4)), right: 60 };
    const hgt = window.innerHeight, want = S.step === "results" ? sheet.offsetHeight + 44 : Math.round(hgt * 0.58);
    return { top: 90, bottom: Math.max(0, Math.min(want, hgt - 90 - 150)), left: 30, right: 30 };
  };

  function clearRoutes() {
    if (!S.ready) return;
    closePopup();
    const empty = { type: "FeatureCollection", features: [] };
    ["fast", "active", "busy"].forEach((id) => S.map.getSource(id).setData(empty));
    poiMarkers.forEach((m) => m.remove()); poiMarkers = [];
  }

  // Route glow: one colour stop per 100 m bin, lightly smoothed so it reads as a glow and not as stripes.
  function glowExpr(profile, on) {
    if (!on) return ["interpolate", ["linear"], ["line-progress"], 0, TH().off, 1, TH().off];
    const n = profile.length, v = profile.map((x, i) => (profile[Math.max(0, i - 1)] + 2 * x + profile[Math.min(n - 1, i + 1)]) / 4);
    const expr = ["interpolate", ["linear"], ["line-progress"], 0, glow(v[0])];
    v.forEach((x, i) => expr.push((i + 0.5) / n, glow(x)));
    expr.push(1, glow(v[n - 1]));
    return expr;
  }

  // Hovering a place shows its name; clicking shows its details. Only one details card is open at a time.
  const BUSY_LABEL = { shop: "Shop", restaurant: "Restaurant", cafe: "Café", fast_food: "Fast food", bar: "Bar", convenience: "Convenience store", market: "Market" };
  let popup = null, tip = null;
  function closeTip() { if (tip) { tip.remove(); tip = null; } }
  function closePopup() { closeTip(); if (popup) { const old = popup; popup = null; old.remove(); } }
  function showTip(text, lngLat) {
    closeTip();
    if (popup && popup.getLngLat().lng === lngLat[0] && popup.getLngLat().lat === lngLat[1]) return;
    tip = new maplibregl.Popup({ offset: 18, closeButton: false, closeOnClick: false, className: "tip", maxWidth: "240px" }).setLngLat(lngLat).setText(text).addTo(S.map);
  }
  function showPopup(p, lngLat, kindLabel, where) {
    closePopup();
    const box = h("div", { class: "pop" }, h("b", { text: poiName(p) }), h("span", { text: kindLabel }), h("span", { text: poiState(p) }), where ? h("span", { text: where }) : null);
    const pop = new maplibregl.Popup({ offset: 20, closeButton: false, maxWidth: "240px" }).setLngLat(lngLat).setDOMContent(box).addTo(S.map);
    pop.on("close", () => { if (popup === pop) popup = null; });
    popup = pop;
  }
  function focusPoi(p) {
    S.map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(S.map.getZoom(), 16), padding: padding(), duration: 600 });
    showPopup(p, [p.lon, p.lat], POI[p.kind].label, poiWhere(p));
  }
  // Icon pins for the landmark kinds that are switched on, and the shops-and-food layer.
  function applyLayers() {
    if (!S.ready) return;
    poiMarkers.forEach((m) => m.remove()); poiMarkers = [];
    const cur = S.routes.find((r) => r.kind === S.sel) || S.routes[0];
    if (cur) {
      cur.details.poi.filter((p) => S.layers[p.kind]).sort((a, b) => POI_RANK[b.kind] - POI_RANK[a.kind]).forEach((p) => {
        const el = h("button", { type: "button", "data-rank": POI_RANK[p.kind], class: "pin" + (MINOR.has(p.kind) ? " minor" : "") + (p.p < 0.5 ? " dim" : ""), "aria-label": poiName(p) + ", " + POI[p.kind].label + ". " + poiState(p) },
          pinIcon(p.kind), h("span", { class: "plabel", style: "color:" + TH().label[p.kind], "aria-hidden": "true", text: poiName(p) }));
        el.addEventListener("mouseenter", () => showTip(poiName(p), [p.lon, p.lat]));
        el.addEventListener("mouseleave", closeTip);
        el.addEventListener("click", (ev) => { ev.stopPropagation(); showPopup(p, [p.lon, p.lat], POI[p.kind].label, poiWhere(p)); });
        poiMarkers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(S.map));
      });
      S.map.getSource("busy").setData({
        type: "FeatureCollection",
        features: cur.details.places.filter((p) => BUSY_KINDS.has(p.kind)).map((p) => ({ type: "Feature", properties: { name: p.name, kind: p.kind, p: p.p, c: p.c }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })),
      });
    }
    ["busy-cl", "busy-n", "busy-pt"].forEach((id) => S.map.getLayer(id) && S.map.setLayoutProperty(id, "visibility", S.layers.busy ? "visible" : "none"));
    declutter();
  }
  // Pins that would sit on top of each other are hidden, most important kind first (police, then hospital, ...).
  // Zooming in separates them, so each one reappears when there is room.
  function declutter() {
    if (!S.map || !poiMarkers.length) return;
    const gap = S.map.getZoom() >= 15 ? 46 : 36, kept = [];
    [startMarker, endMarker].forEach((m) => { if (m) kept.push(S.map.project(m.getLngLat())); });
    poiMarkers.map((m) => ({ el: m.getElement(), pt: S.map.project(m.getLngLat()) }))
      .sort((a, b) => a.el.dataset.rank - b.el.dataset.rank)
      .forEach((it) => {
        const crowded = kept.some((k) => Math.hypot(k.x - it.pt.x, k.y - it.pt.y) < gap);
        it.el.classList.toggle("hide", crowded);
        if (!crowded) kept.push(it.pt);
      });
  }
  function applyRoutes(fit) {
    if (!S.ready || !S.routes.length) return;
    const bounds = new maplibregl.LngLatBounds();
    S.routes.forEach((r) => {
      S.map.getSource(r.kind).setData({ type: "Feature", geometry: r.geometry });
      r.geometry.coordinates.forEach((c) => bounds.extend(c));
    });
    ["fast", "active"].forEach((id) => {
      const present = S.routes.some((r) => r.kind === id), sel = S.sel === id;
      const vis = present ? "visible" : "none";
      S.map.setLayoutProperty(id + "-casing", "visibility", vis);
      S.map.setLayoutProperty(id + "-line", "visibility", vis);
      S.map.setPaintProperty(id + "-line", "line-width", sel ? 6 : 3);
      S.map.setPaintProperty(id + "-casing", "line-width", sel ? 10 : 6);
      S.map.setPaintProperty(id + "-line", "line-opacity", sel ? 1 : 0.7);
      const r = S.routes.find((x) => x.kind === id);
      if (r) S.map.setPaintProperty(id + "-line", "line-gradient", glowExpr(r.details.profile, sel));
      if (sel) { S.map.moveLayer(id + "-casing"); S.map.moveLayer(id + "-line"); }
    });
    ["busy-cl", "busy-n", "busy-pt"].forEach((id) => S.map.getLayer(id) && S.map.moveLayer(id));
    applyLayers();
    if (fit) {
      // flyTo keeps its padding on the camera and fitBounds adds to it, so clear it or a tall sheet leaves "cannot fit" and no zoom at all
      S.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      S.map.fitBounds(bounds, { padding: padding(), duration: 700, maxZoom: 17 });
    }
  }

  // ---------- picking, points ----------
  function setPick(which) {
    S.pick = which;
    $("pickHint").hidden = !which;
    document.body.classList.toggle("picking", !!which);
    if (which) $("pickHintText").textContent = which === "start" ? "Tap the map to place your starting point" : "Tap the map to place your destination";
  }
  $("pickCancel").addEventListener("click", () => setPick(null));

  function setStart(p, label, me) {
    S.start = { ...p, label, me: !!me };
    S.end = null; S.routes = []; S.error = null; S.locMsg = null; S.step = "dest";
    clearRoutes(); placeMarkers();
    S.map.flyTo({ center: [p.lon, p.lat], zoom: 15, padding: padding(), duration: 800 });
    render();
  }
  function setEnd(p, label) {
    S.end = { ...p, label }; S.step = "results"; S.error = null;
    placeMarkers(); findRoutes();
  }
  function startOver() {
    S.start = S.end = null; S.routes = []; S.error = null; S.locMsg = null; S.loading = false; S.step = "start";
    setPick(null); clearRoutes(); placeMarkers(); render();
  }

  function locate() {
    S.locating = true; S.locMsg = null; render();
    const fail = (text) => { S.locating = false; S.locMsg = { text, soft: false }; render(); };
    const got = (lat, lon) => {
      S.locating = false;
      if (!inDelhi(lat, lon)) return fail("You seem to be outside Delhi. This version only covers Delhi, so search for a starting place inside it.");
      setStart({ lat, lon }, "Your location", true);
    };
    const demo = new URLSearchParams(location.search).get("loc");
    if (demo) { const [la, lo] = demo.split(",").map(Number); return void setTimeout(() => got(la, lo), 300); }
    if (!navigator.geolocation) return fail("This browser can't share your location. Search for your starting place instead.");
    navigator.geolocation.getCurrentPosition(
      (p) => got(p.coords.latitude, p.coords.longitude),
      (err) => fail(err.code === 1
        ? "Location is blocked for this page. You can search for your starting place, or allow location in your browser's site settings and try again."
        : err.code === 3 ? "Finding your location took too long. Try again, or search for your starting place."
          : "Your location isn't available right now. Search for your starting place instead."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  // ---------- routes ----------
  async function findRoutes() {
    S.loading = true; S.error = null; S.routes = []; clearRoutes(); render();
    const hr = hourOf(curTime());
    const q = new URLSearchParams({ slat: S.start.lat, slon: S.start.lon, elat: S.end.lat, elon: S.end.lon, hour: hr });
    try {
      const data = await api("/api/route?" + q);
      const fast = data.routes.find((r) => r.label === "Fastest");
      const alts = data.routes.filter((r) => r.label !== "Fastest").sort((a, b) => b.score - a.score);
      fast.kind = "fast";
      S.routes = [fast];
      if (alts.length) { alts[0].kind = "active"; S.routes.push(alts[0]); }
      S.sel = alts.length ? "active" : "fast";
      S.note = data.note; S.snap = { s: data.start.snap_m, e: data.end.snap_m };
      S.loading = false;
      render(); applyRoutes(true);
    } catch (e) {
      S.loading = false; S.error = e.message; render();
    }
  }

  // ---------- views ----------
  function searchBox(placeholder, onPick, focus) {
    const input = h("input", { type: "search", role: "combobox", "aria-expanded": "false", "aria-controls": "sug", "aria-autocomplete": "list", autocomplete: "off", placeholder, "aria-label": placeholder, "data-focus": focus ? "1" : false });
    const list = h("ul", { class: "sug", id: "sug", role: "listbox", hidden: true });
    let items = [], active = -1, timer = null, req = 0;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; input.removeAttribute("aria-activedescendant"); };
    const mark = () => { [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active))); if (active >= 0) input.setAttribute("aria-activedescendant", "sug-" + active); };
    const choose = (i) => { const r = items[i]; if (r) { close(); onPick({ lat: r.lat, lon: r.lon }, r.name); } };
    function show(msg) {
      list.replaceChildren();
      if (msg) list.append(h("li", { class: "none", role: "option", "aria-disabled": "true" }, msg));
      items.forEach((r, i) => list.append(h("li", { id: "sug-" + i, role: "option", "aria-selected": "false", onmousedown: (ev) => { ev.preventDefault(); choose(i); } },
        h("span", { class: "nm", text: r.name }), h("span", { class: "kd", text: r.label }))));
      list.hidden = false; input.setAttribute("aria-expanded", "true"); active = -1;
    }
    async function run() {
      const text = input.value.trim();
      if (text.length < 2) return close();
      const id = ++req, c = S.map.getCenter();
      try {
        const data = await api("/api/search?" + new URLSearchParams({ q: text, lat: c.lat, lon: c.lng }));
        if (id !== req) return;
        items = data.results;
        show(items.length ? null : "No match. Try a station, area or street name, or tap the map.");
      } catch (e) { items = []; show("Search isn't working right now. You can tap the map instead."); }
    }
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 180); });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" && items.length) { ev.preventDefault(); active = (active + 1) % items.length; mark(); }
      else if (ev.key === "ArrowUp" && items.length) { ev.preventDefault(); active = (active - 1 + items.length) % items.length; mark(); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (active >= 0) choose(active); else if (items.length) choose(0); }
      else if (ev.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    return h("div", {}, h("div", { class: "field" }, svg(ICON_SEARCH), input), list);
  }

  function timeRow(onChange) {
    const t = curTime(), b = bandOf(hourOf(t));
    const chip = h("button", { class: "chip btnlike", type: "button", "aria-expanded": String(S.timeOpen), onclick: () => { S.timeOpen = !S.timeOpen; render(); } },
      "Leaving ", h("strong", { text: (S.timeMode === "now" ? "now, " : "") + fmtTime(t) }), " · " + b.label);
    const row = h("div", { class: "timebox" }, chip);
    if (S.timeOpen) {
      const input = h("input", { type: "time", value: t, "aria-label": "Time you will walk" });
      input.addEventListener("change", () => { if (!input.value) return; S.timeMode = "custom"; S.timeStr = input.value; onChange(); });
      row.append(input, h("button", { class: "chip btnlike", type: "button", onclick: () => { S.timeMode = "now"; onChange(); } }, "Now"));
    }
    return row;
  }

  const credit = () => h("p", { class: "credit", text: "Map data © OpenStreetMap contributors · Places © Overture Maps Foundation · Tiles by OpenFreeMap" });
  const title = (t, focus = true) => h("h2", { class: "title", tabindex: "-1", "data-focus": focus ? "1" : false, text: t });
  const locAlert = () => (S.locMsg ? h("div", { class: "alert" + (S.locMsg.soft ? " soft" : ""), role: "alert", text: S.locMsg.text }) : null);

  function viewStart() {
    return h("div", { class: "step" },
      title("Where are you starting from?"),
      h("p", { class: "lede", text: "Compare walking routes for the hour you set. Your location stays on this device." }),
      locAlert(),
      h("button", { class: "btn btn-primary", type: "button", disabled: S.locating, onclick: locate }, svg(ICON_LOC), S.locating ? "Finding you…" : "Use my location"),
      h("div", { class: "divider", text: "or" }),
      searchBox("Search for a starting place", (p, name) => setStart(p, name)),
      h("button", { class: "link", type: "button", onclick: () => { S.locMsg = null; setPick("start"); render(); } }, "Tap the map to choose a starting point"),
      credit());
  }

  function viewDest() {
    return h("div", { class: "step" },
      h("div", { class: "chiprow" },
        h("span", { class: "chip" }, h("span", { class: "dot s" }), "From ", h("strong", { text: S.start.label })),
        h("button", { class: "chip btnlike", type: "button", onclick: startOver }, "Change")),
      title("Where to?", false),
      h("p", { class: "lede", text: "Search a station, area, street or place in Delhi." }),
      locAlert(),
      searchBox("Search for a destination", (p, name) => setEnd(p, name), true),
      h("button", { class: "link", type: "button", onclick: () => { S.locMsg = null; setPick("end"); render(); } }, "Tap the map instead"),
      timeRow(render),
      credit());
  }

  // ---------- results pieces ----------
  const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m / 10) * 10 + " m");
  const pinIcon = (kind) => { const d = POI[kind]; return h("span", { class: "poi", style: "background:" + d.color }, svg('<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><g fill="#fff">' + d.glyph + "</g></svg>")); };
  const poiName = (p) => p.name || POI[p.kind].generic;
  const poiState = (p) => (p.kind === "metro" ? (p.p >= 0.5 ? "Running at this hour" : "May not be running at this hour") : p.p >= 0.5 ? (p.c ? "Open (hours confirmed)" : "Likely open") : "May be closed");
  const poiWhere = (p) => fmtDist(p.s) + " from start · " + (p.off < 25 ? "on your route" : p.off + " m off the route");

  // Activity along the route: a bar per 100 m, with the help points that matter most above it.
  function strip(r) {
    const L = r.length_m, d = r.details, n = d.profile.length;
    const bars = h("div", { class: "bars2" }, d.profile.map((v, i) => {
      const mid = (i + 0.5) * 100, quiet = d.quiet_s.some(([a, b]) => mid >= a && mid <= b);
      return h("i", { class: quiet ? "q" : "", style: "height:" + Math.max(10, Math.round(v * 100)) + "%" });
    }));
    const pins = h("div", { class: "pins" });
    const kept = [];
    d.poi.filter((p) => ["police", "hospital", "metro"].includes(p.kind)).sort((a, b) => POI_RANK[a.kind] - POI_RANK[b.kind]).forEach((p) => {
      const x = (100 * p.s) / L;
      if (kept.every((k) => Math.abs(k - x) >= 7)) {
        kept.push(x);
        pins.append(h("span", { class: "sp", style: "left:" + x + "%" }, pinIcon(p.kind)));
      }
    });
    const gap = r.raw.longest_gap_m;
    return h("figure", { class: "strip", role: "img", "aria-label": "Activity along the route, from start to destination. " + (gap < 150 ? "No long quiet stretches." : "Longest quiet stretch " + Math.round(gap) + " metres.") },
      pins, bars,
      h("div", { class: "ends" }, h("span", { text: "Start" }), h("span", { class: "mid" }, h("i", { class: "lv hi" }), "lively", h("i", { class: "lv lo" }), "quiet"), h("span", { text: fmtDist(L) })));
  }

  function layerChips(r) {
    const count = {};
    r.details.poi.forEach((p) => { count[p.kind] = (count[p.kind] || 0) + 1; });
    count.busy = r.details.places.filter((p) => BUSY_KINDS.has(p.kind)).length;
    return h("div", { class: "lchips", role: "group", "aria-label": "Show on map" }, Object.keys(POI).filter((k) => count[k]).map((k) =>
      h("button", { type: "button", class: "lchip", "aria-pressed": String(!!S.layers[k]), onclick: () => { S.layers[k] = !S.layers[k]; render(); applyLayers(); } },
        pinIcon(k), h("span", { class: "lb", text: POI[k].label }), h("b", { text: count[k] }))));
  }

  function poiList(r) {
    const all = r.details.poi.slice().sort((a, b) => a.s - b.s);
    // by default only help that is probably open (police stations are always listed)
    const helpful = (p) => p.kind === "police" || (["hospital", "pharmacy", "metro"].includes(p.kind) && p.p >= 0.5);
    const rows = S.allPoi ? all : all.filter(helpful).slice(0, 6);
    if (!all.length) return null;
    return h("section", { class: "plist", "aria-label": "Landmarks along the route" },
      h("h3", { text: S.allPoi ? "All landmarks on the way" : "Help on the way" }),
      rows.length ? h("ul", {}, rows.map((p) => h("li", {}, h("button", { type: "button", onclick: () => focusPoi(p) },
        pinIcon(p.kind), h("span", { class: "tx" }, h("b", { text: poiName(p) }), h("small", { text: poiWhere(p) + " · " + poiState(p) })))))) :
        h("p", { class: "lede", style: "margin:0 0 8px", text: "No help point that is likely open was found near this route at this hour." }),
      h("button", { class: "link", type: "button", style: "padding:0;min-height:36px", onclick: () => { S.allPoi = !S.allPoi; render(); } }, S.allPoi ? "Show fewer" : "Show all " + all.length + " landmarks"));
  }

  function resultCard(r) {
    const k = r.kind, w = r.raw, cf = r.confidence, share = cf.confirmed_share_of_open_mass;
    const gap = w.longest_gap_m < 150 ? "None" : Math.round(w.longest_gap_m) + " m";
    const bars = h("div", { class: "bars" }, FACTORS.map(([key, name]) => {
      const max = S.info.weights[key], pts = r.points[key];
      return h("div", { class: "bar" }, h("span", { class: "nm", text: name }), h("span", { class: "num", text: pts.toFixed(1) + " / " + max }),
        h("div", { class: "tr" }, h("i", { style: "width:" + Math.max(0, Math.min(100, (100 * pts) / max)) + "%" })));
    }));
    const tile = (v, l) => h("div", { class: "tile" }, h("b", { text: v }), h("span", { text: l }));
    return h("div", { class: "card", role: "tabpanel" },
      h("p", { class: "lede tagl", text: ROUTE_COPY[k].tag }),
      strip(r),
      layerChips(r),
      h("div", { class: "tiles" }, tile(gap, "longest quiet stretch"), tile(Math.round(100 * w.main_road_share) + "%", "on main roads"), tile(String(w.turns), w.turns === 1 ? "turn" : "turns")),
      poiList(r),
      h("details", { class: "why" }, h("summary", { text: "Why this score" }), bars,
        h("div", { class: "conf", text: (share === null ? "No places found near this route. " : Math.round(100 * share) + "% of the open-place estimate rests on confirmed opening hours; the rest is a guess from the kind of place. ") + "Street lighting data is missing for most streets, so lighting is " + (cf.lighting === "observed" ? "partly known" : "unknown") + " and not scored." })));
  }

  function viewResults() {
    const ibtn = (icon, label, fn) => h("button", { class: "ibtn", type: "button", "aria-label": label, title: label, onclick: fn }, svg(icon));
    const trip = h("div", { class: "tripbar" },
      h("div", { class: "ft" },
        h("span", { class: "ln" }, h("i", { class: "dot s" }), h("b", { text: S.start.label })),
        h("span", { class: "ln" }, h("i", { class: "dot e" }), h("b", { text: S.end.label }))),
      h("div", { class: "acts" },
        S.routes.length && !S.loading ? ibtn(ICON_SHARE, "Share this route", shareRoute) : null,
        ibtn(ICON_CLOSE, "Start over with a new route", startOver)));
    const grab = h("button", { class: "grab", type: "button", "aria-expanded": String(!S.peek),
      "aria-label": S.peek ? "Show route details" : "Show more of the map",
      onclick: () => { S.peek = !S.peek; render(); if (S.routes.length) applyRoutes(true); } });
    const kids = [grab, trip];
    if (S.loading) {
      kids.push(timeRow(findRoutes), h("div", { role: "status", "aria-label": "Finding routes" }, h("div", { class: "skel", style: "height:60px" }), h("div", { class: "skel" }), h("div", { class: "skel", style: "width:70%" })));
    } else if (S.error) {
      kids.push(timeRow(findRoutes), h("div", { class: "alert", role: "alert", text: S.error }), h("button", { class: "btn", type: "button", onclick: startOver }, "Try different points"));
    } else if (S.routes.length) {
      const single = S.routes.length === 1;
      const tabs = h("div", { class: "seg" + (single ? " single" : ""), role: "tablist", "aria-label": "Route options" }, S.routes.map((r) =>
        h("button", { type: "button", role: "tab", class: r.kind, "aria-selected": String(r.kind === S.sel), onclick: () => { S.sel = r.kind; render(); applyRoutes(false); } },
          h("span", { class: "lb", text: ROUTE_COPY[r.kind].name }),
          h("span", { class: "mins" }, h("b", { text: String(Math.round(r.minutes)) }), " min"),
          h("span", { class: "sub" }, fmtDist(r.length_m) + " · activity ", h("b", { text: String(Math.round(r.score)) })))));
      kids.push(tabs);
      if (single) kids.push(h("p", { class: "fine onlyone", role: "status", text: "No livelier route within a sensible detour." }));
      kids.push(timeRow(findRoutes));
      kids.push(resultCard(S.routes.find((r) => r.kind === S.sel) || S.routes[0]));
      kids.push(h("p", { class: "disc", text: S.info.disclaimer }), credit());
    }
    return h("div", { class: "step" }, kids);
  }

  function render() {
    const view = S.step === "start" ? viewStart() : S.step === "dest" ? viewDest() : viewResults();
    sheet.className = "sheet" + (S.step === "results" ? " results" + (S.peek ? " peek" : "") : "");
    const keepScroll = S.lastStep === S.step ? sheet.scrollTop : 0;
    sheet.replaceChildren(view);
    sheet.scrollTop = keepScroll;
    if (S.lastStep !== S.step) { const f = sheet.querySelector("[data-focus]"); if (f) f.focus({ preventScroll: true }); }
    S.lastStep = S.step;
  }

  // ---------- help near me ----------
  const ICON_PHONE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  const helpDlg = $("help");
  const HELP = { status: "idle", msg: "", data: null };
  const dirUrl = (p) => "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" + p.lat.toFixed(6) + "," + p.lon.toFixed(6);

  function getPosition() {
    return new Promise((resolve, reject) => {
      const demo = new URLSearchParams(location.search).get("loc");
      if (demo) { const [lat, lon] = demo.split(",").map(Number); return void setTimeout(() => resolve({ lat, lon }), 200); }
      if (!navigator.geolocation) return reject(new Error("This browser can't share your location."));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        (err) => reject(new Error(err.code === 1 ? "Location is blocked for this page. Allow it in your browser's site settings and try again."
          : err.code === 3 ? "Finding your location took too long." : "Your location isn't available right now.")),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }

  function helpRow(kind, p) {
    const state = kind === "hospital" ? " · " + poiState({ kind, p: p.p, c: p.c }) : "";
    return h("a", { class: "hrow", href: dirUrl(p), target: "_blank", rel: "noopener", "aria-label": poiName({ kind, name: p.name }) + ", " + fmtDist(p.m) + " away. Opens directions in Google Maps." },
      pinIcon(kind),
      h("span", { class: "tx" }, h("b", { text: poiName({ kind, name: p.name }) }), h("small", { text: fmtDist(p.m) + " away" + state })),
      h("span", { class: "go", "aria-hidden": "true", text: "↗" }));
  }

  function paintHelp() {
    const body = [];
    if (HELP.status === "loading") body.push(h("p", { class: "lede", role: "status", text: "Finding your location…" }));
    else if (HELP.status === "error") body.push(h("div", { class: "alert soft", role: "alert", text: HELP.msg }), h("button", { class: "btn", type: "button", onclick: findHelp }, "Try again"));
    else if (HELP.status === "ok") {
      const d = HELP.data;
      body.push(h("h3", { text: "Nearest police stations" }), h("div", { class: "hlist" }, d.police.map((p) => helpRow("police", p))),
        h("h3", { text: "Nearest hospitals" }), h("div", { class: "hlist" }, d.hospital.map((p) => helpRow("hospital", p))),
        h("p", { class: "fine", text: "Distances are in a straight line, so walking is longer. Hospital hours are mostly estimated and not every hospital has a 24-hour emergency room, so call ahead if you can. Directions open in Google Maps." }));
    }
    helpDlg.replaceChildren(
      h("h2", { id: "helpTitle", text: "Help near me" }),
      h("p", { class: "lede", text: "If you are in danger, call now." }),
      h("div", { class: "calls" },
        h("a", { class: "call primary", href: "tel:112" }, svg(ICON_PHONE), h("span", { class: "tx" }, h("b", { text: "Call 112" }), h("small", { text: "Emergency, all of India" }))),
        h("a", { class: "call", href: "tel:1091" }, svg(ICON_PHONE), h("span", { class: "tx" }, h("b", { text: "Call 1091" }), h("small", { text: "Delhi Police women's helpline" })))),
      ...body,
      h("form", { method: "dialog" }, h("button", { class: "btn", type: "submit" }, "Close")));
  }

  async function findHelp() {
    HELP.status = "loading"; paintHelp();
    try {
      const pos = await getPosition();
      if (!inDelhi(pos.lat, pos.lon)) throw new Error("You seem to be outside Delhi, so nearby help isn't listed here. In an emergency, call 112.");
      HELP.data = await api("/api/help?" + new URLSearchParams({ lat: pos.lat, lon: pos.lon, hour: hourOf(nowStr()) }));
      HELP.status = "ok";
    } catch (e) { HELP.status = "error"; HELP.msg = e.message; }
    if (helpDlg.open) paintHelp();
  }
  function openHelp() { if (!helpDlg.open) helpDlg.showModal(); findHelp(); }

  // ---------- share a route ----------
  const hav = (a, b) => {
    const R = 6371000, rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  // Google Maps picks its own path, so a few points along ours are passed as stops to keep it close
  // (its links accept only 3 stops on a phone).
  function shareText(r) {
    const c = r.geometry.coordinates, cum = [0];
    for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + hav(c[i - 1], c[i]));
    const L = cum[cum.length - 1], ll = (p) => p[1].toFixed(5) + "," + p[0].toFixed(5), stops = [];
    if (L > 600) for (const f of [0.25, 0.5, 0.75]) stops.push(ll(c[cum.findIndex((m) => m >= f * L)]));
    const url = "https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=" + ll(c[0]) + "&destination=" + ll(c[c.length - 1]) + (stops.length ? "&waypoints=" + stops.join("%7C") : "");
    const from = S.start.label === "Your location" ? "my location" : S.start.label;
    return "Walking route in Delhi: " + from + " to " + S.end.label + "\n" + Math.round(r.minutes) + " min, " + fmtDist(r.length_m) +
      ". Night Activity Score " + Math.round(r.score) + "/100 for " + fmtTime(curTime()) + " (an estimate of how much is open along the way, not a safety rating).\n" + url +
      "\nGoogle Maps may adjust the path slightly.";
  }
  const ICON_SHARE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  function toast(msg) {
    let t = $("toast");
    if (!t) { t = h("div", { id: "toast", class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("on"), 3500);
  }
  // clipboard blocked: show the text so it can be copied by hand
  function showShareText(text) {
    let d = $("shareDlg");
    if (!d) { d = h("dialog", { id: "shareDlg", "aria-labelledby": "shareTitle" }); document.body.append(d); }
    const box = h("textarea", { class: "sharebox", readonly: true, rows: 6, "aria-label": "Route text to copy", onfocus: (ev) => ev.target.select() }, text);
    d.replaceChildren(h("h2", { id: "shareTitle", text: "Share this route" }), h("p", { class: "lede", text: "Copy this text and send it to someone you trust." }), box,
      h("form", { method: "dialog" }, h("button", { class: "btn", type: "submit" }, "Close")));
    d.showModal(); box.select();
  }
  async function shareRoute() {
    const r = S.routes.find((x) => x.kind === S.sel) || S.routes[0];
    if (!r) return;
    const text = shareText(r);
    try {
      if (navigator.share) await navigator.share({ title: "Walking route in Delhi", text });
      else { await navigator.clipboard.writeText(text); toast("Route copied. Paste it into WhatsApp or SMS."); }
    } catch (e) {
      if (e && e.name === "AbortError") return;   // the person closed the share sheet
      showShareText(text);
    }
  }

  // ---------- boot ----------
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* not installable here (needs https or localhost) */ }));
  $("helpBtn").addEventListener("click", openHelp);
  buildExplore();
  buildTray();
  // keep the map credit above the bottom sheet on phones
  new ResizeObserver(() => document.documentElement.style.setProperty("--sheet-h", sheet.offsetHeight + "px")).observe(sheet);
  $("aboutBtn").addEventListener("click", () => { const a = $("about"); a.showModal(); a.scrollTop = 0; });
  $("themeBtn").addEventListener("click", () => setTheme(theme === "light" ? "dark" : "light"));
  paintThemeButton();
  api("/api/info").then((info) => { S.info = info; initMap(); render(); })
    .catch(() => { sheet.replaceChildren(h("div", { class: "alert", role: "alert", text: "Can't reach the route server. Start it with run_app.cmd and reload this page." })); });
})();
