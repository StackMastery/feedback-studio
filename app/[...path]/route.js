// app/api/proxy/[...path]/route.js

export const runtime = "nodejs"; // Use Node, not Edge
export const dynamic = "force-dynamic"; // Always fresh

const UPSTREAM = "https://chatgpt.com";
const INJECT_COOKIES = process.env.CHATGPT_COOKIES || "";

// Hop-by-hop headers (never forward)
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function copyRequestHeaders(req, override = {}) {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.has(k)) return;
    if (k === "host") return;
    if (k === "content-length") return;
    out.set(k, value);
  });
  for (const [k, v] of Object.entries(override)) out.set(k.toLowerCase(), v);

  // Never forward browser cookies upstream; inject only our own (if any)
  if (INJECT_COOKIES) out.set("cookie", INJECT_COOKIES);
  else out.delete("cookie");

  return out;
}

function copyResponseHeaders(src, extra = {}) {
  const out = new Headers();
  src.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.has(k)) return;
    if (k === "content-length") return; // avoid mismatches when streaming
    out.set(k, value);
  });
  for (const [k, v] of Object.entries(extra)) out.set(k.toLowerCase(), v);

  // Never leak upstream Set-Cookie to your domain
  out.delete("set-cookie");
  return out;
}

// Follow 30x manually to handle tunnel/CDN/CF redirects
async function fetchFollow(url, init, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  return new Response("Too many redirects from upstream", { status: 508 });
}

function buildUpstreamUrl(req) {
  const { pathname, search } = new URL(req.url);
  // Strip the local prefix /api/proxy/ and forward the rest to UPSTREAM
  const after = pathname.replace(/^\/api\/proxy\/?/, "");
  const upstream = new URL(after || "/", UPSTREAM);
  upstream.search = search;
  return upstream.toString();
}

function corsHeaders(origin) {
  const o = origin ?? "*";
  return {
    "access-control-allow-origin": o,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "*,authorization,content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

// OPTIONS preflight — always 204
export async function OPTIONS(req) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

async function handle(req) {
  const upstreamUrl = buildUpstreamUrl(req);

  // Some sites check Origin/Referer
  const spoof = {
    origin: new URL(UPSTREAM).origin,
    referer: new URL(UPSTREAM).origin + "/",
  };

  const headers = copyRequestHeaders(req, spoof);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const init = {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined, // pass-through ReadableStream
    cache: "no-store",
    redirect: "manual",
  };

  const upstreamRes = await fetchFollow(upstreamUrl, init);

  const resHeaders = copyResponseHeaders(upstreamRes, {
    ...corsHeaders(req.headers.get("origin")),
    "cache-control": upstreamRes.headers.get("cache-control") || "no-store",
    "x-proxy-target": new URL(UPSTREAM).host,
  });

  // If SSE, ensure no-cache to keep stream happy
  const ctype = upstreamRes.headers.get("content-type") || "";
  if (ctype.includes("text/event-stream")) {
    resHeaders.set("cache-control", "no-cache");
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
