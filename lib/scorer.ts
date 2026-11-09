// Port of pipeline/scoring.py: scores one walking route with the Night Activity Score.
// It is an activity score, not a safety rating.
import type { Data } from "./data";
import { Grid, fromXY, rnd, toXY } from "./geo";

export interface Piece {
  ll: Float64Array; // lon, lat interleaved, degrees, in walking order
  main: boolean;
}

interface Densified {
  pts: Float64Array; // x, y interleaved, metres
  s: Float64Array; // distance along the route for each point
  L: number;
  mainLen: number;
}

const DEC = 10; // metres between sample points

function densify(pieces: Piece[]): Densified {
  const px: number[] = [];
  const py: number[] = [];
  const ps: number[] = [];
  let total = 0;
  let mainLen = 0;
  for (const piece of pieces) {
    const m = piece.ll.length >> 1;
    const x = new Float64Array(m);
    const y = new Float64Array(m);
    for (let i = 0; i < m; i++) [x[i], y[i]] = toXY(piece.ll[2 * i], piece.ll[2 * i + 1]);
    const cum = new Float64Array(m);
    for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    const L = cum[m - 1];
    if (!(L > 0)) continue;
    const n = Math.max(2, Math.ceil(L / DEC) + 1);
    let j = 0;
    for (let k = 0; k < n; k++) {
      const t = (L * k) / (n - 1);
      while (j < m - 2 && cum[j + 1] < t) j++;
      const span = cum[j + 1] - cum[j];
      const f = span > 0 ? (t - cum[j]) / span : 0;
      px.push(x[j] + f * (x[j + 1] - x[j]));
      py.push(y[j] + f * (y[j + 1] - y[j]));
      ps.push(total + t);
    }
    total += L;
    if (piece.main) mainLen += L;
  }
  const pts = new Float64Array(px.length * 2);
  for (let i = 0; i < px.length; i++) {
    pts[2 * i] = px[i];
    pts[2 * i + 1] = py[i];
  }
  return { pts, s: Float64Array.from(ps), L: total, mainLen };
}

function countTurns(pts: Float64Array, turnWindow: number, turnAngle: number): number {
  const n = pts.length >> 1;
  if (n < 3) return 0;
  const step = Math.max(1, Math.round(turnWindow / DEC));
  const sx: number[] = [];
  const sy: number[] = [];
  for (let i = 0; i < n; i += step) {
    sx.push(pts[2 * i]);
    sy.push(pts[2 * i + 1]);
  }
  if (sx.length < 3) return 0;
  const hs: number[] = [];
  for (let i = 1; i < sx.length; i++) {
    const dx = sx[i] - sx[i - 1];
    const dy = sy[i] - sy[i - 1];
    if (Math.hypot(dx, dy) > 1e-6) hs.push(Math.atan2(dy, dx));
  }
  if (hs.length < 2) return 0;
  let turns = 0;
  let last = false;
  for (let i = 1; i < hs.length; i++) {
    let d = hs[i] - hs[i - 1] + Math.PI;
    d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const dh = Math.abs(d - Math.PI);
    const flag = (dh * 180) / Math.PI > turnAngle;
    if (flag && !last) turns++;
    last = flag;
  }
  return turns;
}

export function bandOfHour(d: Data, hour: number): number {
  for (let i = 0; i < d.cfg.BANDS.length; i++) {
    const [, start, end] = d.cfg.BANDS[i];
    const inside = end > start ? hour >= start && hour < end : hour >= start || hour < end;
    if (inside) return i;
  }
  throw new Error("bad hour");
}

function cleanName(s: string): string {
  return s.replace(/\s*(metro\s*)?(station\s*)?gate\s*(no\.?\s*)?\d+\w*$/i, "").trim();
}

