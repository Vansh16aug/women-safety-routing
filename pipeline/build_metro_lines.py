"""Builds data/processed/metro_lines.geojson: every Delhi metro and RapidX line as lines, with the colour OSM records for it.

Usage: python -I -X utf8 build_metro_lines.py --raw <data/raw> --out <data/processed>

Each OSM route relation (route=subway, light_rail or monorail) carries a `colour` tag and lists the track ways it runs
over. Both directions of a line share their ways, so a way is written once per line.
"""
import argparse
import json
from pathlib import Path

import osmium

ROUTES = ("subway", "light_rail", "monorail")


class Relations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.lines = {}   # line name -> {"color": str, "ways": set of way ids}

    def relation(self, r):
        t = r.tags
        if t.get("type") != "route" or t.get("route") not in ROUTES or not t.get("colour"):
            return
        line = t.get("name", "").split(" (")[0].strip()
        if not line:
            return
        entry = self.lines.setdefault(line, {"color": t.get("colour").upper(), "ways": set()})
        for m in r.members:
            if m.type == "w" and m.role in ("", "track", "main"):   # platforms and stop areas are not track
                entry["ways"].add(m.ref)


class Ways(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted = wanted
        self.geom = {}

    def way(self, w):
        if w.id in self.wanted:
            try:
                self.geom[w.id] = [[round(n.lon, 6), round(n.lat, 6)] for n in w.nodes]
            except osmium.InvalidLocationError:
                pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    pbf = str(a.raw / "delhi.osm.pbf")
    rel = Relations()
    rel.apply_file(pbf)
    wanted = set().union(*(e["ways"] for e in rel.lines.values()))
    ways = Ways(wanted)
    ways.apply_file(pbf, locations=True, idx="flex_mem")
    features = []
    for line, e in sorted(rel.lines.items()):
        for wid in sorted(e["ways"]):
            coords = ways.geom.get(wid)
            if coords and len(coords) > 1:
                features.append({"type": "Feature", "properties": {"line": line, "color": e["color"]},
                                 "geometry": {"type": "LineString", "coordinates": coords}})
    out = a.out / "metro_lines.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf8")
    print(f"{len(rel.lines)} lines, {len(features)} track pieces -> {out}")
    for line, e in sorted(rel.lines.items()):
        print(f"  {line}: {e['color']}, {sum(1 for f in features if f['properties']['line'] == line)} pieces")


if __name__ == "__main__":
    main()
