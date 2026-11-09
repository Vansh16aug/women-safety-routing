import type { NextConfig } from "next";

const config: NextConfig = {
  // The API reads the exported runtime data from disk, so tell the bundler to ship it with the functions.
  outputFileTracingIncludes: { "/api/**": ["./data/runtime/**/*"] },
  async rewrites() {
    // The map page is a static file in /public.
    return { beforeFiles: [{ source: "/", destination: "/index.html" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default config;
