"""Writes tests/reference.json: what the Python engine returns for a fixed set of requests.
The TypeScript runtime is checked against it (npm run parity). Not committed: regenerate it with this script.

Usage: python -I -X utf8 dump_reference.py --processed <data/processed> --out <tests/reference.json>
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import server as S

ROUTES = [
    ("kamla-daryaganj", 28.6806, 77.2039, 28.64609, 77.243048, 22),
    ("kamla-daryaganj-noon", 28.6806, 77.2039, 28.64609, 77.243048, 12),
    ("karol-bagh-cp", 28.6519, 77.1909, 28.6562, 77.2410, 22),
    ("karol-bagh-short", 28.6519, 77.1909, 28.6550, 77.1980, 20),
    ("hauz-khas-nehru", 28.5494, 77.2001, 28.5491, 77.2518, 23),
    ("rajouri-cp-night", 28.6492, 77.1220, 28.6315, 77.2167, 2),
    ("saket-vasant-kunj", 28.5245, 77.2066, 28.5200, 77.1590, 22),
    ("cp-okhla", 28.6139, 77.2090, 28.5535, 77.2588, 19),
    ("civil-lines-ito", 28.6692, 77.2090, 28.6562, 77.2410, 22),
]
HELP = [("karol-bagh", 28.6519, 77.1909, 23), ("saket", 28.5245, 77.2066, 2), ("rohini", 28.7041, 77.1025, 20)]
SEARCH = [("karol bagh", None, None), ("connaught", 28.63, 77.22), ("aiims", None, None), ("hauz khas metro", None, None),
          ("rajiv chowk", 28.65, 77.19), ("nehru pl", None, None), ("xyz", None, None)]
ERRORS = [("same-spot", 28.6519, 77.1909, 28.65191, 77.19091, 22), ("too-far", 28.45, 77.0, 28.85, 77.3, 22)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--processed", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    e = S.Engine(a.processed)
    out = {"routes": {}, "help": {}, "search": {}, "errors": {}}
    for name, *args in ROUTES:
        out["routes"][name] = {"args": args, "result": e.routes(*args)}
    for name, lat, lon, hour in HELP:
        out["help"][name] = {"args": [lat, lon, hour], "result": e.help(lat, lon, hour)}
    for q, lat, lon in SEARCH:
        out["search"][q] = {"args": [q, lat, lon], "result": e.search(q, lat, lon)}
    for name, *args in ERRORS:
        try:
            e.routes(*args)
            out["errors"][name] = {"args": args, "error": None}
        except ValueError as ex:
            out["errors"][name] = {"args": args, "error": str(ex)}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(out), encoding="utf8")
    print(f"wrote {a.out} ({a.out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
