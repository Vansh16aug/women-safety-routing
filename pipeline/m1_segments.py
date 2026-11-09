"""M1: build the street-segment table for Delhi NCT.

Reads the OSM extract and the Overture places extract saved by M0, then:
  1. cuts walkable ways into segments between junctions,
  2. builds one list of places (OSM + Overture, de-duplicated) with a per-band
     open probability: parsed from opening_hours when present ("confirmed"),
     otherwise a category prior from config.py ("estimated"),
  3. attaches nearby places, lamps, cameras, help points and transit to every segment.

Usage: python -I m1_segments.py --raw <data/raw> --out <data/processed>
"""
import argparse
import itertools
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import osmium
import pandas as pd
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import Point, Polygon
from shapely.prepared import prep

import config as C

KB = (28.640, 77.180, 28.660, 77.205)  # S, W, N, E: Karol Bagh test box

FAMILY = {
    "restaurant": "food", "fast_food": "food", "cafe": "food", "bar": "food",
    "pharmacy": "health", "hospital": "health", "clinic": "health",
    "atm": "money", "bank": "money",
    "shop": "retail", "convenience": "retail", "market": "retail",
}


# ---------- tag to kind mapping ----------

def osm_kind(tags):
    am = tags.get("amenity")
    shop = tags.get("shop")
    tour = tags.get("tourism")
    if am:
        if am == "hospital" and re.search(C.SMALL_MEDICAL_RE, (tags.get("name") or "").lower()):
            return "clinic"
        m = {"pharmacy": "pharmacy", "hospital": "hospital", "clinic": "clinic", "doctors": "clinic",
             "dentist": "clinic", "atm": "atm", "bank": "bank", "police": "police",
             "restaurant": "restaurant", "food_court": "restaurant", "fast_food": "fast_food",
             "cafe": "cafe", "ice_cream": "cafe", "bar": "bar", "pub": "bar", "nightclub": "bar",
             "fuel": "fuel", "cinema": "cinema", "place_of_worship": "worship",
             "marketplace": "market"}.get(am)
        if m:
            return m
    if shop and shop not in ("vacant", "no"):
        return "convenience" if shop in ("convenience", "supermarket", "general", "kiosk", "greengrocer") else "shop"
    if tour in ("hotel", "guest_house", "hostel", "motel"):
        return "hotel"
    return None


def ovt_kind(tax, h1, name=None):
    t = tax.lower() if isinstance(tax, str) else ""
    h = h1.lower() if isinstance(h1, str) else ""
    if re.search(r"pharm|drugstore", t):
        return "pharmacy"
    if "hospital" in t:
        nm = name.lower() if isinstance(name, str) else ""
        return "clinic" if re.search(C.SMALL_MEDICAL_RE, nm) else "hospital"
    if re.search(r"clinic|doctor|dentist|medical_center", t):
        return "clinic"
    if re.search(r"\batm\b|^atm", t):
        return "atm"
    if re.search(r"bank|credit_union", t):
        return "bank"
    if "police" in t:
        return "police"
    if re.search(r"gas_station|fuel|petrol", t):
        return "fuel"
    if re.search(r"hotel|motel|guest_house|hostel|resort|lodge", t):
        return "hotel"
    if re.search(r"cinema|movie_theater", t):
        return "cinema"
    if re.search(r"religious|temple|mosque|church|gurdwara|place_of_worship", t):
        return "worship"
    if h == "food_and_drink":
        if re.search(r"bar|pub|nightclub|lounge", t):
            return "bar"
        if re.search(r"cafe|coffee|tea|bakery|ice_cream|juice", t):
            return "cafe"
        if "fast_food" in t:
            return "fast_food"
        return "restaurant"
    if h == "shopping":
        if re.search(r"convenience|grocery|supermarket|kirana|kiosk|vegetable|fruit", t):
            return "convenience"
        return "shop"
    return None


# ---------- opening hours (rough, ignores weekdays) ----------

_RANGE = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})")


