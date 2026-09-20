// Shared API handler. Used by the Worker (src/index.js) and by Cloudflare Pages
// Functions (functions/api/[[path]].js) so both deployments behave identically.

export const VERSION = "2.1.0";

const CG = "https://api.coingecko.com/api/v3";
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const CHART_DAYS = new Set([1, 7, 30, 90]);
const MAX_POINTS = 120;

const CHAINS = ["Solana", "Ethereum", "Base", "BNB Chain", "Polygon", "Arbitrum", "Avalanche", "Sui"];

const SYSTEM_PROMPT = [
  "You are NXT AI, the assistant inside NXT CLOUD, a non-custodial multi-chain app with a DEX, a token launchpad and this chat.",
  "Help people understand markets, tokens, transactions, wallets and these networks: " + CHAINS.join(", ") + ".",
  "You do not have live market data and cannot look up a specific transaction or address. When asked, say so and explain how to check on a block explorer instead.",
  "Never ask for or accept seed phrases or private keys, and warn anyone who offers them.",
  "Do not give personalised investment advice or promise returns; explain risks plainly.",
  "Keep answers concise and in plain language. Use short lists or numbered steps when they help.",
].join(" ");

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function methodNotAllowed(allow) {
  return json({ ok: false, error: "Method not allowed" }, 405, { allow });
}

/** Returns a Response for /api/* requests, or null for anything else. */
export async function handleApi(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") return null;

  const route = url.pathname.replace(/\/+$/, "");
  const isRead = request.method === "GET" || request.method === "HEAD";

  switch (route) {
    case "/api/health":
      if (!isRead) return methodNotAllowed("GET, HEAD");
      return json({ ok: true, service: "NXT CLOUD", version: VERSION, timestamp: new Date().toISOString() });

    case "/api/config":
      if (!isRead) return methodNotAllowed("GET, HEAD");
      return json({
        ok: true,
        version: VERSION,
        chains: CHAINS,
        features: { dex: true, launchpad: true, ai: Boolean(env && env.AI), wallet: true },
      });

    case "/api/prices":
      if (!isRead) return methodNotAllowed("GET, HEAD");
      return prices(url);

    case "/api/chart":
      if (!isRead) return methodNotAllowed("GET, HEAD");
      return chart(url);

    case "/api/chat":
      if (request.method !== "POST") return methodNotAllowed("POST");
      return chat(request, env);

    default:
      return json({ ok: false, error: "Not found" }, 404);
  }
}

async function prices(url) {
  const ids = [...new Set((url.searchParams.get("ids") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean))].sort();
  if (!ids.length || ids.length > 30 || ids.some((id) => !/^[a-z0-9-]{1,60}$/.test(id))) {
    return json({ ok: false, error: "Provide up to 30 valid asset ids in ?ids=" }, 400);
  }
  try {
    const upstream = `${CG}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(upstream, { headers: { accept: "application/json" }, cf: { cacheTtl: 30, cacheEverything: true } });
    if (!res.ok) throw new Error("upstream " + res.status);
    const raw = await res.json();
    const data = {};
    for (const id of ids) {
      const row = raw && raw[id];
      if (row && typeof row.usd === "number") {
        data[id] = { usd: row.usd, change24h: typeof row.usd_24h_change === "number" ? row.usd_24h_change : null };
      }
    }
    return json({ ok: true, data, updated: Date.now() }, 200, { "cache-control": "public, max-age=30" });
  } catch {
    return json({ ok: false, error: "Price provider unavailable" }, 502);
  }
}

async function chart(url) {
  const id = (url.searchParams.get("id") || "").toLowerCase();
  const days = Number(url.searchParams.get("days") || 7);
  if (!/^[a-z0-9-]{1,60}$/.test(id) || !CHART_DAYS.has(days)) {
    return json({ ok: false, error: "Provide ?id= and ?days= of 1, 7, 30 or 90" }, 400);
  }
  try {
    const upstream = `${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
    const res = await fetch(upstream, { headers: { accept: "application/json" }, cf: { cacheTtl: 120, cacheEverything: true } });
    if (!res.ok) throw new Error("upstream " + res.status);
    const raw = await res.json();
    const series = Array.isArray(raw && raw.prices) ? raw.prices.filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) : [];
    if (series.length < 2) throw new Error("no data");
    const step = Math.ceil(series.length / MAX_POINTS);
    const points = series.filter((_, i) => i % step === 0);
    if (points[points.length - 1] !== series[series.length - 1]) points.push(series[series.length - 1]);
    return json({ ok: true, id, days, points }, 200, { "cache-control": "public, max-age=120" });
  } catch {
    return json({ ok: false, error: "Chart data unavailable" }, 502);
  }
}

async function chat(request, env) {
  if (!env || !env.AI) {
    return json({ ok: false, error: "NXT AI isn't enabled on this deployment yet." }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Send a JSON body" }, 400);
  }
  const messages = (Array.isArray(body && body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ ok: false, error: "The last message must be from the user" }, 400);
  }
  try {
    const out = await env.AI.run(env.AI_MODEL || DEFAULT_MODEL, {
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 800,
    });
    const reply = (typeof out === "string" ? out : (out && out.response) || "").trim();
    if (!reply) throw new Error("empty");
    return json({ ok: true, reply });
  } catch {
    return json({ ok: false, error: "NXT AI couldn't answer just now. Try again in a moment." }, 502);
  }
}