export function scoreRoute(d: Data, pieces: Piece[], b: number, details = false): Record<string, any> {
  const C = d.cfg;
  const W = C.SCORE_WEIGHTS;
  const { pts, s, L, mainLen } = densify(pieces);
  if (!(L > 0)) throw new Error("empty route");
  const km = L / 1000;
  const routeGrid = new Grid(pts, 100);
  const nearestRoute = (x: number, y: number) => routeGrid.nearest(x, y);

  // F1 open places and F2 gaps
  const near = d.plGrid.ballAny(pts, C.PLACE_RADIUS);
  const prob = near.map((i) => d.plOpen[i * 3 + b]);
  const conf = near.map((i) => d.plConf[i] === 1);
  let mass = 0;
  for (const p of prob) mass += p;
  const density = mass / km;
  const f1 = W.open_places * (1 - Math.exp(-density / C.F1_REF_PER_KM));
  const pos = near.map((i) => s[nearestRoute(d.plXY[2 * i], d.plXY[2 * i + 1])[0]]);
  const openPos = pos.filter((_, k) => prob[k] >= C.OPEN_THRESHOLD).sort((a, c) => a - c);
  const edges = [0, ...openPos, L];
  const gaps: number[] = [];
  for (let k = 1; k < edges.length; k++) gaps.push(edges[k] - edges[k - 1]);
  let longSum = 0;
  let longest = 0;
  for (const g of gaps) {
    if (g > C.GAP_MIN_M) longSum += g;
    if (g > longest) longest = g;
  }
  const gapShare = longSum / L;
  const f2 = W.gaps * (1 - gapShare);

  // F3 help points
  let helpSum = 0;
  const hl = d.helpGrid.ballAny(pts, C.HELP_RADIUS);
  for (const j of hl) {
    const g = d.helpIdx[j];
    const dist = nearestRoute(d.plXY[2 * g], d.plXY[2 * g + 1])[1];
    const kind = C.kinds[d.plKind[g]];
    const wt = C.HELP_WEIGHT[kind] ?? 1.0;
    helpSum += wt * d.plOpen[g * 3 + b] * Math.min(1, Math.max(0, 1 - dist / C.HELP_RADIUS));
  }
  const f3 = W.help * (1 - Math.exp(-helpSum / C.HELP_REF));

  // F4 main roads
  const mainShare = mainLen / L;
  const f4 = W.main_road * mainShare;

  // F5 transport
  const metroN = d.metroGrid.ballAny(pts, C.TRANSIT_RADIUS).length;
  const busN = d.busGrid.ballAny(pts, C.TRANSIT_RADIUS).length;
  const transit = metroN * C.METRO_OPEN[b] + C.BUS_WEIGHT * busN * C.BUS_OPEN[b];
  const f5 = W.transport * (1 - Math.exp(-transit / C.TRANSIT_REF));

  // F6 turns
  const turns = countTurns(pts, C.TURN_WINDOW_M, C.TURN_ANGLE_DEG);
  const f6 = W.turns * Math.max(0, 1 - turns / km / C.TURNS_REF_PER_KM);

  // F7 mapped cameras (and lamps, reported only)
  const cams = d.cctvGrid.ballAny(pts, C.CCTV_RADIUS).length;
  const f7 = W.cameras * Math.min(1, cams / km / C.CCTV_REF_PER_KM);
  const lamps = d.lampGrid.ballAny(pts, C.LAMP_RADIUS).length;

  const total = f1 + f2 + f3 + f4 + f5 + f6 + f7;
  const wsum = Object.values(W as Record<string, number>).reduce((a, c) => a + c, 0);
  let confMass = 0;
  prob.forEach((p, k) => {
    if (conf[k]) confMass += p;
  });

  const result: Record<string, any> = {
    score: rnd((100 * total) / wsum, 1),
    band: d.bandNames[b],
    length_m: rnd(L, 0),
    minutes: rnd(L / C.WALK_M_PER_MIN, 1),
    points: {
      open_places: rnd(f1, 2), gaps: rnd(f2, 2), help: rnd(f3, 2), main_road: rnd(f4, 2),
      transport: rnd(f5, 2), turns: rnd(f6, 2), cameras: rnd(f7, 2),
    },
    raw: {
      open_places_expected: rnd(mass, 1),
      open_places_per_km: rnd(density, 1),
      places_nearby: near.length,
      places_with_confirmed_hours: conf.filter(Boolean).length,
      longest_gap_m: rnd(longest, 0),
      share_in_gaps: rnd(gapShare, 3),
      help_sum: rnd(helpSum, 2),
      main_road_share: rnd(mainShare, 3),
      metro_stops_nearby: metroN,
      bus_stops_nearby: busN,
      turns,
      cameras_mapped: cams,
      lamps_mapped_per_km: rnd(lamps / km, 1),
    },
    confidence: {
      confirmed_share_of_open_mass: mass > 0 ? rnd(confMass / mass, 3) : null,
      lighting: lamps > 0 ? "observed" : "unknown",
    },
  };

  if (details) {
    const E = d.cfg.engine;
    const places: any[] = [];
    const order = near.map((_, k) => k).sort((a, c) => prob[c] - prob[a]);
    for (const k of order) {
      if (prob[k] < E.DETAIL_MIN_PROB || places.length >= E.DETAIL_MAX_PLACES) break;
      const i = near[k];
      places.push({
        lat: rnd(d.plLL[2 * i + 1], 6), lon: rnd(d.plLL[2 * i], 6), p: rnd(prob[k], 2),
        kind: C.kinds[d.plKind[i]], c: conf[k], name: d.plNames[i] || "",
      });
    }
    const quiet: number[][][] = [];
    const quietS: number[][] = [];
    gaps.forEach((g, k) => {
      if (g <= C.GAP_MIN_M) return;
      const seg: number[][] = [];
      let c = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i] >= edges[k] && s[i] <= edges[k + 1]) {
          if (c % 3 === 0) {
            const [lo, la] = fromXY(pts[2 * i], pts[2 * i + 1]);
            seg.push([rnd(lo, 6), rnd(la, 6)]);
          }
          c++;
        }
      }
      if (seg.length >= 2) quiet.push(seg);
      quietS.push([rnd(edges[k], 0), rnd(edges[k + 1], 0)]);
    });
    const profile = profileOf(near, prob, pos, L, C.PROFILE_BIN_M, C.PROFILE_REF);
    result.details = { places, quiet, quiet_s: quietS, profile, poi: poiOf(d, routeGrid, s, b) };
  }
  return result;
}

