"""M3 + M4 server: routes and scores walking routes across Delhi, and serves the web page.

Usage: python -I server.py --processed <data/processed> --web <web dir> [--port 8765]

GET /api/info                          settings the page needs (bounds, weights, wording)
GET /api/route?slat=&slon=&elat=&elon=&hour=   candidate routes, each with a Night Activity Score

Routing: the street segments from M1 form an undirected graph. For several detour settings (alpha) the
cost of a segment is length * (1 + alpha * penalty), where penalty is higher on low-activity and
non-main-road segments. Every candidate is then scored with the full route scorer, and the page gets
the fastest route plus the best-scoring routes within two detour limits.
It is an activity estimate, not a safety rating. Everything runs on this machine.
"""
import argparse
import json
import re
import os
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

import config as C
from scoring import BAND_NAMES, Scorer, band_of_hour, parse_wkt

ALPHAS = [0.0, 0.5, 1.0, 2.0, 4.0]
DELHI_BOX = (28.40, 76.83, 28.89, 77.35)  # S, W, N, E (bounding box of the NCT boundary)
BALANCED_MAX_RATIO = 1.25
ACTIVE_MAX_RATIO = 1.6
MAX_STRAIGHT_M = 15000
HELP_KINDS = ("police", "hospital")
EXPLORE_KINDS = ("pharmacy", "atm", "fuel", "hospital", "police", "hotel", "bank", "worship", "metro")
OVERLAYS = {"bus": "bus_stops", "cctv": "cctv", "lamps": "lamps"}   # name on the map -> parquet file with lat, lon
HELP_DEDUPE_M = 150
MIN_GAIN = 2.0   # an alternative is shown only if it scores at least this many points above the fastest route
_TO_XY = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)

# search ranking: how much a kind of result is favoured when the match quality is equal
KIND_WEIGHT = {"station": 20, "area": 15, "landmark": 10, "street": 6, "place": 0}
KIND_LABEL = {"station": "Station", "area": "Area", "landmark": "Landmark", "street": "Street", "place": "Place"}


