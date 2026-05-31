const EMPTY_RESULT = {
  summary: { current_ip: null, checked_at: null, cmliu_ipv4_valid: 0, total_candidates: 0 },
  current: null,
  state: { current_ip: null, status: "no_data", failure_count: 0 },
  history: [],
  standby: [],
  recommended_top5: [],
  valid_ips: [],
};

const ACCESS_COOKIE = "proxyip_access";
const ACCESS_VALUE = "ok";
const ACCESS_TTL = 60 * 60 * 8;
const TEXT_PATHS = new Set(["/current.txt", "/standby.txt", "/all.txt", "/us.txt", "/best.txt", "/top5.txt", "/v2ray.txt"]);
const JSON_PATHS = new Set(["/current.json", "/state.json", "/history.json", "/full.json"]);
const BLOCKED_UA = /(bot|spider|crawler|scrapy|python-requests|aiohttp|curl|wget|go-http-client|httpx|masscan|zgrab|nuclei|semrush|ahrefs|bytespider|petalbot|yandex|bingbot|googlebot)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return withHeaders(new Response(null, { status: 204 }));
    if (request.method !== "GET") return withHeaders(new Response("Method not allowed", { status: 405 }));
    if (url.pathname === "/robots.txt") return text("User-agent: *\nDisallow: /\n", false);

    // /health is unauthenticated
    if (url.pathname === "/health") {
      const result = await loadResult(env);
      const valid = Array.isArray(result.valid_ips) ? result.valid_ips : [];
      return json({
        ok: true,
        current: currentIp(result),
        standby_count: standby(result).length,
        count: valid.length,
        checked_at: result.summary?.checked_at || null,
        data_source: env.PROXYIP_KV ? "kv" : "empty_fallback",
      }, true);
    }

    // Auth gate for data endpoints
    if (TEXT_PATHS.has(url.pathname) || JSON_PATHS.has(url.pathname)) {
      const authErr = await verifyAccess(request, url, env);
      if (authErr) return deny(authErr);
    }

    const result = await loadResult(env);
    const valid = Array.isArray(result.valid_ips) ? result.valid_ips : [];
    const ips = valid.map((item) => item.ip).filter(Boolean);
    const etag = `"${result.summary?.checked_at || "0"}"`;

    // 304 Not Modified
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304 });
    }

    const withEtag = (resp) => {
      const h = new Headers(resp.headers);
      h.set("etag", etag);
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
    };

    if (url.pathname === "/current.txt") return withEtag(text(lines(currentIp(result) ? [currentIp(result)] : []), true));
    if (url.pathname === "/standby.txt") return withEtag(text(lines(standby(result).map((item) => item.ip).filter(Boolean)), true));
    if (url.pathname === "/all.txt" || url.pathname === "/us.txt") return withEtag(text(lines(ips), true));
    if (url.pathname === "/best.txt") {
      const n = Math.min(Math.max(Number.parseInt(url.searchParams.get("n") || "20", 10) || 20, 1), 100);
      return withEtag(text(lines(ips.slice(0, n)), true));
    }
    if (url.pathname === "/top5.txt") return withEtag(text(lines(top5(result)), true));
    if (url.pathname === "/v2ray.txt") return withEtag(text(btoa(ips.join("\n")), true));
    if (url.pathname === "/current.json") return withEtag(json({ current: result.current || null, state: result.state || null }, true));
    if (url.pathname === "/state.json") return withEtag(json(result.state || {}, true));
    if (url.pathname === "/history.json") return withEtag(json(result.history || [], true));
    if (url.pathname === "/full.json") return withEtag(json(result, true));

    return html(renderHome(result, url));
  }
};

// ── Data loading (KV only, no hardcoded fallback) ──

async function loadResult(env) {
  if (env.PROXYIP_KV) {
    const stored = await env.PROXYIP_KV.get("result_json", "json");
    if (stored) return stored;
  }
  return EMPTY_RESULT;
}

// ── Access control ──

