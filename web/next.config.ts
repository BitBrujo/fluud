import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

/**
 * Fluud's UI is a *build-time* artifact. `output: 'export'` compiles this
 * to plain files that FastAPI serves at `/`, same-origin, out of the same
 * container. There is no Node at runtime and no second service — which is why
 * every fetch in this app is a bare relative path and there is no
 * NEXT_PUBLIC_API_BASE anywhere to get wrong.
 */
const nextConfig: NextConfig = {
  output: "export",

  /*
   * ⚠️ **NOT cosmetic, and not about URL taste.** This is what makes the
   * second route reachable at all once FastAPI is the server.
   *
   * `api.py` mounts the export with `StaticFiles(html=True)`. That resolves a
   * request path to a file on disk, and falls back to `<path>/index.html` only
   * when `<path>` is a **directory**. With `trailingSlash: false` Next exports
   * the workspace as `out/map.html`, so a request for `/map` looks for a file
   * literally named `map`, finds nothing, and answers with `404.html` — a
   * working page that is simply unreachable in production while working
   * perfectly under `next dev`. With this on, the export is
   * `out/map/index.html`, which the mount serves at both `/map` and `/map/`.
   *
   * So: **adding a route to this app means adding a directory to the export.**
   * If this ever goes back to false, every route below `/` disappears in
   * production only, and nothing in the build says so.
   */
  trailingSlash: true,

  // The camera stills are arbitrary URLs from the NYC DOT API, and under
  // `output: 'export'` there is no Next server to optimize them anyway.
  images: { unoptimized: true },
};

/**
 * Dev-only proxy to the FastAPI process on :8080.
 *
 * `rewrites()` DO NOT EXIST under `output: 'export'` — this is the one real
 * dev/prod divergence in the port, and it is worth knowing about. In
 * production the same relative paths work for a different reason: FastAPI
 * serves the bundle and the API from one origin. The app code is identical;
 * the mechanism is not. `npm run prod:local` builds and stages into
 * waterline/web/ so the real serving path can be smoke-tested before it ships.
 *
 * Gated on NODE_ENV so `next build` doesn't warn about a rewrite it is about
 * to discard.
 */
if (process.env.NODE_ENV === "development") {
  /*
   * Checking the layout on a real phone means reaching this dev server by LAN
   * IP, and Next blocks cross-origin requests to `/_next/*` and `/_next/hmr`
   * unless the origin's HOSTNAME is on this list.
   *
   * ⚠️ **The failure does not look like a permissions error.** Only the dev
   * *internal* endpoints are guarded, so the HTML document arrives fine and
   * every chunk and the HMR socket come back `403 Unauthorized` — a page that
   * renders its shell, runs no JavaScript, and never refreshes. The 403s are
   * logged by the server and are invisible in the terminal's normal output.
   *
   * ⚠️ **This defaults to the machine's own LAN IPv4 addresses**, which is not
   * the same thing as hard-coding a subnet — it is allowing the exact host
   * `next dev` already prints as its own **Network:** URL. Following the URL
   * the tool just told you to use should not need configuration. Measured: with
   * no default, opening the printed Network URL blocked five chunks and the HMR
   * socket on first load.
   *
   * `WATERLINE_DEV_ORIGINS` still overrides, and it is what you need for a host
   * this cannot discover — a tunnel, a container host, an mDNS name. It takes
   * **hostnames, not origins**: `192.168.1.50` or `*.example.dev`, never
   * `http://192.168.1.50:3000`. Next parses the request's `Origin` down to a
   * hostname before matching, so a scheme or a port here simply never matches.
   *
   * ⚠️ **IPv4 only, deliberately.** Node's `URL` keeps the brackets on an IPv6
   * hostname (`[fe80::1]`) and the interface list does not, so a v6 address
   * added here would silently never match. `localhost` and `**.localhost` are
   * allowed by Next already and are not repeated.
   *
   * ⚠️ **This takes EVERY non-internal IPv4 the machine answers on, which is
   * more than the wifi address.** Measured on one dev box it produced the LAN
   * IP, seven Docker bridge gateways, and a **Tailscale** address — and that
   * last one is the only entry that widens anything beyond the local network,
   * because a tailnet can have other people's devices on it. The exposure is a
   * dev server's source and its HMR socket, to a host that would have to be on
   * your tailnet already. **If that trade is wrong for your network, name the
   * hosts yourself** — `WATERLINE_DEV_ORIGINS` replaces this list rather than
   * adding to it, which is what makes it a usable narrowing tool as well as a
   * widening one.
   */
  const override = process.env.WATERLINE_DEV_ORIGINS;
  nextConfig.allowedDevOrigins = override
    ? override
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : Object.values(networkInterfaces())
        .flat()
        .filter((n) => n && n.family === "IPv4" && !n.internal)
        .map((n) => n!.address);

  // `compress: false` IS NOT OPTIONAL, and it is not about speed.
  //
  // The dev server gzips proxied responses. A browser sends
  // `Accept-Encoding: gzip`, so `/api/events` comes back compressed — and the
  // gzip stream buffers, so the warning panel silently receives NOTHING while
  // the connection sits in readyState OPEN looking perfectly healthy. curl
  // does not send Accept-Encoding by default, so it works and the browser
  // doesn't, which is about as unpleasant as a bug gets. FastAPI does no
  // compression, so production was never affected.
  nextConfig.compress = false;

  const api = process.env.WATERLINE_API ?? "http://127.0.0.1:8080";
  nextConfig.rewrites = async () => [
    { source: "/api/:path*", destination: `${api}/api/:path*` },
    { source: "/healthz", destination: `${api}/healthz` },
  ];
}

export default nextConfig;
