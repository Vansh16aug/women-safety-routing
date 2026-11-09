"""Build the local search index (places, streets, localities, stations, landmarks).

Reads the OSM extract and the M1 outputs; writes search.parquet next to them.
Usage: python -I build_search.py --raw <data/raw> --processed <data/processed>
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
import osmium
import pandas as pd

AREA_VALUES = {"suburb", "neighbourhood", "quarter", "locality", "village", "town", "city", "hamlet", "city_block"}
LANDMARK_AMENITY = {"school", "college", "university", "townhall", "library", "marketplace", "bus_station",
                    "courthouse", "theatre", "arts_centre", "community_centre"}
LANDMARK_LEISURE = {"park", "garden", "stadium", "sports_centre"}
LANDMARK_TOURISM = {"attraction", "museum", "gallery", "zoo"}


def norm(s):
    s = re.sub(r"[^\w\s]", " ", str(s).lower())
    return re.sub(r"\s+", " ", s).strip()


class Names(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []

    def _add(self, tags, lat, lon):
        name = tags.get("name") or tags.get("name:en")
        if not name:
            return
        kind = None
        if tags.get("place") in AREA_VALUES:
            kind = "area"
        elif tags.get("railway") in ("station", "halt", "subway_entrance") or tags.get("public_transport") == "station":
            kind = "station"
        elif tags.get("amenity") in LANDMARK_AMENITY or tags.get("leisure") in LANDMARK_LEISURE \
                or tags.get("tourism") in LANDMARK_TOURISM or tags.get("shop") == "mall":
            kind = "landmark"
        if kind:
            self.rows.append((name, kind, lat, lon))

    def node(self, n):
        if n.tags and n.location.valid():
            self._add(n.tags, n.location.lat, n.location.lon)

    def way(self, w):
        if not w.tags or w.tags.get("highway"):
            return
        for nd in w.nodes:
            if nd.location.valid():
                self._add(w.tags, nd.location.lat, nd.location.lon)
                break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--processed", required=True, type=Path)
    a = ap.parse_args()

    h = Names()
    h.apply_file(str(a.raw / "delhi.osm.pbf"), locations=True, idx="flex_mem")
    osm = pd.DataFrame(h.rows, columns=["name", "kind", "lat", "lon"])
    print("OSM areas/stations/landmarks:", osm["kind"].value_counts().to_dict(), flush=True)

    seg = pd.read_parquet(a.processed / "segments.parquet", columns=["name", "mid_lat", "mid_lon", "highway", "length_m"])
    seg = seg[seg["name"].notna() & ~seg["highway"].isin(["footway", "steps", "path", "track", "service", "cycleway"])]
    rows = []
    for name, g in seg.groupby("name"):
        cy, cx = g["mid_lat"].mean(), g["mid_lon"].mean()
        j = int(np.argmin((g["mid_lat"].values - cy) ** 2 + (g["mid_lon"].values - cx) ** 2))
        rows.append((name, "street", float(g["mid_lat"].iloc[j]), float(g["mid_lon"].iloc[j])))
    streets = pd.DataFrame(rows, columns=["name", "kind", "lat", "lon"])
    print("streets:", len(streets), flush=True)

    pl = pd.read_parquet(a.processed / "places.parquet", columns=["name", "lat", "lon"])
    pl = pl[pl["name"].notna()].copy()
    pl["kind"] = "place"
    print("named places:", len(pl), flush=True)

    df = pd.concat([osm, streets, pl[["name", "kind", "lat", "lon"]]], ignore_index=True)
    df["name_norm"] = df["name"].map(norm)
    df = df[df["name_norm"].str.len() >= 2].drop_duplicates(["name_norm", "kind", "lat", "lon"]).reset_index(drop=True)
    df.to_parquet(a.processed / "search.parquet", index=False)
    print("wrote", a.processed / "search.parquet", len(df), "rows", flush=True)


if __name__ == "__main__":
    sys.exit(main())