class Engine:
    def __init__(self, processed):
        t0 = time.time()
        d = Path(processed)
        cols = ["seg_id", "u", "v", "length_m", "is_main_road", "geom_wkt",
                "open_exp_day", "open_exp_evening", "open_exp_night"]
        seg = pd.read_parquet(d / "segments.parquet", columns=cols)
        seg = seg[seg.u != seg.v].copy()
        nodes = pd.read_parquet(d / "nodes.parquet")
        ref_to_i = {r: i for i, r in enumerate(nodes["ref"].values)}
        seg["ui"] = seg["u"].map(ref_to_i)
        seg["vi"] = seg["v"].map(ref_to_i)
        seg = seg.dropna(subset=["ui", "vi"])
        seg["ui"], seg["vi"] = seg["ui"].astype(np.int64), seg["vi"].astype(np.int64)
        a = np.minimum(seg.ui, seg.vi)
        b = np.maximum(seg.ui, seg.vi)
        seg["key"] = a * (len(nodes) + 1) + b
        seg = seg.sort_values("length_m").drop_duplicates("key").reset_index(drop=True)

        n = len(nodes)
        m = csr_matrix((np.ones(len(seg)), (seg.ui.values, seg.vi.values)), shape=(n, n))
        _, lab = connected_components(m, directed=False)
        biggest = np.bincount(lab).argmax()
        in_comp = lab == biggest
        seg = seg[in_comp[seg.ui.values] & in_comp[seg.vi.values]].reset_index(drop=True)
        self.nodes = nodes
        self.in_comp = in_comp
        self.seg = seg
        self.n = n

        xy = np.column_stack(_TO_XY.transform(nodes["lon"].values, nodes["lat"].values))
        self.node_xy = xy
        idx = np.where(in_comp)[0]
        self.snap_idx = idx
        self.snap_tree = cKDTree(xy[idx])

        length = seg["length_m"].values.astype(float)
        main = seg["is_main_road"].values.astype(bool)
        self.length = length
        self.pen = {}
        for bn in BAND_NAMES:
            act = 1.0 - np.exp(-seg[f"open_exp_{bn}"].values.astype(float) / 2.0)
            self.pen[bn] = 0.7 * (1.0 - act) + 0.3 * (~main)
        self.ui, self.vi = seg.ui.values, seg.vi.values
        self.edge_of = {}
        for e, (x, y) in enumerate(zip(self.ui, self.vi)):
            self.edge_of[(x, y)] = e
            self.edge_of[(y, x)] = e
        self.scorer = Scorer(processed)
        sp = d / "search.parquet"
        self.search_df = pd.read_parquet(sp) if sp.exists() else pd.DataFrame(
            columns=["name", "kind", "lat", "lon", "name_norm"])
        self.search_df["kw"] = self.search_df["kind"].map(KIND_WEIGHT).fillna(0)
        # nearest-help lookup: police stations and hospitals (dentists, clinics and the like are not hospitals)
        pl = self.scorer.pl
        self.help_places = {}
        for kind in HELP_KINDS:
            keep = (pl["kind"] == kind).to_numpy(copy=True)
            if kind == "hospital":
                names = pl["name"].fillna("")
                keep &= names.map(lambda s: bool(re.search(C.HELP_HOSPITAL_RE, s, re.I))).to_numpy()
                keep &= ~names.map(lambda s: bool(re.search(C.POI_NOT_HOSPITAL_RE, s, re.I))).to_numpy()
            idx = np.where(keep)[0]
            self.help_places[kind] = (idx, cKDTree(self.scorer.pl_xy[idx]))
        self.processed, self._overlay_cache = d, {}
        self.explore_pts = self._build_explore()
        print(f"engine ready: {len(seg)} segments, {int(in_comp.sum())} nodes in main component, "
              f"{time.time() - t0:.1f}s", flush=True)

    def _build_explore(self):
        """Per kind of place, the arrays the map's category chips draw from (browse places in view, no route needed)."""
        pl, out = self.scorer.pl, {}
        names = pl["name"].fillna("")
        for kind in EXPLORE_KINDS:
            if kind == "metro":
                continue
            keep = (pl["kind"] == kind).to_numpy(copy=True)
            if kind == "hospital":
                keep &= names.map(lambda s: bool(re.search(C.HELP_HOSPITAL_RE, s, re.I))).to_numpy()
            sub = pl[keep]
            out[kind] = {"lat": sub["lat"].to_numpy(), "lon": sub["lon"].to_numpy(), "name": sub["name"].fillna("").tolist(),
                         "p": sub[["open_day", "open_evening", "open_night"]].to_numpy(dtype=float),
                         "c": sub["is_conf"].to_numpy().astype(bool)}
        # metro stations come from the named station list, one point per station (gates are merged by name)
        sd = self.search_df[self.search_df["kind"] == "station"].copy()
        sd["key"] = sd["name"].str.lower().str.replace(r"\s*(metro\s*)?(station\s*)?gate.*$", "", regex=True).str.strip()
        sd = sd.drop_duplicates("key")
        out["metro"] = {"lat": sd["lat"].to_numpy(), "lon": sd["lon"].to_numpy(),
                        "name": sd["name"].str.replace(r"\s*(metro\s*)?(station\s*)?gate.*$", "", regex=True, case=False).tolist(),
                        "p": np.tile(np.array(C.METRO_OPEN, dtype=float), (len(sd), 1)), "c": np.zeros(len(sd), dtype=bool)}
        return out

    def places_all(self, kind):
        """Every place of one kind in Delhi, as [lon, lat, name, open_day, open_evening, open_night, confirmed] rows.
        The page clusters them, so the whole city can be shown at once."""
        d = self.explore_pts[kind]
        return [[round(float(d["lon"][i]), 5), round(float(d["lat"][i]), 5), d["name"][i] or None,
                 round(float(d["p"][i, 0]), 2), round(float(d["p"][i, 1]), 2), round(float(d["p"][i, 2]), 2), int(d["c"][i])]
                for i in range(len(d["lat"]))]

    def metro_lines(self):
        """The coloured metro and RapidX lines (built by build_metro_lines.py), or an empty set if that file is missing."""
        if "metro_lines" not in self._overlay_cache:
            f = self.processed / "metro_lines.geojson"
            self._overlay_cache["metro_lines"] = json.loads(f.read_text(encoding="utf8")) if f.exists() else {"type": "FeatureCollection", "features": []}
        return self._overlay_cache["metro_lines"]

    def overlay_points(self, name):
        """Bus stops, cameras or street lamps as [lon, lat] pairs."""
        if name not in self._overlay_cache:
            df = pd.read_parquet(self.processed / (OVERLAYS[name] + ".parquet"), columns=["lat", "lon"])
            self._overlay_cache[name] = [[round(float(x), 5), round(float(y), 5)] for x, y in zip(df["lon"], df["lat"])]
        return self._overlay_cache[name]

    def help(self, lat, lon, hour, per_kind=3):
        """The closest police stations and hospitals to a point, as straight-line distances."""
        band = BAND_NAMES[band_of_hour(hour)]
        x, y = _TO_XY.transform(lon, lat)
        pl, out = self.scorer.pl, {}
        for kind, (idx, tree) in self.help_places.items():
            dist, j = tree.query([x, y], k=min(15, len(idx)))
            kept, rows = [], []
            for d, jj in zip(dist, j):
                i = idx[jj]
                xy = self.scorer.pl_xy[i]
                # the same place is often mapped twice: skip anything within 150 m of one already listed
                if any(np.hypot(*(xy - k)) < HELP_DEDUPE_M for k in kept):
                    continue
                kept.append(xy)
                r = pl.iloc[i]
                rows.append({"name": r["name"] if isinstance(r["name"], str) and r["name"] else None,
                             "lat": float(r["lat"]), "lon": float(r["lon"]), "m": round(float(d)),
                             "p": round(float(r[f"open_{band}"]), 2), "c": bool(r["is_conf"])})
                if len(rows) == per_kind:
                    break
            out[kind] = rows
        return {"band": band, "hour": hour, **out}

    def search(self, q, lat=None, lon=None, limit=8):
        """Search names of stations, areas, landmarks, streets and places in the loaded data."""
        qn = re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", q.lower())).strip()
        if len(qn) < 2 or self.search_df.empty:
            return []
        df = self.search_df
        toks = qn.split()
        mask = np.ones(len(df), dtype=bool)
        for t in toks:
            mask &= df["name_norm"].str.contains(re.escape(t), regex=True).values
        m = df[mask]
        if m.empty:
            return []
        names = m["name_norm"]
        score = np.full(len(m), 30.0)
        word_start = np.ones(len(m), dtype=bool)
        for t in toks:
            word_start &= names.str.contains(r"(?:^|\s)" + re.escape(t), regex=True).values
        score[word_start] = 60.0
        score[names.str.startswith(qn).values] = 80.0
        score[(names == qn).values] = 100.0
        score += m["kw"].values
        if lat is not None and lon is not None:
            d_km = np.hypot((m["lat"].values - lat) * 111.0, (m["lon"].values - lon) * 97.0)
            score -= np.minimum(d_km * 1.5, 25.0)
        m = m.assign(score=score).sort_values("score", ascending=False)
        m = m.drop_duplicates(["name_norm", "kind"]).head(limit)
        return [{"name": r.name, "kind": r.kind, "label": KIND_LABEL.get(r.kind, r.kind),
                 "lat": float(r.lat), "lon": float(r.lon)} for r in m.itertuples()]

    def snap(self, lat, lon):
        x, y = _TO_XY.transform(lon, lat)
        dist, j = self.snap_tree.query([x, y])
        return int(self.snap_idx[j]), float(dist)

    def _path(self, src, dst, band, alpha, straight):
        cost = self.length * (1.0 + alpha * self.pen[band])
        g = csr_matrix((np.concatenate([cost, cost]),
                        (np.concatenate([self.ui, self.vi]), np.concatenate([self.vi, self.ui]))),
                       shape=(self.n, self.n))
        limit = (1.0 + alpha) * (3.0 * straight + 1500.0)
        dist, pred = dijkstra(g, directed=True, indices=src, return_predecessors=True, limit=limit)
        if not np.isfinite(dist[dst]):
            return None
        path = [dst]
        while path[-1] != src:
            path.append(int(pred[path[-1]]))
        return path[::-1]

    def _pieces(self, path):
        pieces, edges = [], []
        for a, b in zip(path[:-1], path[1:]):
            e = self.edge_of[(a, b)]
            coords = parse_wkt(self.seg.geom_wkt.iat[e])
            if self.ui[e] != a:
                coords = coords[::-1]
            pieces.append((coords, bool(self.seg.is_main_road.iat[e])))
            edges.append(e)
        return pieces, edges

    def routes(self, slat, slon, elat, elon, hour):
        band_i = band_of_hour(hour)
        band = BAND_NAMES[band_i]
        src, d_s = self.snap(slat, slon)
        dst, d_e = self.snap(elat, elon)
        if src == dst:
            raise ValueError("start and end snap to the same junction; pick points further apart")
        straight = float(np.hypot(*(self.node_xy[src] - self.node_xy[dst])))
        if straight > MAX_STRAIGHT_M:
            raise ValueError(f"points are {straight / 1000:.1f} km apart; this demo handles up to {MAX_STRAIGHT_M // 1000} km")
        cands, seen = [], {}
        for alpha in ALPHAS:
            path = self._path(src, dst, band, alpha, straight)
            if path is None:
                continue
            key = tuple(path)
            if key in seen:
                continue
            pieces, edges = self._pieces(path)
            res = self.scorer.score(pieces, band_i)
            res["alpha"] = alpha
            res["_pieces"] = pieces
            seen[key] = len(cands)
            cands.append(res)
        if not cands:
            raise ValueError("no walking route found between these points")
        fastest = min(cands, key=lambda r: r["length_m"])
        L0 = fastest["length_m"]

        def best(max_ratio):
            ok = [r for r in cands if r["length_m"] <= max_ratio * L0]
            return max(ok, key=lambda r: (r["score"], -r["length_m"]))

        picks = [("Fastest", fastest)]
        balanced, active = best(BALANCED_MAX_RATIO), best(ACTIVE_MAX_RATIO)
        for label, r in (("Balanced", balanced), ("Most active", active)):
            if r["score"] >= fastest["score"] + MIN_GAIN and all(r is not p[1] for p in picks):
                picks.append((label, r))
        note = None
        if len(picks) == 1:
            note = (f"No alternative within the detour limits scores at least {MIN_GAIN:.0f} points higher "
                    "than the fastest route, so only the fastest route is shown.")
        out = []
        for label, r in picks:
            coords = np.vstack([p[0] for p in r["_pieces"]])
            detail = self.scorer.score(r["_pieces"], band_i, details=True)["details"]
            r = {k: v for k, v in r.items() if k != "_pieces"}
            r["details"] = detail
            r["label"] = label
            r["detour_minutes"] = round((r["length_m"] - L0) / C.WALK_M_PER_MIN, 1)
            r["geometry"] = {"type": "LineString", "coordinates": [[round(x, 6), round(y, 6)] for x, y in coords]}
            out.append(r)
        # a route that is both fastest and best keeps the first label
        return {
            "band": band, "hour": hour,
            "start": {"snapped_lat": float(self.nodes["lat"].iat[src]), "snapped_lon": float(self.nodes["lon"].iat[src]), "snap_m": round(d_s)},
            "end": {"snapped_lat": float(self.nodes["lat"].iat[dst]), "snapped_lon": float(self.nodes["lon"].iat[dst]), "snap_m": round(d_e)},
            "routes": out,
            "note": note,
            "candidates_tried": len(cands),
        }


