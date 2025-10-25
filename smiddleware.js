// middleware.js
import { NextResponse } from "next/server";

const UPSTREAM_HOST = "ev.turnitin.com";

/**
 * Keep injected cookies SHORT and specific.
 * Do NOT paste analytics cookies (ga, utm, hj, etc.)
 * Example format: "session-id=...; legacy-session-id=...; cwr_u=..."
 */
const INJECTED_COOKIE = process.env.TURNITIN_COOKIE || ""; // keep it concise

export async function middleware(req) {
  const url = new URL(req.url);

  // Only proxy site routes; skip Next internals and assets
  if (url.pathname.startsWith("/_next") || url.pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const upstream = new URL(req.url);
  upstream.protocol = "https:";
  upstream.username = "";
  upstream.password = "";
  upstream.port = "";
  upstream.host = UPSTREAM_HOST; // domain reverse only

  // Build forward headers (avoid hop-by-hop and sec-* headers)
  const fwd = new Headers();

  // Pass through a few safe headers
  for (const h of [
    "accept",
    "accept-language",
    "cache-control",
    "pragma",
    "upgrade-insecure-requests",
  ]) {
    const v = req.headers.get(h);
    if (v) fwd.set(h, v);
  }

  // Helpful for some CDNs: present a normal UA + referer to the upstream domain
  fwd.set("user-agent", req.headers.get("user-agent") || "Mozilla/5.0");
  fwd.set("referer", `https://${UPSTREAM_HOST}/`);
  fwd.set("origin", `https://${UPSTREAM_HOST}`);

  // Merge cookies: user cookies + your injected cookie (dedupe & size guard)
  const incomingCookie = req.headers.get("cookie") || "";
  const merged = mergeCookies([incomingCookie, INJECTED_COOKIE].filter(Boolean));
  if (merged) fwd.set("cookie", merged);

  // Never forward accept-encoding; let the edge re-encode
  // Never set 'host' manually—fetch sets it from the URL/authority

  // Middleware can’t stream request bodies reliably; restrict to GET/HEAD

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstream.toString(), {
      method: req.method,
      headers: fwd,
      // Let redirects happen (auth/CDN flows often 302/307)
      redirect: "follow",
    });
  } catch (err) {
    // Network/TLS/DNS/CDN block/etc.
    return textError(502, `Upstream fetch failed: ${err?.message || err}`);
  }

  // If upstream returns 404 and you expected a trailing slash, try once with '/'
  if (upstreamResp.status === 404 && !upstream.pathname.endsWith("/")) {
    try {
      const retry = new URL(upstream);
      retry.pathname = retry.pathname + "/";
      upstreamResp = await fetch(retry.toString(), { method, headers: fwd, redirect: "follow" });
    } catch (err) {
      // keep original 404 below
    }
  }

  // Prepare response headers
  const out = new Headers(upstreamResp.headers);
  out.set("x-proxied-by", "vercel-edge-middleware");
  out.set("access-control-allow-origin", url.origin);
  out.set("vary", "origin");

  // Strip noisy/sensitive headers
  for (const h of [
    "content-security-policy-report-only",
    "report-to",
    "nel",
    "server",
    "alt-svc",
    "transfer-encoding",
    "content-encoding", // re-encode at edge
  ]) out.delete(h);

  // Forward upstream Set-Cookie(s) back to the browser
  // getSetCookie() is available in Edge runtime; fall back to single header if needed
  const getSetCookie = upstreamResp.headers.getSetCookie?.();
  if (Array.isArray(getSetCookie)) {
    // multiple Set-Cookie headers
    getSetCookie.forEach((sc) => out.append("set-cookie", sc));
  } else {
    const sc = upstreamResp.headers.get("set-cookie");
    if (sc) out.set("set-cookie", sc);
  }

  return new NextResponse(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: out,
  });
}

// Utility: merge cookie strings safely, dedupe by name, cap length
function mergeCookies(cookieStrings, maxLen = 4096) {
  // Parse into map by cookie-name
  const map = new Map();
  for (const str of cookieStrings) {
    for (const part of str.split(";")) {
      const kv = part.trim();
      if (!kv) continue;
      const eq = kv.indexOf("=");
      if (eq === -1) continue;
      const name = kv.slice(0, eq).trim();
      const value = kv.slice(eq + 1).trim();
      if (!name) continue;
      // Skip analytics/tracking noise to keep header small and avoid blocks
      if (/^(_ga|_gid|_gcl_au|__utm|_hj|apt\.)/i.test(name)) continue;
      map.set(name, value);
    }
  }
  const merged = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  return merged.length > maxLen ? merged.slice(0, maxLen) : merged;
}

function textError(status, message) {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  // Proxy everything except Next internals and common assets
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
