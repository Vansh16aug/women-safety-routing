"""M0: measure what public data exists for Delhi NCT.

Reads the OpenStreetMap Delhi extract and the Overture Maps Places release,
counts the layers the Night Activity Score needs, and checks that the
Karol Bagh box reproduces the earlier numbers (OSM Overpass counts, and the
5,644 Overture places measured on 28 Oct 2026).

Usage: python -I m0_measure.py --raw <data/raw dir> --out <output dir> [--skip-overture]
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import duckdb
import numpy as np
import osmium
from shapely.geometry import Point, Polygon
from shapely.prepared import prep

OVERTURE_RELEASE = "2026-10-21.0"
OVERTURE_URL = f"s3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=places/type=place/*"

# Karol Bagh box used in all earlier counts: S, W, N, E
KB = (28.640, 77.180, 28.660, 77.205)
# Rough central Delhi box, used only to compare dense and thin areas
CENTRAL = (28.58, 77.15, 28.70, 77.28)

WALKABLE = {
    "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "unclassified", "road", "residential", "living_street",
    "pedestrian", "corridor", "service", "cycleway", "footway", "steps", "path", "track",
    "bridleway",
}
MAIN_ROADS = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
              "tertiary", "tertiary_link"}

KINDS = [
    "shop", "shop_with_hours", "amenity", "amenity_with_hours", "food", "police",
    "health", "atm_bank", "street_lamp", "cctv", "metro", "bus_stop",
]


def in_box(lat, lon, box):
    s, w, n, e = box
    return s <= lat <= n and w <= lon <= e


def kinds_for(tags):
    out = []
    shop = tags.get("shop")
    am = tags.get("amenity")
    hours = tags.get("opening_hours")
    if shop:
        out.append("shop")
        if hours:
            out.append("shop_with_hours")
    if am:
        out.append("amenity")
        if hours:
            out.append("amenity_with_hours")
        if am in ("restaurant", "cafe", "fast_food"):
            out.append("food")
        if am == "police":
            out.append("police")
        if am in ("hospital", "clinic", "pharmacy", "doctors"):
            out.append("health")
        if am in ("atm", "bank"):
            out.append("atm_bank")
    if tags.get("highway") == "street_lamp":
        out.append("street_lamp")
    if tags.get("man_made") == "surveillance":
        out.append("cctv")
    if tags.get("railway") in ("station", "subway_entrance"):
        out.append("metro")
    if tags.get("highway") == "bus_stop":
        out.append("bus_stop")
    return out


class OsmCounter(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.counts = {r: Counter() for r in ("delhi", "kb", "central")}
        self.way_km = {r: defaultdict(float) for r in ("delhi", "kb", "central")}
        self.way_n = {r: Counter() for r in ("delhi", "kb", "central")}
        self.lit_ways = {r: Counter() for r in ("delhi", "kb", "central")}
        self.points = []  # (kind, lat, lon) for grid comparison

    def _regions(self, lat, lon):
        r = ["delhi"]
        if in_box(lat, lon, KB):
            r.append("kb")
        if in_box(lat, lon, CENTRAL):
            r.append("central")
        return r

    def _add(self, tags, lat, lon):
        for k in kinds_for(tags):
            for r in self._regions(lat, lon):
                self.counts[r][k] += 1
            if k in ("shop", "food", "health", "atm_bank", "police"):
                self.points.append((k, lat, lon))

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        self._add(n.tags, n.location.lat, n.location.lon)

    def way(self, w):
        tags = w.tags
        if not tags:
            return
        try:
            first = w.nodes[0].location
            if not first.valid():
                return
            lat, lon = first.lat, first.lon
        except Exception:
            return
        hw = tags.get("highway")
        if hw and hw in WALKABLE and tags.get("foot") != "no":
            try:
                length = osmium.geom.haversine_distance(w.nodes)
            except Exception:
                length = 0.0
            for r in self._regions(lat, lon):
                self.way_n[r][hw] += 1
                self.way_km[r][hw] += length / 1000.0
                if tags.get("lit"):
                    self.lit_ways[r][tags.get("lit")] += 1
        elif not hw:
            self._add(tags, lat, lon)


def load_poly(path):
    ring = []
    for line in Path(path).read_text().splitlines():
        m = re.match(r"\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s*$", line)
        if m:
            ring.append((float(m.group(1)), float(m.group(2))))
    return Polygon(ring)


def group_expr():
    return """
      case
        when regexp_matches(coalesce(tax, ''), 'atm|bank|credit_union') then 'atm_bank'
        when regexp_matches(coalesce(tax, ''), 'police') then 'police'
        when regexp_matches(coalesce(tax, ''), 'pharm|drugstore') or h1 = 'health_care' then 'health_pharmacy'
        when h1 = 'food_and_drink' then 'food_drink'
        when h1 = 'shopping' then 'shop_retail'
        else 'other'
      end
    """


def overture_pull(poly, out_parquet):
    minx, miny, maxx, maxy = poly.bounds
    con = duckdb.connect()
    con.execute("install httpfs; load httpfs; set s3_region='us-west-2';")
    sql = f"""
      copy (
        select id, names.primary as name, confidence, operating_status, basic_category,
               taxonomy.primary as tax, taxonomy.hierarchy[1] as h1,
               list_transform(sources, lambda x: x.dataset) as src,
               list_transform(sources, lambda x: x.update_time) as ut,
               bbox.ymin as lat, bbox.xmin as lon
        from read_parquet('{OVERTURE_URL}', hive_partitioning=1)
        where bbox.xmin between {minx} and {maxx} and bbox.ymin between {miny} and {maxy}
      ) to '{out_parquet}' (format parquet);
    """
    con.execute(sql)
    return con


def overture_stats(out_parquet, poly):
    con = duckdb.connect()
    df = con.execute(f"""
        select id, name, confidence, tax, h1, lat, lon, src[1] as src1,
               {group_expr()} as grp
        from read_parquet('{out_parquet}')
    """).fetchdf()
    pp = prep(poly)
    inside = np.array([pp.contains(Point(x, y)) for x, y in zip(df["lon"], df["lat"])])
    df = df[inside].copy()
    res = {"total_in_delhi": int(len(df))}
    conf = df["confidence"].fillna(-1)
    res["by_group"] = {}
    for g, sub in df.groupby("grp"):
        c = conf[sub.index]
        res["by_group"][g] = {
            "all": int(len(sub)),
            "conf_0.5+": int((c >= 0.5).sum()),
            "conf_0.7+": int((c >= 0.7).sum()),
        }
    res["confidence_hist"] = {
        "<0.3": int((conf < 0.3).sum()),
        "0.3-0.6": int(((conf >= 0.3) & (conf < 0.6)).sum()),
        "0.6-0.99": int(((conf >= 0.6) & (conf < 1.0)).sum()),
        "1.0": int((conf >= 1.0).sum()),
    }
    res["first_source"] = df["src1"].value_counts().head(8).to_dict()
    kb = df[(df["lat"] >= KB[0]) & (df["lat"] <= KB[2]) & (df["lon"] >= KB[1]) & (df["lon"] <= KB[3])]
    res["kb_total"] = int(len(kb))
    res["kb_by_group"] = {g: int(n) for g, n in kb["grp"].value_counts().items()}
    ctr = df[(df["lat"] >= CENTRAL[0]) & (df["lat"] <= CENTRAL[2]) & (df["lon"] >= CENTRAL[1]) & (df["lon"] <= CENTRAL[3])]
    res["central_total"] = int(len(ctr))
    return res, df


def grid_compare(osm_points, ovt_df, cell=0.02):
    """Compare shop-like counts per ~2 km cell: Overture shop_retail (conf >= 0.5) vs OSM shops."""
    def key(lat, lon):
        return (int(np.floor(lat / cell)), int(np.floor(lon / cell)))
    osm = Counter(key(la, lo) for k, la, lo in osm_points if k == "shop")
    sub = ovt_df[(ovt_df["grp"] == "shop_retail") & (ovt_df["confidence"].fillna(-1) >= 0.5)]
    ovt = Counter(key(la, lo) for la, lo in zip(sub["lat"], sub["lon"]))
    cells = set(osm) | set(ovt)
    thin_osm = [c for c in cells if osm[c] < 5 and ovt[c] >= 20]
    both_zero = [c for c in cells if osm[c] == 0 and ovt[c] == 0]
    return {
        "cell_deg": cell,
        "cells_with_any_shop_data": len(cells),
        "cells_overture_20plus_but_osm_under_5": len(thin_osm),
        "overture_shops_in_those_cells": int(sum(ovt[c] for c in thin_osm)),
        "osm_shops_in_those_cells": int(sum(osm[c] for c in thin_osm)),
        "total_overture_shop_conf05": int(sum(ovt.values())),
        "total_osm_shop": int(sum(osm.values())),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--skip-overture", action="store_true")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    poly = load_poly(a.raw / "delhi.poly")
    print("boundary bounds (minx, miny, maxx, maxy):", [round(v, 4) for v in poly.bounds], flush=True)

    print("reading OSM extract ...", flush=True)
    h = OsmCounter()
    h.apply_file(str(a.raw / "delhi.osm.pbf"), locations=True, idx="flex_mem")
    osm = {}
    for r in ("delhi", "kb", "central"):
        osm[r] = {
            "features": {k: h.counts[r][k] for k in KINDS},
            "walkable_ways": int(sum(h.way_n[r].values())),
            "walkable_km": round(sum(h.way_km[r].values()), 1),
            "main_road_km": round(sum(v for k, v in h.way_km[r].items() if k in MAIN_ROADS), 1),
            "ways_by_class_km": {k: round(v, 1) for k, v in sorted(h.way_km[r].items(), key=lambda x: -x[1])},
            "ways_with_lit_tag": int(sum(h.lit_ways[r].values())),
            "lit_values": dict(h.lit_ways[r]),
        }
    results = {"osm": osm}
    print(json.dumps({r: {"features": osm[r]["features"], "km": osm[r]["walkable_km"], "ways": osm[r]["walkable_ways"], "lit": osm[r]["ways_with_lit_tag"]} for r in osm}, indent=1), flush=True)

    if not a.skip_overture:
        parquet = a.raw / "overture_places_delhi_bbox.parquet"
        if not parquet.exists():
            print(f"querying Overture {OVERTURE_RELEASE} for the Delhi bounding box ...", flush=True)
            overture_pull(poly, str(parquet).replace("\\", "/"))
        print("computing Overture statistics ...", flush=True)
        ostats, df = overture_stats(str(parquet).replace("\\", "/"), poly)
        results["overture"] = ostats
        results["grid"] = grid_compare(h.points, df)
        print(json.dumps({"overture": ostats, "grid": results["grid"]}, indent=1), flush=True)

    results["meta"] = {"overture_release": OVERTURE_RELEASE, "kb_box_SWNE": KB, "central_box_SWNE": CENTRAL}
    (a.out / "m0_counts.json").write_text(json.dumps(results, indent=1))
    print("wrote", a.out / "m0_counts.json")


if __name__ == "__main__":
    sys.exit(main())
