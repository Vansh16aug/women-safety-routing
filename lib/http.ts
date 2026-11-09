export const API_VERSION = "1";

export const META = {
  version: API_VERSION,
  type: "prototype",
  disclaimer:
    "Night Activity Score is an activity estimate from public map data, NOT a safety rating. " +
    "Most opening hours are estimated from the type of place. Do not use it as the only input for a safety decision.",
  attribution: "Street data (c) OpenStreetMap contributors (ODbL). Places also from Overture Maps Foundation.",
};

// requests allowed per client per minute: light calls, and whole-city data dumps
export const LIMIT_LIGHT = 60;
export const LIMIT_HEAVY = 10;

/**
 * Fixed one-minute window per client, in memory. On a serverless host every instance keeps its own counts and
 * they reset when an instance is recycled, so this slows casual abuse but is not a hard guarantee.
 * Use the host's firewall rules for a real limit.
 */
const hits = new Map<string, { start: number; n: number }>();

export function checkLimit(client: string, heavy: boolean) {
  const now = Date.now();
  const limit = heavy ? LIMIT_HEAVY : LIMIT_LIGHT;
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start >= 60_000) hits.delete(k);
  }
  const key = `${heavy ? "h" : "l"}:${client}`;
  let h = hits.get(key);
  if (!h || now - h.start >= 60_000) {
    h = { start: now, n: 0 };
    hits.set(key, h);
  }
  h.n++;
  return {
    ok: h.n <= limit,
    limit,
    remaining: Math.max(0, limit - h.n),
    retryAfter: Math.max(1, Math.ceil(60 - (now - h.start) / 1000)),
  };
}
