const DEFAULT_RESULT = {"summary": {"total": 38, "valid": 4, "invalid": 34, "success_rate": "10.5%", "avg_latency_ms": 32, "country_distribution": {"unknown": 4}, "failure_reasons": {"Cannot connect to host 172.65.1.1:443 ssl:False [Connect call failed ('172.65.1.1', 443)]": 1, "Cannot connect to host 104.21.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.20.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.16.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.26.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 108.162.193.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 173.245.49.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.18.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.27.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 108.162.192.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 108.162.194.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.24.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.25.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 172.66.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "Cannot connect to host 104.19.0.1:443 ssl:False [[SSL: SSLV3_ALERT_HANDSHAKE_FAILURE] sslv3 alert handshake failure (_ssl.c:1000)]": 1, "HTTPS_FAIL": 1, "TCP_FAIL": 18}, "checked_at": "2026-05-27T10:54:24.815267+00:00"}, "valid_ips": [{"ip": "188.114.96.1", "valid": true, "latency": 31, "country": "unknown", "cf_ray": "a0247b2a8f09d6e0-IAD", "status_code": 403}, {"ip": "104.17.0.1", "valid": true, "latency": 32, "country": "unknown", "cf_ray": "a0247b2a8ca9e5ec-IAD", "status_code": 403}, {"ip": "188.114.97.1", "valid": true, "latency": 33, "country": "unknown", "cf_ray": "a0247b2a7b6ff26e-IAD", "status_code": 403}, {"ip": "188.114.98.1", "valid": true, "latency": 34, "country": "unknown", "cf_ray": "a0247b2a88c12f89-IAD", "status_code": 403}], "ip_list": ["188.114.96.1", "104.17.0.1", "188.114.97.1", "188.114.98.1"]};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const result = await loadResult(env);
    const valid = Array.isArray(result.valid_ips) ? result.valid_ips : [];
    const ips = valid.map((item) => item.ip).filter(Boolean);

    if (url.pathname === "/all.txt" || url.pathname === "/us.txt") {
      return text(ips.join("\n") + (ips.length ? "\n" : ""));
    }
    if (url.pathname === "/best.txt") {
      const n = Number.parseInt(url.searchParams.get("n") || "10", 10);
      return text(ips.slice(0, Number.isFinite(n) ? n : 10).join("\n") + (ips.length ? "\n" : ""));
    }
    if (url.pathname === "/v2ray.txt") {
      return text(btoa(ips.join("\n")));
    }
    if (url.pathname === "/full.json") {
      return json(result);
    }
    if (url.pathname === "/health") {
      return json({ ok: true, count: ips.length, checked_at: result.summary?.checked_at || null });
    }
    return html(renderHome(result));
  }
};

async function loadResult(env) {
  if (env.PROXYIP_KV) {
    const stored = await env.PROXYIP_KV.get("result_json", "json");
    if (stored) return stored;
  }
  return DEFAULT_RESULT;
}

function renderHome(result) {
  const s = result.summary || {};
  const valid = Array.isArray(result.valid_ips) ? result.valid_ips : [];
  const rows = valid.slice(0, 50).map((item, i) => `<tr><td>${i + 1}</td><td><code>${escapeHtml(item.ip)}</code></td><td>${item.latency ?? ""}ms</td><td>${escapeHtml(item.cf_ray || "")}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CF ProxyIP US IPv4</title><style>body{font-family:system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 20px;line-height:1.5}code{background:#f3f4f6;padding:2px 5px;border-radius:4px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:9px;text-align:left}.card{display:inline-block;border:1px solid #e5e7eb;border-radius:12px;padding:14px 18px;margin:6px 8px 6px 0}.bad{color:#b91c1c}</style></head><body><h1>CF ProxyIP US IPv4</h1><p>IPv4-only candidate list. Current cmliu-compatible validation result: <b class="bad">0 valid</b>; this page is for deployment testing until better candidates are available.</p><div class="card">Candidates<br><b>${s.total ?? valid.length}</b></div><div class="card">Local valid<br><b>${s.valid ?? valid.length}</b></div><div class="card">Checked<br><b>${escapeHtml(s.checked_at || "unknown")}</b></div><h2>Files</h2><ul><li><a href="/all.txt">all.txt</a></li><li><a href="/best.txt">best.txt</a></li><li><a href="/full.json">full.json</a></li><li><a href="/v2ray.txt">v2ray.txt</a></li></ul><h2>Results</h2><table><thead><tr><th>#</th><th>IP</th><th>Latency</th><th>CF-Ray</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function html(body) {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...cors() } });
}
function text(body) {
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", ...cors() } });
}
function json(data) {
  return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json; charset=utf-8", ...cors() } });
}
function cors() {
  return { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" };
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}
