import type { Data } from "./data";

/** Binary min-heap of (key, value) pairs, with lazy deletion (stale entries are skipped when popped). */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, v: number) {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): [number, number] {
    const keys = this.keys;
    const vals = this.vals;
    const k0 = keys[0];
    const v0 = vals[0];
    const k = keys.pop() as number;
    const v = vals.pop() as number;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return [k0, v0];
  }
}

export interface Path {
  nodes: number[];
  edges: number[];
}

/**
 * Cheapest path from src to dst. Like scipy's dijkstra(limit=...), nodes further than `limit` are never reached,
 * so null comes back when dst is not within it.
 */
export function shortestPath(d: Data, src: number, dst: number, cost: Float64Array, limit: number): Path | null {
  const n = d.nodeCount;
  const dist = new Float64Array(n).fill(Infinity);
  const predNode = new Int32Array(n).fill(-1);
  const predEdge = new Int32Array(n).fill(-1);
  const heap = new Heap();
  dist[src] = 0;
  heap.push(0, src);
  while (heap.size) {
    const [du, u] = heap.pop();
    if (du > dist[u]) continue;
    if (u === dst) break;
    for (let t = d.adjStart[u]; t < d.adjStart[u + 1]; t++) {
      const v = d.adjTo[t];
      const e = d.adjEdge[t];
      const nd = du + cost[e];
      if (nd > limit || nd >= dist[v]) continue;
      dist[v] = nd;
      predNode[v] = u;
      predEdge[v] = e;
      heap.push(nd, v);
    }
  }
  if (!Number.isFinite(dist[dst])) return null;
  const nodes = [dst];
  const edges: number[] = [];
  let cur = dst;
  while (cur !== src) {
    edges.push(predEdge[cur]);
    cur = predNode[cur];
    nodes.push(cur);
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() };
}
