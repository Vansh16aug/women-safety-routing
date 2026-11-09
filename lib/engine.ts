// Port of the Engine in pipeline/server.py: routing, "help near me", search and the info block.
import { loadData, type Data } from "./data";
import { rnd, toXY } from "./geo";
import { shortestPath } from "./router";
import { bandOfHour, scoreRoute, type Piece } from "./scorer";

export class InputError extends Error {}


export function info(d: Data = loadData()) {
  const [s, w, n, e] = d.cfg.engine.DELHI_BOX as number[];
  return {
    bounds: { south: s, west: w, north: n, east: e },
    weights: d.cfg.SCORE_WEIGHTS,
    bands: d.cfg.BANDS.map(([name, start, end]) => ({ name, start, end })),
    disclaimer:
      "Night Activity Score is an activity estimate, not a safety rating. Most opening hours are estimated from the type of place.",
    credits:
      "Street data (c) OpenStreetMap contributors (ODbL). Places also from Overture Maps Foundation (CDLA Permissive 2.0, Apache 2.0, CC0 by source).",
  };
}

export function checkInBox(d: Data, lat: number, lon: number) {
  const [s, w, n, e] = d.cfg.engine.DELHI_BOX as number[];
  if (!(s <= lat && lat <= n && w <= lon && lon <= e)) throw new InputError("point is outside Delhi NCT");
}

function snap(d: Data, lat: number, lon: number): [number, number] {
  const [x, y] = toXY(lon, lat);
  const [i, dist] = d.nodeGrid.nearest(x, y);
  return [i, dist];
}

function pieceOf(d: Data, edge: number, from: number): Piece {
  const a = d.geomOff[edge];
  const b = d.geomOff[edge + 1];
  const m = b - a;
  const ll = new Float64Array(m * 2);
  const fwd = d.segU[edge] === from;
  for (let k = 0; k < m; k++) {
    const src = fwd ? a + k : b - 1 - k;
    ll[2 * k] = d.geom[2 * src] / 1e7;
    ll[2 * k + 1] = d.geom[2 * src + 1] / 1e7;
  }
  return { ll, main: d.segMain[edge] === 1 };
}

export function routes(d: Data, slat: number, slon: number, elat: number, elon: number, hour: number) {
  const E = d.cfg.engine;
  const C = d.cfg;
  const bandI = bandOfHour(d, hour);
  const band = d.bandNames[bandI];
  const [src, dS] = snap(d, slat, slon);
  const [dst, dE] = snap(d, elat, elon);
  if (src === dst) throw new InputError("start and end snap to the same junction; pick points further apart");
  const straight = Math.hypot(d.nodeXY[2 * src] - d.nodeXY[2 * dst], d.nodeXY[2 * src + 1] - d.nodeXY[2 * dst + 1]);
  if (straight > E.MAX_STRAIGHT_M)
    throw new InputError(
      `points are ${(straight / 1000).toFixed(1)} km apart; this demo handles up to ${Math.floor(E.MAX_STRAIGHT_M / 1000)} km`,
    );

  type Cand = { res: Record<string, any>; pieces: Piece[] };
  const cands: Cand[] = [];
  const seen = new Set<string>();
  const pen = d.pen[bandI];
  for (const alpha of E.ALPHAS as number[]) {
    const cost = new Float64Array(d.edgeCount);
    for (let e = 0; e < d.edgeCount; e++) cost[e] = d.segLen[e] * (1 + alpha * pen[e]);
    const limit = (1 + alpha) * (3 * straight + 1500);
    const path = shortestPath(d, src, dst, cost, limit);
    if (!path) continue;
    const key = path.nodes.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const pieces = path.edges.map((e, k) => pieceOf(d, e, path.nodes[k]));
    const res = scoreRoute(d, pieces, bandI);
    res.alpha = alpha;
    cands.push({ res, pieces });
  }
  if (!cands.length) throw new InputError("no walking route found between these points");

  const fastest = cands.reduce((a, c) => (c.res.length_m < a.res.length_m ? c : a));
  const L0 = fastest.res.length_m as number;
  const best = (ratio: number) => {
    const ok = cands.filter((c) => c.res.length_m <= ratio * L0);
    return ok.reduce((a, c) => {
      const better = c.res.score > a.res.score || (c.res.score === a.res.score && c.res.length_m < a.res.length_m);
      return better ? c : a;
    });
  };
  const picks: [string, Cand][] = [["Fastest", fastest]];
  for (const [label, r] of [
    ["Balanced", best(E.BALANCED_MAX_RATIO)],
    ["Most active", best(E.ACTIVE_MAX_RATIO)],
  ] as [string, Cand][]) {
    if (r.res.score >= fastest.res.score + E.MIN_GAIN && picks.every((p) => p[1] !== r)) picks.push([label, r]);
  }
  const note =
    picks.length === 1
      ? `No alternative within the detour limits scores at least ${Math.round(E.MIN_GAIN)} points higher than the fastest route, so only the fastest route is shown.`
      : null;

  const out = picks.map(([label, c]) => {
    const detail = scoreRoute(d, c.pieces, bandI, true).details;
    const coords: number[][] = [];
    for (const p of c.pieces) {
      for (let k = 0; k < p.ll.length; k += 2) coords.push([rnd(p.ll[k], 6), rnd(p.ll[k + 1], 6)]);
    }
    return {
      ...c.res,
      details: detail,
      label,
      detour_minutes: rnd(((c.res.length_m as number) - L0) / C.WALK_M_PER_MIN, 1),
      geometry: { type: "LineString", coordinates: coords },
    };
  });
  return {
    band,
    hour,
    start: { snapped_lat: d.nodeLL[2 * src + 1], snapped_lon: d.nodeLL[2 * src], snap_m: Math.round(dS) },
    end: { snapped_lat: d.nodeLL[2 * dst + 1], snapped_lon: d.nodeLL[2 * dst], snap_m: Math.round(dE) },
    routes: out,
    note,
    candidates_tried: cands.length,
  };
}

