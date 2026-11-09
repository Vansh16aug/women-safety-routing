"""Exports what the TypeScript runtime needs from the Python engine into data/runtime/.

Usage: python -I -X utf8 export_runtime.py --processed <data/processed> --out <data/runtime>

The Python Engine (server.py) stays the reference: this script loads it and writes its arrays as flat binary files
(little-endian typed arrays), so the TypeScript port starts from exactly the same graph, places and scores.
Node ids are compacted to the main connected component. Run it again whenever data/processed changes.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config as C
import server as S


def w(out, name, arr, dtype):
    a = np.ascontiguousarray(arr, dtype=dtype)
    (out / name).write_bytes(a.tobytes())
    return int(a.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--processed", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    out = a.out
    (out / "layers").mkdir(parents=True, exist_ok=True)

    e = S.Engine(a.processed)
    sc = e.scorer
    counts = {}

    # ---- graph: compact node ids to the main component ----
    comp = e.in_comp
    new_id = np.cumsum(comp) - 1
    nodes = e.nodes
    counts["nodes"] = w(out, "node_xy.f64", e.node_xy[comp], "<f8") // 2
    counts["nodes_ll"] = w(out, "node_ll.f64", np.column_stack([nodes["lon"].values[comp], nodes["lat"].values[comp]]), "<f8") // 2
    seg = e.seg
    counts["edges"] = w(out, "seg_u.i32", new_id[seg.ui.values], "<i4")
    w(out, "seg_v.i32", new_id[seg.vi.values], "<i4")
    w(out, "seg_len.f64", seg["length_m"].values.astype(float), "<f8")
    w(out, "seg_main.u8", seg["is_main_road"].values.astype(bool), "u1")
    for bn in S.BAND_NAMES:
        w(out, f"seg_open_{bn}.f64", seg[f"open_exp_{bn}"].values.astype(float), "<f8")

    # segment geometry as int32 degrees * 1e7 (exact for the 6 to 7 decimals in the source)
    offs, flat = [0], []
    for wkt in seg["geom_wkt"].values:
        c = S.parse_wkt(wkt)
        flat.append(np.round(c * 1e7).astype(np.int64))
        offs.append(offs[-1] + len(c))
    w(out, "seg_geom_off.i32", np.array(offs), "<i4")
    counts["vertices"] = w(out, "seg_geom.i32", np.vstack(flat), "<i4") // 2

    # ---- places ----
    pl = sc.pl
    kinds = sorted(pl["kind"].unique().tolist())
    kind_code = {k: i for i, k in enumerate(kinds)}
    counts["places"] = w(out, "pl_xy.f64", sc.pl_xy, "<f8") // 2
    w(out, "pl_ll.f64", pl[["lon", "lat"]].values, "<f8")
    w(out, "pl_open.f64", sc.pl_open, "<f8")
    w(out, "pl_conf.u8", sc.pl_conf, "u1")                      # status == confirmed (used by the scorer)
    w(out, "pl_isconf.u8", pl["is_conf"].values.astype(bool), "u1")   # shown in help rows
    w(out, "pl_kind.u8", pl["kind"].map(kind_code).values, "u1")
    (out / "pl_names.json").write_text(json.dumps(pl["name"].fillna("").tolist(), ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    for kind, (idx, _) in e.help_places.items():
        w(out, f"help_{kind}.i32", idx, "<i4")

    # ---- other point sets, in metres ----
    w(out, "lamps_xy.f64", sc.lamp_xy, "<f8")
    w(out, "cctv_xy.f64", sc.cctv_xy, "<f8")
    w(out, "bus_xy.f64", sc.bus_xy, "<f8")
    w(out, "metro_xy.f64", sc.metro_xy, "<f8")
    w(out, "station_xy.f64", sc.station_xy, "<f8")
    (out / "station_names.json").write_text(json.dumps(sc.station_names, ensure_ascii=False, separators=(",", ":")), encoding="utf8")

    # ---- search table (columnar) ----
    sd = e.search_df
    (out / "search.json").write_text(json.dumps({
        "name": sd["name"].tolist(), "kind": sd["kind"].tolist(), "lat": sd["lat"].round(6).tolist(),
        "lon": sd["lon"].round(6).tolist(), "norm": sd["name_norm"].tolist(), "kw": sd["kw"].astype(float).tolist(),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    counts["search_rows"] = len(sd)

    # ---- ready-made layers (the API wraps them with a meta block) ----
    for kind in S.EXPLORE_KINDS:
        (out / "layers" / f"places_{kind}.json").write_text(json.dumps(e.places_all(kind), ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    for name in S.OVERLAYS:
        (out / "layers" / f"{name}.json").write_text(json.dumps(e.overlay_points(name), separators=(",", ":")), encoding="utf8")
    (out / "layers" / "metro_lines.json").write_text(json.dumps(e.metro_lines(), separators=(",", ":")), encoding="utf8")

    # ---- settings, taken from config.py so the two runtimes cannot drift ----
    cfg = {k: getattr(C, k) for k in dir(C) if k.isupper() and not k.startswith("_")}
    cfg["WALKABLE"] = sorted(cfg["WALKABLE"])
    cfg["MAIN_ROADS"] = sorted(cfg["MAIN_ROADS"])
    cfg["HELP_KINDS"] = sorted(cfg["HELP_KINDS"])
    cfg["PRIORS"] = {k: list(v) for k, v in cfg["PRIORS"].items()}
    cfg["engine"] = {
        "ALPHAS": S.ALPHAS, "DELHI_BOX": S.DELHI_BOX, "BALANCED_MAX_RATIO": S.BALANCED_MAX_RATIO,
        "ACTIVE_MAX_RATIO": S.ACTIVE_MAX_RATIO, "MAX_STRAIGHT_M": S.MAX_STRAIGHT_M, "EXPLORE_KINDS": list(S.EXPLORE_KINDS),
        "OVERLAYS": list(S.OVERLAYS), "HELP_KINDS": list(S.HELP_KINDS), "HELP_DEDUPE_M": S.HELP_DEDUPE_M, "MIN_GAIN": S.MIN_GAIN,
        "KIND_LABEL": S.KIND_LABEL, "DETAIL_MIN_PROB": 0.2, "DETAIL_MAX_PLACES": 400,
    }
    cfg["kinds"] = kinds
    cfg["bands"] = [list(b) for b in C.BANDS]
    cfg["counts"] = counts
    (out / "config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf8")
    total = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"wrote {out} ({total / 1e6:.1f} MB): {counts}")


if __name__ == "__main__":
    main()
