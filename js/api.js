// Client for /api/*. If the Worker isn't there (static hosting, local file server)
// prices and charts fall back to CoinGecko directly; chat needs the Worker.

const CG = "https://api.coingecko.com/api/v3";
const cache = new Map();

async function getJSON(url, options = {}, timeout = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const pending = hit && hit.p;
  if (pending) return pending;
  const p = load().then((v) => { cache.set(key, { t: Date.now(), v }); return v; }, (err) => { cache.delete(key); throw err; });
  cache.set(key, { t: 0, p });
  return p;
}

/** @returns {Promise<Record<string,{usd:number,change24h:number|null}>>} keyed by CoinGecko id */
export function getPrices(ids) {
  const list = [...new Set(ids)].sort();
  return cached("p:" + list.join(","), 20000, async () => {
    try {
      const body = await getJSON(`/api/prices?ids=${encodeURIComponent(list.join(","))}`);
      if (body && body.ok && body.data) return body.data;
      throw new Error("bad payload");
    } catch {
      const raw = await getJSON(`${CG}/simple/price?ids=${encodeURIComponent(list.join(","))}&vs_currencies=usd&include_24hr_change=true`);
      const data = {};
      for (const id of list) {
        if (raw[id] && typeof raw[id].usd === "number") {
          data[id] = { usd: raw[id].usd, change24h: typeof raw[id].usd_24h_change === "number" ? raw[id].usd_24h_change : null };
        }
      }
      return data;
    }
  });
}

/** @returns {Promise<Array<[number, number]>>} [timestamp, usd] pairs */
export function getChart(id, days) {
  return cached(`c:${id}:${days}`, 120000, async () => {
    let points;
    try {
      const body = await getJSON(`/api/chart?id=${encodeURIComponent(id)}&days=${days}`);
      if (body && body.ok && Array.isArray(body.points)) points = body.points;
      else throw new Error("bad payload");
    } catch {
      const raw = await getJSON(`${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`);
      const series = (raw.prices || []).filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
      const step = Math.ceil(series.length / 120) || 1;
      points = series.filter((_, i) => i % step === 0);
      if (series.length && points[points.length - 1] !== series[series.length - 1]) points.push(series[series.length - 1]);
    }
    if (points.length < 2) throw new Error("no data");
    return points;
  });
}

let configPromise;
/** @returns {Promise<{features:{ai:boolean}}|null>} null when the Worker API isn't reachable */
export function getConfig() {
  if (!configPromise) {
    configPromise = getJSON("/api/config", {}, 5000)
      .then((b) => (b && b.ok ? b : null))
      .catch(() => null);
  }
  return configPromise;
}

export async function sendChat(messages) {
  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new Error("Couldn't reach NXT AI. Check your connection and try again.");
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !body || !body.ok) {
    throw new Error((body && body.error) || "NXT AI isn't available on this deployment.");
  }
  return body.reply;
}
