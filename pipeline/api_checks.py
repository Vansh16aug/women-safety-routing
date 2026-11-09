"""M5 checks against the running server: random routes across Delhi, edge cases, timings.

Usage: python -I api_checks.py <processed dir> <out json> [base url]
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

processed, out_json = Path(sys.argv[1]), Path(sys.argv[2])
base = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8765"
rng = np.random.default_rng(11)


def call(slat, slon, elat, elon, hour):
    q = urllib.parse.urlencode({"slat": slat, "slon": slon, "elat": elat, "elon": elon, "hour": hour})
    t = time.time()
    try:
        with urllib.request.urlopen(f"{base}/api/route?{q}", timeout=120) as r:
            return r.status, json.load(r), time.time() - t
    except urllib.error.HTTPError as e:
        return e.code, json.load(e), time.time() - t


seg = pd.read_parquet(processed / "segments.parquet", columns=["mid_lat", "mid_lon"])
pts = seg.sample(4000, random_state=3)[["mid_lat", "mid_lon"]].values


def haversine_m(a, b):
    dy = (a[0] - b[0]) * 111_000
    dx = (a[1] - b[1]) * 111_000 * np.cos(np.radians(28.6))
    return float(np.hypot(dx, dy))


checks, rows = [], []


def check(name, ok, detail=""):
    checks.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


# random routes at three hours
n_ok = n_err = 0
errs = {}
for i in range(60):
    while True:
        a, b = pts[rng.integers(len(pts))], pts[rng.integers(len(pts))]
        if 800 <= haversine_m(a, b) <= 6000:
            break
    hour = [11, 19, 23][i % 3]
    code, d, dt = call(a[0], a[1], b[0], b[1], hour)
    if code == 200:
        n_ok += 1
        f = d["routes"][0]
        alt = d["routes"][1:]
        rows.append({"hour": hour, "straight_m": round(haversine_m(a, b)), "secs": round(dt, 2),
                     "n_routes": len(d["routes"]), "fast_score": f["score"], "fast_m": f["length_m"],
                     "best_score": max(r["score"] for r in d["routes"]),
                     "alt_detour_min": [r["detour_minutes"] for r in alt],
                     "snap_start": d["start"]["snap_m"], "snap_end": d["end"]["snap_m"]})
    else:
        n_err += 1
        errs[d.get("error", "?")] = errs.get(d.get("error", "?"), 0) + 1
df = pd.DataFrame(rows)
check("random routes: at least 95% return a route", n_ok >= 57, f"{n_ok} ok, {n_err} errors {errs}")
check("every route is scored within 0-100", ((df.fast_score >= 0) & (df.fast_score <= 100)).all())
check("best route scores at least the fastest route", (df.best_score >= df.fast_score).all())
check("slowest response under 10 seconds", df.secs.max() < 10, f"max {df.secs.max():.2f}s, median {df.secs.median():.2f}s")
alt_share = float((df.n_routes > 1).mean())
detours = [x for xs in df.alt_detour_min for x in xs]
check("alternatives never exceed the 1.6x detour limit", all(r <= 0.61 * f / 80 + 1e-6 for f, xs in zip(df.fast_m, df.alt_detour_min) for r in xs),
      f"max detour {max(detours) if detours else 0} min")

# edge cases
code, d, _ = call(28.6480, 77.1890, 28.6480, 77.1890, 22)
check("same start and end gives a clear error", code == 400 and "same" in d.get("error", ""), d.get("error", ""))
code, d, _ = call(28.6480, 77.1890, 28.95, 77.2, 22)
check("point outside Delhi gives a clear error", code == 400 and "outside" in d.get("error", ""), d.get("error", ""))
code, d, _ = call(28.50, 77.05, 28.75, 77.30, 22)
check("very long trip gives a clear error", code == 400 and "km apart" in d.get("error", ""), d.get("error", ""))
code, _, _ = call(28.6480, 77.1890, 28.6435, 77.1995, 27)
check("hour above 23 wraps instead of failing", code == 200)

# day versus night on the same Karol Bagh pairs
kb_rows = []
for _ in range(15):
    while True:
        a = pts[rng.integers(len(pts))]
        b = pts[rng.integers(len(pts))]
        if all(28.64 <= p[0] <= 28.66 and 77.18 <= p[1] <= 77.205 for p in (a, b)) and 500 <= haversine_m(a, b) <= 1800:
            break
    s_day = call(a[0], a[1], b[0], b[1], 12)[1]["routes"][0]["score"]
    s_night = call(a[0], a[1], b[0], b[1], 23)[1]["routes"][0]["score"]
    kb_rows.append((s_day, s_night))
kb = np.array(kb_rows)
check("Karol Bagh: fastest route scores lower at night than by day on every pair", (kb[:, 1] < kb[:, 0]).all(),
      f"mean day {kb[:, 0].mean():.1f}, mean night {kb[:, 1].mean():.1f}")

summary = {
    "random_routes": {"n": len(df), "median_secs": round(float(df.secs.median()), 2), "max_secs": round(float(df.secs.max()), 2),
                      "share_with_alternative": round(alt_share, 2),
                      "mean_score_gain_when_alternative": round(float((df[df.n_routes > 1].best_score - df[df.n_routes > 1].fast_score).mean()), 1) if (df.n_routes > 1).any() else None,
                      "mean_alt_detour_min": round(float(np.mean(detours)), 1) if detours else None,
                      "max_snap_m": int(max(df.snap_start.max(), df.snap_end.max())),
                      "by_hour_mean_fastest_score": {int(h): round(float(v), 1) for h, v in df.groupby("hour").fast_score.mean().items()}},
}
print(json.dumps(summary, indent=1), flush=True)
out_json.write_text(json.dumps({"summary": summary, "checks": checks}, indent=1))
print(f"{sum(c['ok'] for c in checks)}/{len(checks)} checks passed; wrote {out_json}")
sys.exit(0 if all(c["ok"] for c in checks) else 1)