function profileOf(near: number[], prob: number[], pos: number[], L: number, bin: number, ref: number): number[] {
  const n = Math.max(1, Math.ceil(L / bin));
  const mass = new Float64Array(n);
  near.forEach((_, k) => {
    mass[Math.min(Math.floor(pos[k] / bin), n - 1)] += prob[k];
  });
  return Array.from(mass, (m) => rnd(1 - Math.exp(-m / ref), 2));
}

function poiOf(d: Data, routeGrid: Grid, s: Float64Array, b: number): any[] {
  const C = d.cfg;
  const out: any[] = [];
  const notHospital = new RegExp(C.POI_NOT_HOSPITAL_RE, "i");
  for (const kind of C.POI_KINDS as string[]) {
    const code = C.kinds.indexOf(kind);
    const radius = C.POI_RADIUS[kind];
    if (code < 0) continue;
    const near = d.plGrid.ballAny(routeGrid.xy, radius).filter((i) => d.plKind[i] === code);
    let rows = near.map((i) => {
      const [at, dd] = routeGrid.nearest(d.plXY[2 * i], d.plXY[2 * i + 1]);
      return { s: s[at], off: dd, p: d.plOpen[i * 3 + b], c: d.plConf[i] === 1, i };
    });
    rows = rows.filter((r) => r.off <= radius);
    if (kind === "hospital") rows = rows.filter((r) => !notHospital.test(d.plNames[r.i] || ""));
    // best first (likely open), then closest; keep one per POI_SPACING_M of route
    rows.sort((a, c) => (a.p >= 0.5 ? 0 : 1) - (c.p >= 0.5 ? 0 : 1) || a.off - c.off);
    const kept: typeof rows = [];
    for (const r of rows) {
      if (kept.length >= C.POI_MAX_PER_KIND) break;
      if (kept.every((k) => Math.abs(r.s - k.s) >= C.POI_SPACING_M)) kept.push(r);
    }
    for (const r of kept) {
      out.push({
        kind, name: d.plNames[r.i] || "", lat: rnd(d.plLL[2 * r.i + 1], 6), lon: rnd(d.plLL[2 * r.i], 6),
        s: Math.round(r.s), off: Math.round(r.off), p: rnd(r.p, 2), c: r.c,
      });
    }
  }
  // metro stations near the route
  const metroNear = d.metroGrid.ballAny(routeGrid.xy, C.POI_METRO_RADIUS);
  for (const k of metroNear) {
    const mx = d.metroXY[2 * k];
    const my = d.metroXY[2 * k + 1];
    const [at, dd] = routeGrid.nearest(mx, my);
    if (dd > C.POI_METRO_RADIUS) continue;
    const [lo, la] = fromXY(mx, my);
    let bj = -1;
    let bd = Infinity;
    for (let j = 0; j < d.stationNames.length; j++) {
      const e = Math.hypot(d.stationXY[2 * j] - mx, d.stationXY[2 * j + 1] - my);
      if (e < bd) {
        bd = e;
        bj = j;
      }
    }
    const named = bj >= 0 && bd <= C.STATION_NAME_M;
    out.push({
      kind: "metro", name: named ? d.stationNames[bj] : "", lat: rnd(la, 6), lon: rnd(lo, 6),
      s: Math.round(s[at]), off: Math.round(dd), p: rnd(C.METRO_OPEN[b], 2), c: false,
    });
  }
  // one entry per station: big stations have several entrances
  const best = new Map<string, any>();
  for (const r of out) {
    if (r.kind !== "metro") continue;
    r.name = cleanName(r.name);
    const key = r.name.toLowerCase() || String(r.s);
    const cur = best.get(key);
    if (!cur || r.off < cur.off) best.set(key, r);
  }
  const merged = [...out.filter((r) => r.kind !== "metro"), ...best.values()];
  merged.sort((a, c) => a.s - c.s);
  return merged;
}