async function verifyAccess(request, url, env) {
  const ua = request.headers.get("user-agent") || "";
  if (BLOCKED_UA.test(ua)) return "blocked user-agent";

  // Cookie from homepage visit
  if ((request.headers.get("cookie") || "").includes(`${ACCESS_COOKIE}=${ACCESS_VALUE}`)) return null;

  const token = url.searchParams.get("t") || "";
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const secret = env.PROXYIP_SECRET || "";

  // HMAC token mode: ?t=YYYYMMDD-hex
  if (secret) {
    if (!token.startsWith(today + "-")) return "invalid or missing token";
    const expected = await hmacHex(secret, today);
    if (token.slice(today.length + 1) === expected) return null;
    return "invalid token";
  }

  // Legacy mode (no secret): accept plain ?t=YYYYMMDD
  if (token === today) return null;

  return "open the homepage first, or add ?t=YYYYMMDD token";
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Helpers ──

function currentIp(result) {
  return result.current?.ip || result.state?.current_ip || null;
}
function standby(result) {
  return Array.isArray(result.standby) ? result.standby : [];
}
function top5(result) {
  return (Array.isArray(result.recommended_top5) ? result.recommended_top5 : []).map((item) => item.ip).filter(Boolean);
}
function lines(items) {
  return items.join("\n") + (items.length ? "\n" : "");
}

// ── Response builders ──

function deny(reason) {
  return withHeaders(new Response(reason + "\n", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } }), false);
}
function text(body, privateCache) {
  return withHeaders(new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } }), privateCache);
}
function json(data, privateCache) {
  return withHeaders(new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8" } }), privateCache);
}
function html(body) {
  return withHeaders(new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "set-cookie": `${ACCESS_COOKIE}=${ACCESS_VALUE}; Max-Age=${ACCESS_TTL}; Path=/; Secure; HttpOnly; SameSite=Lax` } }), false);
}
function withHeaders(response, privateCache = false) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", privateCache ? "private, max-age=300" : "public, max-age=300");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

// ── Homepage ──

function renderHome(result, url) {
  const s = result.summary || {};
  const valid = Array.isArray(result.valid_ips) ? result.valid_ips : [];
  const token = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rows = valid.slice(0, 30).map((item, i) => `<tr><td>${i + 1}</td><td><code>${escapeHtml(item.ip)}</code></td><td>${escapeHtml(item.portRemote || 443)}</td><td>${escapeHtml(item.colo || "")}</td><td>${escapeHtml(item.latency_ms ?? "")}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>ProxyIP US IPv4</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:960px;margin:40px auto;padding:0 20px;line-height:1.55;color:#111827}a{color:#2563eb}code{background:#f3f4f6;padding:2px 5px;border-radius:4px}.card{display:inline-block;border:1px solid #e5e7eb;border-radius:12px;padding:14px 18px;margin:6px 8px 6px 0;background:#fafafa}.card b{display:block;font-size:24px}table{width:100%;border-collapse:collapse;margin-top:14px}td,th{border-bottom:1px solid #e5e7eb;padding:9px;text-align:left}.muted{color:#6b7280}.ok{color:#047857}</style></head><body><h1>ProxyIP US IPv4</h1><p class="muted">只收錄 <code>https://zip.cm.edu.kg/all.txt</code> 中標記 <code>#US</code>、端口 <code>443</code>、且 cmliu 檢測 <code>supports_ipv4=true</code> 的結果。</p><div class="card">cmliu valid<b class="ok">${escapeHtml(s.cmliu_ipv4_valid ?? valid.length)}</b></div><div class="card">candidates<b>${escapeHtml(s.total_candidates ?? valid.length)}</b></div><div class="card">checked<b>${escapeHtml(s.checked_at || "unknown")}</b></div><h2>Current Stable ProxyIP</h2><p><code>${escapeHtml(currentIp(result) || "none")}</code></p><h2>Endpoints</h2><ul><li><a href="/current.txt?t=${token}">current.txt</a></li><li><a href="/current.json?t=${token}">current.json</a></li><li><a href="/standby.txt?t=${token}">standby.txt</a></li><li><a href="/all.txt?t=${token}">all.txt</a></li><li><a href="/us.txt?t=${token}">us.txt</a></li><li><a href="/top5.txt?t=${token}">top5.txt</a></li><li><a href="/best.txt?t=${token}">best.txt</a></li><li><a href="/history.json?t=${token}">history.json</a></li><li><a href="/full.json?t=${token}">full.json</a></li><li><a href="/v2ray.txt?t=${token}">v2ray.txt</a></li></ul><p class="muted">接口有基礎反爬保護：需先訪問首頁取得 cookie，或使用當天 token <code>?t=YYYYMMDD</code>。</p></body></html>`;
}
