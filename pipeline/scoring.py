"""M2: score one walking route with the Night Activity Score.

A route is a list of (coords, is_main_road) pieces in walking order, where coords is an
N x 2 array of (lon, lat). The scorer works in metres (EPSG:32643), finds the places,
help points, transit stops, cameras and lamps near the route, and returns points per factor,
the raw measurements behind them, and how much of the score rests on estimated data.

It is an activity score, not a safety rating.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

import config as C

BAND_NAMES = [b[0] for b in C.BANDS]
_TO_XY = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
_FROM_XY = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
DETAIL_MIN_PROB = 0.2    # places below this open probability are not drawn on the map
DETAIL_MAX_PLACES = 400


def parse_wkt(wkt):
    nums = re.findall(r"(-?\d+\.\d+)\s+(-?\d+\.\d+)", wkt)
    return np.array([(float(a), float(b)) for a, b in nums])


def to_xy(lonlat):
    x, y = _TO_XY.transform(lonlat[:, 0], lonlat[:, 1])
    return np.column_stack([x, y])


def cluster_points(xy, radius):
    """Merge points closer than `radius` (chained) into their centroids."""
    if len(xy) == 0:
        return xy
    pairs = cKDTree(xy).query_pairs(radius, output_type="ndarray")
    n = len(xy)
    if len(pairs) == 0:
        return xy
    m = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
    k, lab = connected_components(m, directed=False)
    cent = np.zeros((k, 2))
    np.add.at(cent, lab, xy)
    return cent / np.bincount(lab, minlength=k)[:, None]


def band_of_hour(hour):
    for i, (_, start, end) in enumerate(C.BANDS):
        inside = start <= hour < end if end > start else (hour >= start or hour < end)
        if inside:
            return i
    raise ValueError(hour)


class Scorer:
    def __init__(self, processed_dir):
        d = Path(processed_dir)
        pl = pd.read_parquet(d / "places.parquet")
        xy = to_xy(pl[["lon", "lat"]].values)
        self.pl = pl.reset_index(drop=True)
        self.pl_xy = xy
        self.pl_tree = cKDTree(xy)
        self.pl_open = self.pl[[f"open_{b}" for b in BAND_NAMES]].values.astype(float)
        self.pl_conf = (self.pl["status"] == "confirmed").values
        self.pl_kind = self.pl["kind"].values
        help_mask = self.pl["kind"].isin(C.HELP_KINDS).values
        self.help_idx = np.where(help_mask)[0]
        self.help_tree = cKDTree(xy[self.help_idx])

        def pts(name):
            df = pd.read_parquet(d / f"{name}.parquet")
            a = to_xy(df[["lon", "lat"]].values) if len(df) else np.zeros((0, 2))
            return a, (cKDTree(a) if len(a) else None)

        self.lamp_xy, self.lamp_tree = pts("lamps")
        self.cctv_xy, self.cctv_tree = pts("cctv")
        metro_xy, _ = pts("metro")
        self.metro_xy = cluster_points(metro_xy, C.METRO_MERGE_M)
        self.metro_tree = cKDTree(self.metro_xy) if len(self.metro_xy) else None
        self.bus_xy, self.bus_tree = pts("bus_stops")

        # station names for the map labels; the metro table itself has no names
        self.station_xy, self.station_tree, self.station_names = np.zeros((0, 2)), None, []
        sp = d / "search.parquet"
        if sp.exists():
            st = pd.read_parquet(sp)
            st = st[st["kind"] == "station"]
            if len(st):
                self.station_xy = to_xy(st[["lon", "lat"]].values)
                self.station_tree = cKDTree(self.station_xy)
                self.station_names = st["name"].tolist()

    # ----- geometry helpers -----
    @staticmethod
    def _densify(pieces):
        """Return sample points (metres), distance along route for each, length, and main-road length."""
        pts, s_all, total, main_len = [], [], 0.0, 0.0
        for coords, is_main in pieces:
            xy = to_xy(coords)
            d = np.hypot(np.diff(xy[:, 0]), np.diff(xy[:, 1]))
            L = float(d.sum())
            if L <= 0:
                continue
            cum = np.concatenate([[0.0], np.cumsum(d)])
            n = max(2, int(np.ceil(L / 10.0)) + 1)
            t = np.linspace(0.0, L, n)
            pts.append(np.column_stack([np.interp(t, cum, xy[:, 0]), np.interp(t, cum, xy[:, 1])]))
            s_all.append(total + t)
            total += L
            if is_main:
                main_len += L
        if not pts:
            return np.zeros((0, 2)), np.zeros(0), 0.0, 0.0
        return np.vstack(pts), np.concatenate(s_all), total, main_len

    @staticmethod
    def _count_turns(pts, s):
        """Turns over TURN_ANGLE_DEG, using chords of about TURN_WINDOW_M; nearby flags merged."""
        if len(pts) < 3:
            return 0
        step = max(1, int(round(C.TURN_WINDOW_M / 10.0)))
        sub = pts[::step]
        if len(sub) < 3:
            return 0
        v = np.diff(sub, axis=0)
        ok = np.hypot(v[:, 0], v[:, 1]) > 1e-6
        v = v[ok]
        if len(v) < 2:
            return 0
        h = np.arctan2(v[:, 1], v[:, 0])
        dh = np.abs((np.diff(h) + np.pi) % (2 * np.pi) - np.pi)
        flags = np.degrees(dh) > C.TURN_ANGLE_DEG
        turns, last = 0, False
        for f in flags:
            if f and not last:
                turns += 1
            last = f
        return turns

    @staticmethod
    def _near(tree, pts, radius):
        if tree is None or len(pts) == 0:
            return np.zeros(0, dtype=int)
        lists = tree.query_ball_point(pts, radius)
        flat = set()
        for x in lists:
            flat.update(x)
        return np.array(sorted(flat), dtype=int)

    # ----- the score -----
    def score(self, pieces, band, details=False):
        """band: index into C.BANDS or its name. details=True also returns map data (places, quiet stretches)."""
        b = BAND_NAMES.index(band) if isinstance(band, str) else int(band)
        pts, s, L, main_len = self._densify(pieces)
        if L <= 0:
            raise ValueError("empty route")
        km = L / 1000.0
        route_tree = cKDTree(pts)
        W = C.SCORE_WEIGHTS

        # F1 open places and F2 gaps
        near = self._near(self.pl_tree, pts, C.PLACE_RADIUS)
        prob = self.pl_open[near, b] if len(near) else np.zeros(0)
        conf = self.pl_conf[near] if len(near) else np.zeros(0, dtype=bool)
        density = float(prob.sum()) / km
        f1 = W["open_places"] * (1 - np.exp(-density / C.F1_REF_PER_KM))
        if len(near):
            _, nearest_pt = route_tree.query(self.pl_xy[near])
            pos = s[nearest_pt]
            open_pos = np.sort(pos[prob >= C.OPEN_THRESHOLD])
        else:
            open_pos = np.zeros(0)
        edges = np.concatenate([[0.0], open_pos, [L]])
        gaps = np.diff(edges)
        long_gaps = gaps[gaps > C.GAP_MIN_M]
        gap_share = float(long_gaps.sum()) / L
        f2 = W["gaps"] * (1 - gap_share)
        longest_gap = float(gaps.max())

        # F3 help points (police, hospitals, pharmacies, clinics), weighted by open probability and distance
        help_sum = 0.0
        hl = self._near(self.help_tree, pts, C.HELP_RADIUS)
        if len(hl):
            gidx = self.help_idx[hl]
            d, _ = route_tree.query(self.pl_xy[gidx])
            wts = np.array([C.HELP_WEIGHT.get(k, 1.0) for k in self.pl_kind[gidx]])
            help_sum = float((wts * self.pl_open[gidx, b] * np.clip(1 - d / C.HELP_RADIUS, 0, 1)).sum())
        f3 = W["help"] * (1 - np.exp(-help_sum / C.HELP_REF))

        # F4 main-road share
        main_share = main_len / L
        f4 = W["main_road"] * main_share

        # F5 transport
        metro_n = len(self._near(self.metro_tree, pts, C.TRANSIT_RADIUS))
        bus_n = len(self._near(self.bus_tree, pts, C.TRANSIT_RADIUS))
        transit = metro_n * C.METRO_OPEN[b] + C.BUS_WEIGHT * bus_n * C.BUS_OPEN[b]
        f5 = W["transport"] * (1 - np.exp(-transit / C.TRANSIT_REF))

        # F6 turns
        turns = self._count_turns(pts, s)
        turns_per_km = turns / km
        f6 = W["turns"] * max(0.0, 1 - turns_per_km / C.TURNS_REF_PER_KM)

        # F7 mapped cameras
        cams = len(self._near(self.cctv_tree, pts, C.CCTV_RADIUS))
        f7 = W["cameras"] * min(1.0, (cams / km) / C.CCTV_REF_PER_KM)

        lamps = len(self._near(self.lamp_tree, pts, C.LAMP_RADIUS))

        total_pts = f1 + f2 + f3 + f4 + f5 + f6 + f7
        score = 100.0 * total_pts / sum(W.values())
        mass = float(prob.sum())
        result = {
            "score": round(score, 1),
            "band": BAND_NAMES[b],
            "length_m": round(L, 0),
            "minutes": round(L / C.WALK_M_PER_MIN, 1),
            "points": {k: round(v, 2) for k, v in zip(
                ["open_places", "gaps", "help", "main_road", "transport", "turns", "cameras"],
                [f1, f2, f3, f4, f5, f6, f7])},
            "raw": {
                "open_places_expected": round(mass, 1),
                "open_places_per_km": round(density, 1),
                "places_nearby": int(len(near)),
                "places_with_confirmed_hours": int(conf.sum()),
                "longest_gap_m": round(longest_gap, 0),
                "share_in_gaps": round(gap_share, 3),
                "help_sum": round(help_sum, 2),
                "main_road_share": round(main_share, 3),
                "metro_stops_nearby": metro_n,
                "bus_stops_nearby": bus_n,
                "turns": turns,
                "cameras_mapped": cams,
                "lamps_mapped_per_km": round(lamps / km, 1),
            },
            "confidence": {
                "confirmed_share_of_open_mass": round(float(prob[conf].sum()) / mass, 3) if mass > 0 else None,
                "lighting": "observed" if lamps > 0 else "unknown",
            },
        }
        if details:
            places = []
            if len(near):
                order = np.argsort(-prob)
                for i in order:
                    if prob[i] < DETAIL_MIN_PROB or len(places) >= DETAIL_MAX_PLACES:
                        break
                    row = self.pl.iloc[near[i]]
                    places.append({"lat": round(float(row["lat"]), 6), "lon": round(float(row["lon"]), 6),
                                   "p": round(float(prob[i]), 2), "kind": str(row["kind"]), "c": bool(conf[i]),
                                   "name": row["name"] if isinstance(row["name"], str) else ""})
            quiet = []
            for k, g in enumerate(gaps):
                if g > C.GAP_MIN_M:
                    m = (s >= edges[k]) & (s <= edges[k + 1])
                    seg_pts = pts[m][::3]
                    if len(seg_pts) >= 2:
                        lo, la = _FROM_XY.transform(seg_pts[:, 0], seg_pts[:, 1])
                        quiet.append([[round(float(x), 6), round(float(y), 6)] for x, y in zip(lo, la)])
            quiet_s = [[round(float(edges[k]), 0), round(float(edges[k + 1]), 0)]
                       for k, g in enumerate(gaps) if g > C.GAP_MIN_M]
            result["details"] = {"places": places, "quiet": quiet, "quiet_s": quiet_s,
                                 "profile": self._profile(near, prob, pos if len(near) else None, L),
                                 "poi": self._poi(route_tree, s, L, b)}
        return result

    @staticmethod
    def _profile(near, prob, pos, L):
        """Activity along the route in PROFILE_BIN_M bins, 0 (nothing open) to 1 (lively)."""
        n = max(1, int(np.ceil(L / C.PROFILE_BIN_M)))
        mass = np.zeros(n)
        if len(near):
            np.add.at(mass, np.minimum((pos / C.PROFILE_BIN_M).astype(int), n - 1), prob)
        level = 1 - np.exp(-mass / C.PROFILE_REF)
        return [round(float(x), 2) for x in level]

    def _poi(self, route_tree, s, L, b):
        """Named landmarks that matter at night, with where they sit along the route and how far off it."""
        out = []
        for kind in C.POI_KINDS:
            idx = np.where(self.pl_kind == kind)[0]
            if len(idx):
                near = idx[self._ball(route_tree, self.pl_xy[idx], C.POI_RADIUS[kind])]
                d, at = route_tree.query(self.pl_xy[near])
                rows = [(float(s[a]), float(dd), float(self.pl_open[i, b]), bool(self.pl_conf[i]), i) for i, dd, a in zip(near, d, at)]
                rows = [r for r in rows if r[1] <= C.POI_RADIUS[kind]]
                if kind == "hospital":
                    # small practices are labelled "hospital" in the source data; they are not drawn as hospitals
                    rows = [r for r in rows if not re.search(C.POI_NOT_HOSPITAL_RE, str(self.pl.iloc[r[4]]["name"]), re.I)]
                # best first, then keep one per POI_SPACING_M of route so the map stays readable
                rows.sort(key=lambda r: (-(r[2] >= 0.5), r[1]))
                kept = []
                for r in rows:
                    if len(kept) >= C.POI_MAX_PER_KIND:
                        break
                    if all(abs(r[0] - k[0]) >= C.POI_SPACING_M for k in kept):
                        kept.append(r)
                for sp, dd, p, conf, i in kept:
                    row = self.pl.iloc[i]
                    nm = row["name"] if isinstance(row["name"], str) else ""
                    out.append({"kind": kind, "name": nm, "lat": round(float(row["lat"]), 6), "lon": round(float(row["lon"]), 6),
                                "s": round(sp), "off": round(dd), "p": round(p, 2), "c": conf})
        if len(self.metro_xy):
            near = self._ball(route_tree, self.metro_xy, C.POI_METRO_RADIUS)
            if len(near):
                d, at = route_tree.query(self.metro_xy[near])
                for k, dd, a in zip(near, d, at):
                    if dd <= C.POI_METRO_RADIUS:
                        lo, la = _FROM_XY.transform(self.metro_xy[k, 0], self.metro_xy[k, 1])
                        j = self.station_tree.query([self.metro_xy[k]])[1][0] if self.station_tree is not None else None
                        near_st = j is not None and np.hypot(*(self.station_xy[j] - self.metro_xy[k])) <= C.STATION_NAME_M
                        out.append({"kind": "metro", "name": self.station_names[j] if near_st else "", "lat": round(float(la), 6),
                                    "lon": round(float(lo), 6), "s": round(float(s[a])), "off": round(float(dd)),
                                    "p": round(float(C.METRO_OPEN[b]), 2), "c": False})
        # one entry per station: big stations have several entrances, and some names end in "Metro Gate No 5"
        best = {}
        for r in out:
            if r["kind"] != "metro":
                continue
            r["name"] = re.sub(r"\s*(metro\s*)?(station\s*)?gate\s*(no\.?\s*)?\d+\w*$", "", r["name"], flags=re.I).strip()
            key = r["name"].lower() or "%d" % r["s"]
            if key not in best or r["off"] < best[key]["off"]:
                best[key] = r
        out = [r for r in out if r["kind"] != "metro"] + list(best.values())
        out.sort(key=lambda r: r["s"])
        return out

    @staticmethod
    def _ball(tree, xy, radius):
        """Indices of `xy` rows within `radius` of any sample point of `tree`'s route."""
        near = cKDTree(xy).query_ball_tree(tree, radius)
        return np.array([i for i, hits in enumerate(near) if hits], dtype=int)