export function help(d: Data, lat: number, lon: number, hour: number, perKind = 3) {
  const E = d.cfg.engine;
  const bandI = bandOfHour(d, hour);
  const [x, y] = toXY(lon, lat);
  const out: Record<string, any[]> = {};
  for (const kind of E.HELP_KINDS as string[]) {
    const idx = d.helpPlaces[kind];
    const order = Array.from(idx, (g) => ({ g, dist: Math.hypot(d.plXY[2 * g] - x, d.plXY[2 * g + 1] - y) }))
      .sort((a, c) => a.dist - c.dist)
      .slice(0, Math.min(15, idx.length));
    const kept: number[] = [];
    const rows: any[] = [];
    for (const { g, dist } of order) {
      const gx = d.plXY[2 * g];
      const gy = d.plXY[2 * g + 1];
      // the same place is often mapped twice: skip anything within 150 m of one already listed
      if (kept.some((k) => Math.hypot(d.plXY[2 * k] - gx, d.plXY[2 * k + 1] - gy) < E.HELP_DEDUPE_M)) continue;
      kept.push(g);
      rows.push({
        name: d.plNames[g] ? d.plNames[g] : null,
        lat: d.plLL[2 * g + 1],
        lon: d.plLL[2 * g],
        m: Math.round(dist),
        p: rnd(d.plOpen[g * 3 + bandI], 2),
        c: d.plIsConf[g] === 1,
      });
      if (rows.length === perKind) break;
    }
    out[kind] = rows;
  }
  return { band: d.bandNames[bandI], hour, ...out };
}

export function search(d: Data, q: string, lat?: number, lon?: number, limit = 8) {
  const qn = q.toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, " ").replace(/\s+/g, " ").trim();
  const S = d.search;
  if (qn.length < 2 || !S.norm.length) return [];
  const toks = qn.split(" ");
  const hits: { i: number; score: number }[] = [];
  for (let i = 0; i < S.norm.length; i++) {
    const nm = S.norm[i];
    let ok = true;
    for (const t of toks) {
      if (!nm.includes(t)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let score = 30;
    if (toks.every((t) => nm.startsWith(t) || nm.includes(" " + t))) score = 60;
    if (nm.startsWith(qn)) score = 80;
    if (nm === qn) score = 100;
    score += S.kw[i];
    if (lat !== undefined && lon !== undefined) {
      const dKm = Math.hypot((S.lat[i] - lat) * 111, (S.lon[i] - lon) * 97);
      score -= Math.min(dKm * 1.5, 25);
    }
    hits.push({ i, score });
  }
  hits.sort((a, c) => c.score - a.score);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const { i } of hits) {
    const key = S.norm[i] + "\u0000" + S.kind[i];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: S.name[i],
      kind: S.kind[i],
      label: d.cfg.engine.KIND_LABEL[S.kind[i]] ?? S.kind[i],
      lat: S.lat[i],
      lon: S.lon[i],
    });
    if (out.length === limit) break;
  }
  return out;
}

