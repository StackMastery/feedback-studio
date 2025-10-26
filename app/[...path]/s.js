export const runtime = "nodejs";

const UPSTREAM_HOST = "ev.turnitin.com";
const INJECTED_COOKIE = process.env.TURNITIN_COOKIE || "";

function mergeCookies(cookieStrings, maxLen = 4096) {
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
      if (/^(_ga|_gid|_gcl_au|__utm|_hj|apt\.)/i.test(name)) continue;
      map.set(name, value);
    }
  }
  const merged = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  return merged.length > maxLen ? merged.slice(0, maxLen) : merged;
}

function sanitizeResponseHeaders(h) {
  const out = new Headers(h);
  for (const k of [
    "content-security-policy-report-only",
    "report-to",
    "nel",
    "server",
    "alt-svc",
    "transfer-encoding",
    "content-encoding",
  ])
    out.delete(k);
  return out;
}

function buildForwardHeaders(req) {
  const fwd = new Headers();

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

  fwd.set("user-agent", req.headers.get("user-agent") || "Mozilla/5.0");
  fwd.set("referer", req.headers.get("referer") || `https://${UPSTREAM_HOST}/`);
  fwd.set("origin", `https://${UPSTREAM_HOST}`);

  const incomingCookie = req.headers.get("cookie") || "";
  const merged = mergeCookies(
    [incomingCookie, INJECTED_COOKIE].filter(Boolean)
  );
  if (merged) fwd.set("cookie", merged);

  return fwd;
}

function copySetCookie(src, dst) {
  const anyHeaders = src;
  if (typeof anyHeaders.getSetCookie === "function") {
    for (const sc of anyHeaders.getSetCookie()) dst.append("set-cookie", sc);
    return;
  }
  const raw = anyHeaders.raw?.();
  const setCookies = raw?.["set-cookie"];
  if (Array.isArray(setCookies)) {
    for (const sc of setCookies) dst.append("set-cookie", sc);
  } else {
    const sc = src.get("set-cookie");
    if (sc) dst.set("set-cookie", sc);
  }
}

async function handle(req) {
  const inUrl = new URL(req.url);
  const upstream = new URL(req.url);
  upstream.protocol = "https:";
  upstream.username = "";
  upstream.password = "";
  upstream.port = "";
  upstream.host = UPSTREAM_HOST;

  const fwd = buildForwardHeaders(req);
  const method = req.method;

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstream.toString(), {
      method,
      headers: fwd,
      redirect: "follow",
    });
  } catch (err) {
    console.error(err);
    return new Response(
      `Upstream fetch failed: ${err?.message || String(err)}`,
      {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }
    );
  }

  // Retry if 404 and missing trailing slash
  if (upstreamResp.status === 404 && !upstream.pathname.endsWith("/")) {
    try {
      const retry = new URL(upstream);
      retry.pathname += "/";
      upstreamResp = await fetch(retry.toString(), {
        method,
        headers: fwd,
        redirect: "follow",
      });
    } catch {}
  }

  const out = sanitizeResponseHeaders(upstreamResp.headers);
  out.set("x-proxied-by", "next-node-runtime-proxy");
  out.set("access-control-allow-origin", inUrl.origin);
  out.set("vary", "origin");

  copySetCookie(upstreamResp.headers, out);

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: out,
  });
}

function buildPostHeadersFromExample(req) {
  const h = new Headers();

  const setOrFallback = (name, fallback) => {
    const v = req.headers.get(name);
    if (v) h.set(name, v);
    else if (fallback !== undefined) h.set(name, fallback);
  };

  setOrFallback("accept", "*/*");
  setOrFallback("accept-language", "en,bn;q=0.9");
  setOrFallback("content-type", "application/json");
  setOrFallback("priority", "u=1, i");
  setOrFallback(
    "sec-ch-ua",
    '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"'
  );
  setOrFallback("sec-ch-ua-mobile", "?0");
  setOrFallback("sec-ch-ua-platform", '"Windows"');
  setOrFallback("sec-fetch-dest", "empty");
  setOrFallback("sec-fetch-mode", "cors");
  setOrFallback("sec-fetch-site", "same-origin");
  setOrFallback("x-palladium", "1");
  setOrFallback("x-requested-with", "XMLHttpRequest");
  setOrFallback("x-sproutcore-version", "1.11.0");

  h.set("user-agent", req.headers.get("user-agent") || "Mozilla/5.0");
  h.set("referer", req.headers.get("referer") || `https://${UPSTREAM_HOST}/`);
  h.set("origin", req.headers.get("origin") || `https://${UPSTREAM_HOST}`);

  const incomingCookie = req.headers.get("cookie") || "";
  const mergedCookie = [incomingCookie, INJECTED_COOKIE]
    .filter(Boolean)
    .join("; ")
    .trim();
  if (mergedCookie) h.set("cookie", mergedCookie);

  return h;
}

export async function handler(req) {
  return handle(req);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
  handle as HEAD,
  handle as OPTIONS,
};
