import proj4 from "proj4";

// The Python engine works in UTM zone 43N (EPSG:32643), in metres. Same projection here.
proj4.defs("EPSG:32643", "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs +type=crs");
const conv = proj4("EPSG:4326", "EPSG:32643");

export function toXY(lon: number, lat: number): [number, number] {
  const r = conv.forward([lon, lat]);
  return [r[0], r[1]];
}

export function fromXY(x: number, y: number): [number, number] {
  const r = conv.inverse([x, y]);
  return [r[0], r[1]];
}

/** Python-style round(x, n) for display values. */
export function rnd(x: number, n = 0): number {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

const KEY = 131072;

/**
 * A uniform grid over points given as interleaved metres [x0, y0, x1, y1, ...].
 * Stands in for scipy's cKDTree: radius queries and nearest-point queries.
 */
export class Grid {
  readonly xy: Float64Array;
  readonly n: number;
  private readonly cell: number;
  private readonly cells = new Map<number, number[]>();

  constructor(xy: Float64Array, cell: number) {
    this.xy = xy;
    this.n = xy.length >> 1;
    this.cell = cell;
    for (let i = 0; i < this.n; i++) {
      const k = Math.floor(xy[2 * i] / cell) * KEY + Math.floor(xy[2 * i + 1] / cell);
      const b = this.cells.get(k);
      if (b) b.push(i);
      else this.cells.set(k, [i]);
    }
  }

  /** Sorted indices of points within `r` metres (inclusive) of any of `pts`. */
  ballAny(pts: ArrayLike<number>, r: number): number[] {
    const hit = new Set<number>();
    const r2 = r * r;
    const reach = Math.ceil(r / this.cell);
    const { xy, cell, cells } = this;
    for (let p = 0; p < pts.length; p += 2) {
      const px = pts[p];
      const py = pts[p + 1];
      const cx = Math.floor(px / cell);
      const cy = Math.floor(py / cell);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          const b = cells.get((cx + dx) * KEY + (cy + dy));
          if (!b) continue;
          for (let t = 0; t < b.length; t++) {
            const i = b[t];
            if (hit.has(i)) continue;
            const ex = xy[2 * i] - px;
            const ey = xy[2 * i + 1] - py;
            if (ex * ex + ey * ey <= r2) hit.add(i);
          }
        }
      }
    }
    return Array.from(hit).sort((a, b) => a - b);
  }

  /** Index of the closest point and its distance; [-1, Infinity] when the grid is empty. */
  nearest(x: number, y: number, maxRing = 6000): [number, number] {
    if (this.n === 0) return [-1, Infinity];
    const { xy, cell, cells } = this;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let best = Infinity;
    let bi = -1;
    for (let ring = 0; ring <= maxRing; ring++) {
      if (bi >= 0 && (ring - 1) * cell >= best) break;
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const b = cells.get((cx + dx) * KEY + (cy + dy));
          if (!b) continue;
          for (let t = 0; t < b.length; t++) {
            const i = b[t];
            const ex = xy[2 * i] - x;
            const ey = xy[2 * i + 1] - y;
            const d = Math.hypot(ex, ey);
            if (d < best) {
              best = d;
              bi = i;
            }
          }
        }
      }
    }
    return [bi, best];
  }
}
