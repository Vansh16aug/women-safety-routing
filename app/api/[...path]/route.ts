import { loadData, layerText } from "../../../lib/data";
import { InputError, checkInBox, help, info, routes, search } from "../../../lib/engine";
import { META, checkLimit } from "../../../lib/http";
import spec from "../../../docs/openapi.json";

export const runtime = "nodejs";
export const maxDuration = 30;

const HEAVY = new Set(["places", "layer"]);
const DUMP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function respond(body: string, status: number, v1: boolean, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra };
  if (v1) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["X-Night-Routes-Disclaimer"] = "activity estimate, not a safety rating";
  }
  return new Response(body, { status, headers });
}

function withMeta(payload: unknown, v1: boolean): string {
  if (v1 && payload && typeof payload === "object" && !Array.isArray(payload)) {
    return JSON.stringify({ ...(payload as object), meta: META });
  }
  return JSON.stringify(payload);
}

function num(sp: URLSearchParams, key: string): number {
  const raw = sp.get(key);
  const v = raw === null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(v)) throw new InputError(raw === null ? `'${key}'` : `could not convert string to float: '${raw}'`);
  return v;
}

function hourOf(sp: URLSearchParams): number {
  const raw = sp.get("hour");
  if (raw === null) return 22;
  const v = Number(raw);
  if (!Number.isInteger(v)) throw new InputError(`invalid literal for int() with base 10: '${raw}'`);
  return ((v % 24) + 24) % 24;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const v1 = path[0] === "v1";
  const name = (v1 ? path.slice(1) : path).join("/");
  const sp = new URL(req.url).searchParams;

  try {
    if (v1 && name === "health") return respond(JSON.stringify({ status: "ok", meta: META }), 200, true);
    if (v1 && name === "openapi.json") return respond(JSON.stringify(spec), 200, true);

    let rate: Record<string, string> = {};
    if (v1) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
      const r = checkLimit(ip, HEAVY.has(name));
      rate = { "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": String(r.remaining) };
      if (!r.ok) {
        return respond(JSON.stringify({ error: "rate limit exceeded", retry_after_s: r.retryAfter }), 429, true, {
          "Retry-After": String(r.retryAfter),
        });
      }
    }

    const d = loadData();
    const E = d.cfg.engine;
    const ok = (payload: unknown) => respond(withMeta(payload, v1), 200, v1, rate);

    switch (name) {
      case "info":
        return ok(info(d));
      case "search": {
        const text = (sp.get("q") ?? "").slice(0, 80);
        const lat = sp.has("lat") ? num(sp, "lat") : undefined;
        const lon = sp.has("lon") ? num(sp, "lon") : undefined;
        return ok({ results: search(d, text, lat, lon) });
      }
      case "places": {
        const kind = sp.get("kind") ?? "";
        if (!(E.EXPLORE_KINDS as string[]).includes(kind)) return respond(JSON.stringify({ error: "unknown kind" }), 400, v1);
        const meta = v1 ? `,"meta":${JSON.stringify(META)}` : "";
        return respond(`{"kind":${JSON.stringify(kind)},"places":${layerText(`places_${kind}`)}${meta}}`, 200, v1, {
          ...rate,
          "Cache-Control": DUMP_CACHE,
        });
      }
      case "layer": {
        const layer = sp.get("name") ?? "";
        const meta = v1 ? `,"meta":${JSON.stringify(META)}` : "";
        if (layer === "metro_lines") {
          // a GeoJSON FeatureCollection: add the meta block as a foreign member
          const t = layerText("metro_lines");
          const body = v1 ? t.replace(/\}$/, `${meta}}`) : t;
          return respond(body, 200, v1, { ...rate, "Cache-Control": DUMP_CACHE });
        }
        if (!(E.OVERLAYS as string[]).includes(layer)) return respond(JSON.stringify({ error: "unknown layer" }), 400, v1);
        return respond(`{"name":${JSON.stringify(layer)},"points":${layerText(layer)}${meta}}`, 200, v1, {
          ...rate,
          "Cache-Control": DUMP_CACHE,
        });
      }
      case "help": {
        const lat = num(sp, "lat");
        const lon = num(sp, "lon");
        const hour = hourOf(sp);
        checkInBox(d, lat, lon);
        return ok(help(d, lat, lon, hour));
      }
      case "route": {
        const slat = num(sp, "slat");
        const slon = num(sp, "slon");
        const elat = num(sp, "elat");
        const elon = num(sp, "elon");
        const hour = hourOf(sp);
        checkInBox(d, slat, slon);
        checkInBox(d, elat, elon);
        return ok(routes(d, slat, slon, elat, elon, hour));
      }
      default:
        return respond(JSON.stringify({ error: "not found" }), 404, v1);
    }
  } catch (e) {
    if (e instanceof InputError) return respond(JSON.stringify({ error: e.message }), 400, v1);
    console.error(e);
    return respond(JSON.stringify({ error: "internal error" }), 500, v1);
  }
}