def band_fractions(oh):
    """Fraction of each band the place is open, or None if the string has no usable time range."""
    if not isinstance(oh, str) or not oh.strip():
        return None
    s = oh.strip()
    if "24/7" in s:
        return (1.0,) * len(C.BANDS)
    ranges = _RANGE.findall(s)
    if not ranges:
        return None
    open_min = np.zeros(1440, dtype=bool)
    for h1, m1, h2, m2 in ranges:
        a = (int(h1) * 60 + int(m1)) % 1440
        b = int(h2) * 60 + int(m2)
        b = 1440 if b >= 1440 else b
        if b > a:
            open_min[a:b] = True
        elif b < a:
            open_min[a:] = True
            open_min[:b] = True
    out = []
    for _, start, end in C.BANDS:
        mask = np.zeros(1440, dtype=bool)
        if end > start:
            mask[start * 60:end * 60] = True
        else:
            mask[start * 60:] = True
            mask[:end * 60] = True
        out.append(float(open_min[mask].mean()))
    return tuple(out)


# ---------- OSM pass ----------

class Collect(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []
        self.places = []   # (id, kind, lat, lon, hours, name)
        self.lamps = []
        self.cctv = []
        self.metro = []
        self.bus = []

    def _poi(self, oid, tags, lat, lon):
        k = osm_kind(tags)
        if k:
            self.places.append((oid, k, lat, lon, tags.get("opening_hours"), tags.get("name")))
        if tags.get("highway") == "street_lamp":
            self.lamps.append((lat, lon))
        if tags.get("man_made") == "surveillance":
            self.cctv.append((lat, lon))
        if tags.get("railway") in ("station", "subway_entrance"):
            self.metro.append((lat, lon))
        if tags.get("highway") == "bus_stop":
            self.bus.append((lat, lon))

    def node(self, n):
        if n.tags and n.location.valid():
            self._poi(f"osm:n{n.id}", n.tags, n.location.lat, n.location.lon)

    def way(self, w):
        tags = w.tags
        if not tags:
            return
        nodes = [(nd.ref, nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        if len(nodes) < 2:
            return
        hw = tags.get("highway")
        if hw and hw in C.WALKABLE and tags.get("foot") != "no" and tags.get("access") not in ("no", "private"):
            self.ways.append({
                "id": w.id, "hw": hw, "lit": tags.get("lit"), "tunnel": tags.get("tunnel"),
                "bridge": tags.get("bridge"), "footway": tags.get("footway"), "service": tags.get("service"),
                "name": tags.get("name"), "nodes": nodes,
            })
        elif not hw:
            self._poi(f"osm:w{w.id}", tags, nodes[0][1], nodes[0][2])


def load_poly(path):
    ring = []
    for line in Path(path).read_text().splitlines():
        m = re.match(r"\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s*$", line)
        if m:
            ring.append((float(m.group(1)), float(m.group(2))))
    return Polygon(ring)


def name_tokens(name):
    text = name.lower() if isinstance(name, str) else ""
    return {t for t in re.findall(r"[a-z0-9]+", text) if len(t) >= 3}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    to_xy = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)

    # 1. OSM
    print("reading OSM ...", flush=True)
    h = Collect()
    h.apply_file(str(a.raw / "delhi.osm.pbf"), locations=True, idx="flex_mem")
    print(f"  walkable ways {len(h.ways)}, places {len(h.places)}, lamps {len(h.lamps)}, "
          f"cctv {len(h.cctv)}, metro {len(h.metro)}, bus {len(h.bus)}", flush=True)

    # 2. nodes and segments
    usage = Counter()
    for w in h.ways:
        for ref, _, _ in w["nodes"]:
            usage[ref] += 1
    ref_index, lat_l, lon_l = {}, [], []
    for w in h.ways:
        idx = []
        for ref, la, lo in w["nodes"]:
            i = ref_index.get(ref)
            if i is None:
                i = len(lat_l)
                ref_index[ref] = i
                lat_l.append(la)
                lon_l.append(lo)
            idx.append(i)
        w["idx"] = np.array(idx)
        w["refs"] = [r for r, _, _ in w["nodes"]]
    lat_a, lon_a = np.array(lat_l), np.array(lon_l)
    X, Y = to_xy.transform(lon_a, lat_a)
    X, Y = np.asarray(X), np.asarray(Y)

    seg_rows, sx, sy, sseg = [], [], [], []
    split_nodes = set()
    for w in h.ways:
        refs, idx = w["refs"], w["idx"]
        cuts = [j for j in range(len(refs)) if j == 0 or j == len(refs) - 1 or usage[refs[j]] > 1]
        for a_, b_ in zip(cuts[:-1], cuts[1:]):
            ii = idx[a_:b_ + 1]
            px, py = X[ii], Y[ii]
            d = np.hypot(np.diff(px), np.diff(py))
            L = float(d.sum())
            if L <= 0:
                continue
            sid = len(seg_rows)
            cum = np.concatenate([[0.0], np.cumsum(d)])
            n = max(2, int(np.ceil(L / C.SAMPLE_SPACING)) + 1)
            t = np.linspace(0.0, L, n)
            sx.append(np.interp(t, cum, px))
            sy.append(np.interp(t, cum, py))
            sseg.append(np.full(n, sid, dtype=np.int64))
            mid = ii[len(ii) // 2]
            split_nodes.add(refs[a_])
            split_nodes.add(refs[b_])
            hw = w["hw"]
            seg_rows.append({
                "seg_id": sid, "way_id": w["id"], "u": refs[a_], "v": refs[b_], "highway": hw,
                "is_main_road": hw in C.MAIN_ROADS, "lit_tag": w["lit"],
                "tunnel": bool(w["tunnel"]), "bridge": bool(w["bridge"]),
                "is_alley": w["service"] == "alley", "is_sidewalk": w["footway"] == "sidewalk",
                "is_crossing": w["footway"] == "crossing", "name": w["name"], "length_m": round(L, 1),
                "mid_lat": float(lat_a[mid]), "mid_lon": float(lon_a[mid]),
                "geom_wkt": "LINESTRING(" + ", ".join(f"{lon_a[i]:.6f} {lat_a[i]:.6f}" for i in ii) + ")",
            })
    seg = pd.DataFrame(seg_rows)
    SX, SY, SS = np.concatenate(sx), np.concatenate(sy), np.concatenate(sseg)
    print(f"  segments {len(seg)}, total {seg['length_m'].sum() / 1000:.0f} km, sample points {len(SX)}", flush=True)

    nodes = pd.DataFrame({"ref": list(split_nodes)})
    nodes["lat"] = [lat_a[ref_index[r]] for r in nodes["ref"]]
    nodes["lon"] = [lon_a[ref_index[r]] for r in nodes["ref"]]

    # 3. places
    poly = load_poly(a.raw / "delhi.poly")
    pp = prep(poly)
    osm_pl = pd.DataFrame(h.places, columns=["pid", "kind", "lat", "lon", "hours_raw", "name"])
    osm_pl["source"] = "osm"
    ov = pd.read_parquet(a.raw / "overture_places_delhi_bbox.parquet",
                         columns=["id", "name", "confidence", "operating_status", "tax", "h1", "lat", "lon"])
    ov = ov[ov["confidence"].fillna(-1) >= C.OVERTURE_MIN_CONFIDENCE]
    ov = ov[~ov["operating_status"].isin(["permanently_closed", "temporarily_closed"])]
    ov = ov[[pp.contains(Point(x, y)) for x, y in zip(ov["lon"], ov["lat"])]]
    ov["kind"] = [ovt_kind(t, h1, nm) for t, h1, nm in zip(ov["tax"], ov["h1"], ov["name"])]
    n_ov_before = len(ov)
    ov = ov[ov["kind"].notna()].copy()
    ov["pid"] = "ovt:" + ov["id"].astype(str)
    ov["hours_raw"] = None
    ov["source"] = "overture"
    print(f"  Overture: {n_ov_before} at confidence >= {C.OVERTURE_MIN_CONFIDENCE}, {len(ov)} with a mapped kind", flush=True)

    ox, oy = to_xy.transform(osm_pl["lon"].values, osm_pl["lat"].values)
    vx, vy = to_xy.transform(ov["lon"].values, ov["lat"].values)
    osm_tree = cKDTree(np.column_stack([ox, oy]))
    osm_kind_arr = osm_pl["kind"].values
    osm_tok = [name_tokens(n) for n in osm_pl["name"].values]
    keep = np.ones(len(ov), dtype=bool)
    near_lists = osm_tree.query_ball_point(np.column_stack([vx, vy]), C.DEDUPE_NAME_M)
    for i, (nb, kind, nm) in enumerate(zip(near_lists, ov["kind"].values, ov["name"].values)):
        if not nb:
            continue
        fam = FAMILY.get(kind, kind)
        tok = name_tokens(nm)
        for j in nb:
            if FAMILY.get(osm_kind_arr[j], osm_kind_arr[j]) != fam:
                continue
            dist = np.hypot(vx[i] - ox[j], vy[i] - oy[j])
            if dist <= C.DEDUPE_CLOSE_M or (tok and osm_tok[j] and tok & osm_tok[j]):
                keep[i] = False
                break
    print(f"  Overture duplicates of OSM places dropped: {int((~keep).sum())}", flush=True)
    ov = ov[keep]
    pl = pd.concat([osm_pl, ov[["pid", "kind", "lat", "lon", "hours_raw", "name", "source"]]], ignore_index=True)

    probs, status = [], []
    for kind, hours in zip(pl["kind"], pl["hours_raw"]):
        parsed = band_fractions(hours)
        if parsed is not None:
            probs.append(parsed)
            status.append("confirmed")
        else:
            probs.append(C.PRIORS[kind])
            status.append("estimated")
    probs = np.array(probs, dtype=np.float32)
    for k, (bn, _, _) in enumerate(C.BANDS):
        pl[f"open_{bn}"] = probs[:, k]
    pl["status"] = status
    px_, py_ = to_xy.transform(pl["lon"].values, pl["lat"].values)
    pl["x"], pl["y"] = px_, py_
    print("  places:", pl["source"].value_counts().to_dict(), "| status:", pl["status"].value_counts().to_dict(), flush=True)

    # 4. attach features to segments
    S = np.column_stack([SX, SY])
    nseg = len(seg)

    def ball_pairs(tree, radius):
        lists = tree.query_ball_point(S, radius)
        lens = np.fromiter((len(x) for x in lists), dtype=np.int64, count=len(lists))
        flat = np.fromiter(itertools.chain.from_iterable(lists), dtype=np.int64, count=int(lens.sum()))
        pairs = pd.DataFrame({"seg": np.repeat(SS, lens), "idx": flat}).drop_duplicates()
        return pairs

    def count_near(xy, radius):
        if len(xy) == 0:
            return np.zeros(nseg, dtype=np.int32)
        p = ball_pairs(cKDTree(xy), radius)
        return np.bincount(p["seg"].values, minlength=nseg).astype(np.int32)

    def min_dist(xy, limit):
        out = np.full(nseg, np.nan, dtype=np.float32)
        if len(xy) == 0:
            return out
        d, _ = cKDTree(xy).query(S, distance_upper_bound=limit)
        ok = np.isfinite(d)
        s = pd.Series(d[ok]).groupby(SS[ok]).min()
        out[s.index.values] = s.values
        return out

    print("attaching places ...", flush=True)
    p = ball_pairs(cKDTree(pl[["x", "y"]].values), C.PLACE_RADIUS)
    pl["is_conf"] = (pl["status"] == "confirmed").astype(np.int8)
    pj = p.join(pl[[f"open_{b[0]}" for b in C.BANDS] + ["is_conf"]], on="idx")
    agg = pj.groupby("seg").agg(
        n_places=("idx", "size"),
        n_confirmed=("is_conf", "sum"),
        **{f"open_exp_{b[0]}": (f"open_{b[0]}", "sum") for b in C.BANDS},
    )
    for col in agg.columns:
        seg[col] = 0.0
        seg.loc[agg.index.values, col] = agg[col].values
    seg["n_places"] = seg["n_places"].astype(int)
    seg["n_confirmed"] = seg["n_confirmed"].astype(int)
    seg["n_estimated"] = seg["n_places"] - seg["n_confirmed"]

    def xy_of(rows):
        if not rows:
            return np.zeros((0, 2))
        arr = np.array(rows)
        x, y = to_xy.transform(arr[:, 1], arr[:, 0])
        return np.column_stack([x, y])

    print("attaching lamps, cameras, transit, help points ...", flush=True)
    seg["lamps_20m"] = count_near(xy_of(h.lamps), C.LAMP_RADIUS)
    seg["cctv_30m"] = count_near(xy_of(h.cctv), C.CCTV_RADIUS)
    seg["metro_200m"] = count_near(xy_of(h.metro), C.TRANSIT_RADIUS)
    seg["bus_200m"] = count_near(xy_of(h.bus), C.TRANSIT_RADIUS)
    police = pl[pl["kind"] == "police"]
    health = pl[pl["kind"].isin(["hospital", "clinic", "pharmacy"])]
    seg["police_dist_m"] = min_dist(police[["x", "y"]].values, C.HELP_RADIUS)
    seg["health_dist_m"] = min_dist(health[["x", "y"]].values, C.HELP_RADIUS)

    # help points weighted by how likely they are to be open in each band
    helpers = pl[pl["kind"].isin(C.HELP_KINDS)].reset_index(drop=True)
    hp = ball_pairs(cKDTree(helpers[["x", "y"]].values), C.HELP_RADIUS)
    hpj = hp.join(helpers[[f"open_{b[0]}" for b in C.BANDS]], on="idx")
    hagg = hpj.groupby("seg")[[f"open_{b[0]}" for b in C.BANDS]].sum()
    for b in C.BANDS:
        seg[f"help_exp_{b[0]}"] = 0.0
        seg.loc[hagg.index.values, f"help_exp_{b[0]}"] = hagg[f"open_{b[0]}"].values

    # 5. save
    seg.to_parquet(a.out / "segments.parquet", index=False)
    nodes.to_parquet(a.out / "nodes.parquet", index=False)
    pl.drop(columns=["x", "y"]).to_parquet(a.out / "places.parquet", index=False)
    pd.DataFrame(h.lamps, columns=["lat", "lon"]).to_parquet(a.out / "lamps.parquet", index=False)
    pd.DataFrame(h.cctv, columns=["lat", "lon"]).to_parquet(a.out / "cctv.parquet", index=False)
    pd.DataFrame(h.metro, columns=["lat", "lon"]).to_parquet(a.out / "metro.parquet", index=False)
    pd.DataFrame(h.bus, columns=["lat", "lon"]).to_parquet(a.out / "bus_stops.parquet", index=False)

    # 6. summary
    kbm = (seg.mid_lat.between(KB[0], KB[2])) & (seg.mid_lon.between(KB[1], KB[3]))

    def summ(df):
        return {
            "segments": int(len(df)),
            "km": round(df.length_m.sum() / 1000, 1),
            "main_road_km": round(df.loc[df.is_main_road, "length_m"].sum() / 1000, 1),
            "share_segments_with_any_place_40m": round(float((df.n_places > 0).mean()), 3),
            "share_length_with_any_place_40m": round(float(df.loc[df.n_places > 0, "length_m"].sum() / max(df.length_m.sum(), 1)), 3),
            "mean_open_exp_day": round(float(df.open_exp_day.mean()), 2),
            "mean_open_exp_evening": round(float(df.open_exp_evening.mean()), 2),
            "mean_open_exp_night": round(float(df.open_exp_night.mean()), 2),
            "share_places_confirmed": round(float(df.n_confirmed.sum() / max(df.n_places.sum(), 1)), 3),
            "share_segments_lamp_20m": round(float((df.lamps_20m > 0).mean()), 3),
            "share_segments_lit_tag": round(float(df.lit_tag.notna().mean()), 3),
            "share_segments_cctv_30m": round(float((df.cctv_30m > 0).mean()), 3),
            "mean_help_exp_night": round(float(df.help_exp_night.mean()), 2),
            "share_segments_help_exp_night_ge_0.5": round(float((df.help_exp_night >= 0.5).mean()), 3),
            "share_segments_police_250m": round(float(df.police_dist_m.notna().mean()), 3),
            "share_segments_health_250m": round(float(df.health_dist_m.notna().mean()), 3),
            "share_segments_metro_200m": round(float((df.metro_200m > 0).mean()), 3),
            "share_segments_bus_200m": round(float((df.bus_200m > 0).mean()), 3),
        }

    summary = {
        "delhi": summ(seg),
        "karol_bagh_box": summ(seg[kbm]),
        "main_roads_delhi": summ(seg[seg.is_main_road]),
        "residential_delhi": summ(seg[seg.highway == "residential"]),
        "places": {
            "total": int(len(pl)),
            "by_source": pl["source"].value_counts().to_dict(),
            "by_status": pl["status"].value_counts().to_dict(),
            "by_kind": pl["kind"].value_counts().to_dict(),
        },
        "nodes": int(len(nodes)),
    }
    (a.out / "m1_summary.json").write_text(json.dumps(summary, indent=1, default=str))
    print(json.dumps(summary, indent=1, default=str))
    print("wrote", a.out)


if __name__ == "__main__":
    sys.exit(main())
