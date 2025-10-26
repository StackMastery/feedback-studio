// middleware.js (Next.js 13/14+, Edge runtime)
import { NextResponse } from "next/server";

const UPSTREAM = "https://chatgpt.com";
const INJECT_COOKIES = process.env.CHATGPT_COOKIES || "";

// Hop-by-hop headers never forward
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
    if (k === "content-length") return; // edge may not know exact length
    out.set(k, value);
  });

  // Spoof upstream expectations (helps behind tunnels/CDNs)
  const spoof = {
    origin: new URL(UPSTREAM).origin,
    referer: new URL(UPSTREAM).origin + "/",
    "user-agent":
      override["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  };

  for (const [k, v] of Object.entries({ ...spoof, ...override }))
    out.set(k.toLowerCase(), v);

  // Never forward browser cookies upstream; inject only ours
  if (INJECT_COOKIES) out.set("cookie", INJECT_COOKIES);
  else out.delete("cookie");

  return out;
}

function copyResponseHeaders(src, extra = {}) {
  const out = new Headers();
  src.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP.has(k)) return;
    if (k === "content-length") return; // streaming safety
    // কিছু CSP হেডার আপনার origin এ সমস্যা করলে চাইলে বাদ দিতে পারেন:
    // if (k === "content-security-policy") return;
    out.set(k, value);
  });
  for (const [k, v] of Object.entries(extra)) out.set(k.toLowerCase(), v);
  // Do NOT leak upstream cookies
  out.delete("set-cookie");
  return out;
}

async function fetchFollow(url, init, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      // cache hints to avoid edge/tunnel caching oddities
      cache: "no-store",
      next: { revalidate: 0 },
    });
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

export async function middleware(req) {
  const inUrl = new URL(req.url);

  // 0) Bypass Next internals/static
  if (
    /^\/(?:_next\/|favicon\.ico$|robots\.txt$|sitemap\.xml$)/.test(
      inUrl.pathname
    )
  ) {
    return NextResponse.next();
  }

  // 1) We can only safely proxy GET/HEAD in middleware
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return new NextResponse(
      "Edge middleware proxy supports only GET/HEAD. Use a Route Handler for POST/PUT/etc.",
      { status: 405 }
    );
  }

  // 2) CORS preflight
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") ?? "*";
    return new NextResponse(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers":
          req.headers.get("access-control-request-headers") ||
          "*,authorization,content-type",
        "access-control-allow-methods":
          req.headers.get("access-control-request-method") ||
          "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-max-age": "600",
        vary: "Origin",
      },
    });
  }

  // 3) Build upstream URL (mirror path+query to chatgpt.com)
  const upstreamUrl = new URL(inUrl.pathname, UPSTREAM);
  upstreamUrl.search = inUrl.search;

  // 4) Prepare upstream headers (with spoofed origin/referer/ua)
  const upstreamHeaders = copyRequestHeaders(req);

  // 5) Do upstream request (no body in Edge middleware)
  const upstreamRes = await fetchFollow(upstreamUrl.toString(), {
    method: req.method,
    headers: upstreamHeaders,
  });

  // 6) Mirror headers + set CORS for caller
  const corsOrigin = req.headers.get("origin") ?? "*";
  const resHeaders = copyResponseHeaders(upstreamRes, {
    "cache-control": upstreamRes.headers.get("cache-control") || "no-store",
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-credentials": "true",
    vary: "Origin",
    "x-proxy-target": new URL(UPSTREAM).host,
  });

  // 7) Extra: keep SSE happy if any
  const ctype = upstreamRes.headers.get("content-type") || "";
  if (ctype.includes("text/event-stream")) {
    resHeaders.set("cache-control", "no-cache");
  }

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

// 8) Run on everything except the excluded above
export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
