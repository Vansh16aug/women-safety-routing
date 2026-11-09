import fs from "node:fs";
import path from "node:path";
import { Grid } from "./geo";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Config = Record<string, any> & {
  BANDS: [string, number, number][];
  SCORE_WEIGHTS: Record<string, number>;
  engine: Record<string, any>;
  kinds: string[];
};

const DIR = path.join(process.cwd(), "data", "runtime");

function raw(name: string): Buffer {
  return fs.readFileSync(path.join(DIR, name));
}
// Copy into a fresh ArrayBuffer: Buffer slices from the pool are not always aligned for 8-byte views.
function ab(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
const f64 = (n: string) => new Float64Array(ab(raw(n)));
const i32 = (n: string) => new Int32Array(ab(raw(n)));
const u8 = (n: string) => new Uint8Array(ab(raw(n)));
const json = <T = any>(n: string): T => JSON.parse(raw(n).toString("utf8"));

export interface Data {
  cfg: Config;
  bandNames: string[];
  // graph (compact node ids)
  nodeCount: number;
  nodeXY: Float64Array;
  nodeLL: Float64Array;
  nodeGrid: Grid;
  edgeCount: number;
  segU: Int32Array;
  segV: Int32Array;
  segLen: Float64Array;
  segMain: Uint8Array;
  segOpen: Float64Array[]; // per band
  geomOff: Int32Array;
  geom: Int32Array; // lon, lat as degrees * 1e7
  adjStart: Int32Array;
  adjTo: Int32Array;
  adjEdge: Int32Array;
  pen: Float64Array[]; // per band, per edge
  // places
  plXY: Float64Array;
  plLL: Float64Array;
  plOpen: Float64Array; // 3 per place
  plConf: Uint8Array;
  plIsConf: Uint8Array;
  plKind: Uint8Array;
  plNames: string[];
  plGrid: Grid;
  helpIdx: Int32Array; // places whose kind counts as help for the score
  helpGrid: Grid;
  helpPlaces: Record<string, Int32Array>; // police, hospital for "Help near me"
  // point sets
  lampGrid: Grid;
  cctvGrid: Grid;
  busGrid: Grid;
  metroXY: Float64Array;
  metroGrid: Grid;
  stationXY: Float64Array;
  stationNames: string[];
  search: { name: string[]; kind: string[]; lat: number[]; lon: number[]; norm: string[]; kw: number[] };
}

let cached: Data | null = null;

export function loadData(): Data {
  if (cached) return cached;
  const cfg = json<Config>("config.json");
  const bandNames = cfg.BANDS.map((b) => b[0]);

  const nodeXY = f64("node_xy.f64");
  const nodeLL = f64("node_ll.f64");
  const nodeCount = nodeXY.length >> 1;
  const segU = i32("seg_u.i32");
  const segV = i32("seg_v.i32");
  const edgeCount = segU.length;
  const segLen = f64("seg_len.f64");
  const segMain = u8("seg_main.u8");
  const segOpen = bandNames.map((b) => f64(`seg_open_${b}.f64`));

  // adjacency (CSR): for every node, the neighbour and the edge id
  const deg = new Int32Array(nodeCount + 1);
  for (let e = 0; e < edgeCount; e++) {
    deg[segU[e] + 1]++;
    deg[segV[e] + 1]++;
  }
  for (let i = 0; i < nodeCount; i++) deg[i + 1] += deg[i];
  const adjStart = deg;
  const fill = adjStart.slice(0, nodeCount);
  const adjTo = new Int32Array(edgeCount * 2);
  const adjEdge = new Int32Array(edgeCount * 2);
  for (let e = 0; e < edgeCount; e++) {
    const u = segU[e];
    const v = segV[e];
    adjTo[fill[u]] = v;
    adjEdge[fill[u]++] = e;
    adjTo[fill[v]] = u;
    adjEdge[fill[v]++] = e;
  }

  // street penalty per band: 0.7 * (1 - activity) + 0.3 * (not a main road)
  const pen = segOpen.map((open) => {
    const p = new Float64Array(edgeCount);
    for (let e = 0; e < edgeCount; e++) {
      const act = 1 - Math.exp(-open[e] / 2);
      p[e] = 0.7 * (1 - act) + 0.3 * (segMain[e] ? 0 : 1);
    }
    return p;
  });

  const plXY = f64("pl_xy.f64");
  const plKind = u8("pl_kind.u8");
  const helpKindCodes = new Set<number>();
  for (const k of cfg.HELP_KINDS as string[]) {
    const c = cfg.kinds.indexOf(k);
    if (c >= 0) helpKindCodes.add(c);
  }
  const helpList: number[] = [];
  for (let i = 0; i < plKind.length; i++) if (helpKindCodes.has(plKind[i])) helpList.push(i);
  const helpIdx = Int32Array.from(helpList);
  const helpXY = new Float64Array(helpIdx.length * 2);
  helpIdx.forEach((g, j) => {
    helpXY[2 * j] = plXY[2 * g];
    helpXY[2 * j + 1] = plXY[2 * g + 1];
  });

  const metroXY = f64("metro_xy.f64");
  cached = {
    cfg,
    bandNames,
    nodeCount,
    nodeXY,
    nodeLL,
    nodeGrid: new Grid(nodeXY, 200),
    edgeCount,
    segU,
    segV,
    segLen,
    segMain,
    segOpen,
    geomOff: i32("seg_geom_off.i32"),
    geom: i32("seg_geom.i32"),
    adjStart,
    adjTo,
    adjEdge,
    pen,
    plXY,
    plLL: f64("pl_ll.f64"),
    plOpen: f64("pl_open.f64"),
    plConf: u8("pl_conf.u8"),
    plIsConf: u8("pl_isconf.u8"),
    plKind,
    plNames: json<string[]>("pl_names.json"),
    plGrid: new Grid(plXY, 250),
    helpIdx,
    helpGrid: new Grid(helpXY, 250),
    helpPlaces: { police: i32("help_police.i32"), hospital: i32("help_hospital.i32") },
    lampGrid: new Grid(f64("lamps_xy.f64"), 250),
    cctvGrid: new Grid(f64("cctv_xy.f64"), 250),
    busGrid: new Grid(f64("bus_xy.f64"), 250),
    metroXY,
    metroGrid: new Grid(metroXY, 250),
    stationXY: f64("station_xy.f64"),
    stationNames: json<string[]>("station_names.json"),
    search: json("search.json"),
  };
  return cached;
}

/** Whole-file text for a prebuilt layer (a JSON array or GeoJSON) so large payloads are not parsed and re-serialised. */
const layerCache = new Map<string, string>();
export function layerText(name: string): string {
  let t = layerCache.get(name);
  if (t === undefined) {
    t = raw(`layers/${name}.json`).toString("utf8");
    layerCache.set(name, t);
  }
  return t;
}
