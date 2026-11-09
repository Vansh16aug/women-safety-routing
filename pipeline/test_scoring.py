"""M2 checks for the route scorer, on real Delhi data.

Usage: python -I test_scoring.py <processed dir> <out json>

Builds small street graphs (Karol Bagh and an outer-Delhi area near Najafgarh), draws random
walking routes, scores them for each time band, and checks that the scores behave sensibly.
There is no ground truth, so these are plausibility checks, not validation.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import networkx as nx
import numpy as np
import pandas as pd

import config as C
from scoring import BAND_NAMES, Scorer, parse_wkt

processed = Path(sys.argv[1])
out_json = Path(sys.argv[2])
rng = np.random.default_rng(7)

AREAS = {
    "karol_bagh": (28.630, 77.165, 28.670, 77.220),
    "najafgarh_outer": (28.585, 76.950, 28.625, 77.000),
}

cols = ["seg_id", "u", "v", "highway", "is_main_road", "length_m", "geom_wkt", "mid_lat", "mid_lon",
        "name", "open_exp_night"]
segs = pd.read_parquet(processed / "segments.parquet", columns=cols)
scorer = Scorer(processed)


def build_graph(box):
    s, w, n, e = box
    sub = segs[segs.mid_lat.between(s, n) & segs.mid_lon.between(w, e)]
    G = nx.Graph()
    for r in sub.itertuples(index=False):
        if G.has_edge(r.u, r.v) and G[r.u][r.v]["length"] <= r.length_m:
            continue
        G.add_edge(r.u, r.v, length=float(r.length_m), main=bool(r.is_main_road), u=r.u,
                   coords=parse_wkt(r.geom_wkt), night=float(r.open_exp_night), name=r.name)
    comp = max(nx.connected_components(G), key=len)
    return G.subgraph(comp).copy()


def pieces_for(G, path):
    out = []
    for a, b in zip(path[:-1], path[1:]):
        d = G[a][b]
        coords = d["coords"] if d["u"] == a else d["coords"][::-1]
        out.append((coords, d["main"]))
    return out


def path_len(G, path):
    return sum(G[a][b]["length"] for a, b in zip(path[:-1], path[1:]))


def random_routes(G, n, lo=500, hi=1500):
    nodes = list(G.nodes)
    routes, tries = [], 0
    while len(routes) < n and tries < 4000:
        tries += 1
        a, b = rng.choice(len(nodes), 2, replace=False)
        try:
            p = nx.shortest_path(G, nodes[a], nodes[b], weight="length")
        except nx.NetworkXNoPath:
            continue
        if lo <= path_len(G, p) <= hi:
            routes.append(p)
    return routes


results, checks = {}, []


def check(name, ok, detail=""):
    checks.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


graphs = {k: build_graph(v) for k, v in AREAS.items()}
for k, G in graphs.items():
    print(f"{k}: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges", flush=True)

# 1. random routes per area and band
for area, G in graphs.items():
    routes = random_routes(G, 40)
    res = {bn: [] for bn in BAND_NAMES}
    for p in routes:
        pcs = pieces_for(G, p)
        for bn in BAND_NAMES:
            res[bn].append(scorer.score(pcs, bn)["score"])
    results[area] = {"n_routes": len(routes),
                     **{bn: {"mean": round(float(np.mean(v)), 1), "min": round(float(np.min(v)), 1),
                             "max": round(float(np.max(v)), 1)} for bn, v in res.items()}}
    results[area]["_raw"] = res
    print(area, {bn: results[area][bn] for bn in BAND_NAMES}, flush=True)

kb, ou = results["karol_bagh"], results["najafgarh_outer"]
allv = [x for a in results.values() for bn in BAND_NAMES for x in a["_raw"][bn]]
check("all scores within 0-100", min(allv) >= 0 and max(allv) <= 100, f"min {min(allv)}, max {max(allv)}")
night_lower = np.mean(np.array(kb["_raw"]["night"]) < np.array(kb["_raw"]["day"]))
check("Karol Bagh: night score below day score on at least 90% of routes", night_lower >= 0.9, f"{night_lower:.0%}")
check("Karol Bagh scores above outer-Delhi scores at night (mean)", kb["night"]["mean"] > ou["night"]["mean"],
      f"{kb['night']['mean']} vs {ou['night']['mean']}")
check("Karol Bagh scores above outer-Delhi scores by day (mean)", kb["day"]["mean"] > ou["day"]["mean"],
      f"{kb['day']['mean']} vs {ou['day']['mean']}")

# 2. reversing a route gives the same score
G = graphs["karol_bagh"]
p = random_routes(G, 1)[0]
a = scorer.score(pieces_for(G, p), "night")["score"]
b = scorer.score(pieces_for(G, p[::-1]), "night")["score"]
check("reversed route gives the same score", abs(a - b) < 0.2, f"{a} vs {b}")

# 3. removing every place sends the place-driven points to zero
saved = scorer.pl_open.copy()
full = scorer.score(pieces_for(G, p), "evening")
scorer.pl_open = np.zeros_like(saved)
empty = scorer.score(pieces_for(G, p), "evening")
scorer.pl_open = saved
check("no open places: open_places and gaps points are zero",
      empty["points"]["open_places"] == 0 and empty["points"]["gaps"] == 0,
      f"{empty['points']['open_places']}, {empty['points']['gaps']}")
check("no open places: score is lower", empty["score"] < full["score"], f"{empty['score']} vs {full['score']}")

# 4. two routes, same pair: shortest versus main-road-preferring versus activity-preferring
nodes = list(G.nodes)
compare = []
for _ in range(200):
    a_, b_ = rng.choice(len(nodes), 2, replace=False)
    try:
        sp = nx.shortest_path(G, nodes[a_], nodes[b_], weight="length")
    except nx.NetworkXNoPath:
        continue
    L = path_len(G, sp)
    if not 700 <= L <= 1500:
        continue
    for d in G.edges.values():
        d["w_act"] = d["length"] * (1 + 2.0 * (d["night"] < 1.0))
    ap = nx.shortest_path(G, nodes[a_], nodes[b_], weight="w_act")
    if ap == sp:
        continue
    s1, s2 = scorer.score(pieces_for(G, sp), "night"), scorer.score(pieces_for(G, ap), "night")
    compare.append({"shortest_m": round(path_len(G, sp)), "activity_m": round(path_len(G, ap)),
                    "shortest_score": s1["score"], "activity_score": s2["score"],
                    "d_points": {k: s2["points"][k] - s1["points"][k] for k in s1["points"]},
                    "shortest_longest_gap_m": s1["raw"]["longest_gap_m"], "activity_longest_gap_m": s2["raw"]["longest_gap_m"]})
    if len(compare) >= 25:
        break
if compare:
    df = pd.DataFrame(compare)
    better = float((df.activity_score > df.shortest_score).mean())
    detour = float((df.activity_m / df.shortest_m).mean())
    check("routes that avoid low-activity segments usually score higher at night", better >= 0.7,
          f"{better:.0%} of {len(df)} pairs; mean detour {detour:.2f}x")
    dp = pd.DataFrame(list(df["d_points"]))
    worse = df.activity_score <= df.shortest_score
    results["route_pairs"] = {"n": len(df), "share_activity_route_higher": round(better, 2),
                              "mean_detour_ratio": round(detour, 2),
                              "mean_point_change_all_pairs": {k: round(float(v), 2) for k, v in dp.mean().items()},
                              "mean_point_change_where_lower": {k: round(float(v), 2) for k, v in dp[worse.values].mean().items()} if worse.any() else {}}
    print("mean change in points (activity route minus shortest), all pairs:", results["route_pairs"]["mean_point_change_all_pairs"], flush=True)
    print("same, only pairs where the activity route scored lower:", results["route_pairs"]["mean_point_change_where_lower"], flush=True)
else:
    check("routes that avoid low-activity segments usually score higher at night", False, "no distinct pairs found")

# 5. one worked example
ex = random_routes(G, 1, 900, 1400)[0]
results["example_karol_bagh"] = {bn: scorer.score(pieces_for(G, ex), bn) for bn in BAND_NAMES}
print(json.dumps(results["example_karol_bagh"]["night"], indent=1), flush=True)

for a in results.values():
    if isinstance(a, dict) and "_raw" in a:
        del a["_raw"]
out_json.write_text(json.dumps({"results": results, "checks": checks}, indent=1))
print(f"{sum(c['ok'] for c in checks)}/{len(checks)} checks passed; wrote {out_json}")
sys.exit(0 if all(c["ok"] for c in checks) else 1)
