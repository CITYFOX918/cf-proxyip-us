#!/usr/bin/env python3
from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "leilaomi.cc.cd"
RECORD_NAME = "proxyip.leilaomi.cc.cd"
DOCS_DNS = Path("docs/dns-records.json")


def cf(method: str, path: str, payload: dict | None = None, params: dict | None = None) -> dict:
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        raise SystemExit("Missing CLOUDFLARE_API_TOKEN")
    url = API + path
    if params:
        url += "?" + urlencode(params)
    body = None if payload is None else json.dumps(payload).encode()
    req = Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    with urlopen(req, timeout=45) as res:
        data = json.loads(res.read().decode("utf-8"))
    if not data.get("success"):
        raise RuntimeError(f"Cloudflare API failed: {data}")
    return data


def zone_id() -> str:
    data = cf("GET", "/zones", params={"name": ZONE_NAME, "per_page": 1})
    result = data.get("result") or []
    if not result:
        raise RuntimeError(f"Zone not found: {ZONE_NAME}")
    return result[0]["id"]


def desired_records() -> list[dict]:
    rows = json.loads(DOCS_DNS.read_text(encoding="utf-8"))
    ips = []
    for row in rows:
        ip = row["content"]
        if ip not in ips:
            ips.append(ip)
    if len(ips) != 5:
        raise RuntimeError(f"Expected exactly 5 desired IPs, got {len(ips)}: {ips}")
    return [{"type": "A", "name": RECORD_NAME, "content": ip, "ttl": 300, "proxied": False} for ip in ips]


def main() -> None:
    zid = zone_id()
    desired = desired_records()
    current = cf("GET", f"/zones/{zid}/dns_records", params={"name": RECORD_NAME, "type": "A", "per_page": 100}).get("result") or []
    current_ips = sorted([r["content"] for r in current])
    desired_ips = sorted([r["content"] for r in desired])
    changed = current_ips != desired_ips or any(r.get("proxied") for r in current) or any(r.get("ttl") not in (1, 300) for r in current)

    for record in current:
        cf("DELETE", f"/zones/{zid}/dns_records/{record['id']}")
    for record in desired:
        cf("POST", f"/zones/{zid}/dns_records", record)

    print(json.dumps({"changed": changed, "old": current_ips, "new": desired_ips}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