API_VERSION = "1"
META = {
    "version": API_VERSION,
    "type": "prototype",
    "disclaimer": "Night Activity Score is an activity estimate from public map data, NOT a safety rating. "
                  "Most opening hours are estimated from the type of place. Do not use it as the only input for a safety decision.",
    "attribution": "Street data (c) OpenStreetMap contributors (ODbL). Places also from Overture Maps Foundation.",
}
# requests allowed per client per minute: (light calls, whole-city data dumps)
LIMIT_LIGHT, LIMIT_HEAVY = 60, 10
HEAVY = ("/api/places", "/api/layer")


class Limiter:
    """Fixed one-minute window per client. In memory, so it resets on restart and is per process."""

    def __init__(self):
        self.lock = threading.Lock()
        self.hits = {}

    def check(self, client, heavy):
        now = time.time()
        limit = LIMIT_HEAVY if heavy else LIMIT_LIGHT
        key = (client, heavy)
        with self.lock:
            if len(self.hits) > 5000:
                self.hits = {k: v for k, v in self.hits.items() if now - v[0] < 60}
            start, n = self.hits.get(key, (now, 0))
            if now - start >= 60:
                start, n = now, 0
            n += 1
            self.hits[key] = (start, n)
            return (n <= limit), max(1, int(60 - (now - start))), limit, max(0, limit - n)


def make_handler(engine, web_dir, trust_proxy=False):
    web_dir = Path(web_dir).resolve()
    info = {
        "bounds": {"south": DELHI_BOX[0], "west": DELHI_BOX[1], "north": DELHI_BOX[2], "east": DELHI_BOX[3]},
        "weights": C.SCORE_WEIGHTS,
        "bands": [{"name": n, "start": s, "end": e} for n, s, e in C.BANDS],
        "disclaimer": "Night Activity Score is an activity estimate, not a safety rating. Most opening hours are estimated from the type of place.",
        "credits": "Street data (c) OpenStreetMap contributors (ODbL). Places also from Overture Maps Foundation (CDLA Permissive 2.0, Apache 2.0, CC0 by source).",
    }
    mime = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
            ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"}

    limiter = Limiter()
    spec_file = Path(__file__).resolve().parent.parent / "docs" / "openapi.json"

    class H(BaseHTTPRequestHandler):
        v1 = False
        rate = None

        def client(self):
            if trust_proxy:
                fwd = self.headers.get("X-Forwarded-For", "")
                if fwd:
                    return fwd.split(",")[0].strip()
            return self.client_address[0]

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, fmt, *args):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

        def _send(self, code, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            if self.v1:
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("X-Night-Routes-Disclaimer", "activity estimate, not a safety rating")
                if self.rate:
                    self.send_header("X-RateLimit-Limit", str(self.rate[0]))
                    self.send_header("X-RateLimit-Remaining", str(self.rate[1]))
            self.end_headers()
            self.wfile.write(data)

        def _ok(self, payload):
            if self.v1 and isinstance(payload, dict):
                payload = {**payload, "meta": META}
            return self._send(200, json.dumps(payload))

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            self.v1 = u.path.startswith("/api/v1/")
            if self.v1:
                u = u._replace(path="/api/" + u.path[len("/api/v1/"):])
                if u.path == "/api/health":
                    return self._send(200, json.dumps({"status": "ok", "meta": META}))
                if u.path == "/api/openapi.json":
                    if spec_file.is_file():
                        return self._send(200, spec_file.read_bytes())
                    return self._send(404, json.dumps({"error": "spec not found"}))
                okay, wait, limit, left = limiter.check(self.client(), u.path in HEAVY)
                self.rate = (limit, left)
                if not okay:
                    self.send_response(429)
                    body = json.dumps({"error": "rate limit exceeded", "retry_after_s": wait}).encode()
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Retry-After", str(wait))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(body)
                    return
            if u.path == "/api/info":
                return self._ok(info)
            if u.path == "/api/search":
                q = urllib.parse.parse_qs(u.query)
                try:
                    text = q.get("q", [""])[0][:80]
                    lat = float(q["lat"][0]) if "lat" in q else None
                    lon = float(q["lon"][0]) if "lon" in q else None
                except ValueError:
                    return self._send(400, json.dumps({"error": "bad coordinates"}))
                return self._ok({"results": engine.search(text, lat, lon)})
            if u.path == "/api/places":
                kind = urllib.parse.parse_qs(u.query).get("kind", [""])[0]
                if kind not in EXPLORE_KINDS:
                    return self._send(400, json.dumps({"error": "unknown kind"}))
                return self._ok({"kind": kind, "places": engine.places_all(kind)})
            if u.path == "/api/layer":
                name = urllib.parse.parse_qs(u.query).get("name", [""])[0]
                if name == "metro_lines":
                    return self._ok(engine.metro_lines())
                if name not in OVERLAYS:
                    return self._send(400, json.dumps({"error": "unknown layer"}))
                return self._ok({"name": name, "points": engine.overlay_points(name)})
            if u.path == "/api/help":
                q = urllib.parse.parse_qs(u.query)
                try:
                    lat, lon = float(q["lat"][0]), float(q["lon"][0])
                    hour = int(q.get("hour", ["22"])[0]) % 24
                    s, w, n, e = DELHI_BOX
                    if not (s <= lat <= n and w <= lon <= e):
                        raise ValueError("point is outside Delhi NCT")
                    return self._ok(engine.help(lat, lon, hour))
                except (KeyError, ValueError) as ex:
                    return self._send(400, json.dumps({"error": str(ex)}))
            if u.path == "/api/route":
                q = urllib.parse.parse_qs(u.query)
                try:
                    vals = [float(q[k][0]) for k in ("slat", "slon", "elat", "elon")]
                    hour = int(q.get("hour", ["22"])[0]) % 24
                    s, w, n, e = DELHI_BOX
                    for lat, lon in ((vals[0], vals[1]), (vals[2], vals[3])):
                        if not (s <= lat <= n and w <= lon <= e):
                            raise ValueError("point is outside Delhi NCT")
                    return self._ok(engine.routes(*vals, hour))
                except (KeyError, ValueError) as ex:
                    return self._send(400, json.dumps({"error": str(ex)}))
            rel = "index.html" if u.path in ("/", "") else u.path.lstrip("/")
            f = (web_dir / rel).resolve()
            if web_dir in f.parents and f.is_file():
                return self._send(200, f.read_bytes(), mime.get(f.suffix, "application/octet-stream"))
            return self._send(404, json.dumps({"error": "not found"}))

    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--processed", required=True, type=Path)
    ap.add_argument("--web", required=True, type=Path)
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"),
                    help="127.0.0.1 keeps it local; 0.0.0.0 exposes it (use inside a container)")
    ap.add_argument("--trust-proxy", action="store_true",
                    help="read the client address from X-Forwarded-For (only behind a proxy you control)")
    a = ap.parse_args()
    engine = Engine(a.processed)
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(engine, a.web, a.trust_proxy))
    print(f"serving http://{a.host}:{a.port}/", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
