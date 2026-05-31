#!/usr/bin/env python3
from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

TOKEN = time.strftime("%Y%m%d", time.gmtime())
LIST_DOMAIN = "https://list.leilaomi.cc.cd"
PROXY_DOMAIN = "proxyip.leilaomi.cc.cd"
KV_NAMESPACE_ID = "6d911271a65f4e67a39e22d991edb961"
TARGET_COUNTRIES = {"US"}


def fetch(url: str) -> tuple[int, str]:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 ProxyIPAudit"})
    try:
        with urlopen(req, timeout=30) as res:
            return res.status, res.read().decode("utf-8", "ignore")
    except Exception as exc:
        return getattr(exc, "code", 0) or 0, str(exc)


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def read_json(path: str) -> dict | list:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dns_ips() -> list[str]:
    return sorted({info[4][0] for info in socket.getaddrinfo(PROXY_DOMAIN, 443, family=socket.AF_INET, type=socket.SOCK_STREAM)})


def kv_get(key: str) -> str:
    return subprocess.check_output([
        "wrangler", "kv", "key", "get", key,
        "--namespace-id", KV_NAMESPACE_ID,
        "--remote",
    ], text=True).strip()


def main() -> None:
    current = Path("docs/current.txt").read_text(encoding="utf-8").strip()
    current_json = read_json("docs/current.json")
    state = read_json("docs/state.json")
    full = read_json("docs/full.json")
    dns_records = read_json("docs/dns-records.json")

    assert_true(bool(current), "docs/current.txt is empty")
    assert_true(state.get("current_ip") == current, "state current_ip does not match current.txt")
    assert_true(current_json.get("current", {}).get("ip") == current, "current.json does not match current.txt")
    assert_true(full.get("summary", {}).get("current_ip") == current, "full.json summary current_ip does not match current.txt")
    assert_true(len(dns_records) == 1 and dns_records[0].get("content") == current, "dns-records.json must contain exactly one current IP")

    country = (current_json.get("current", {}).get("risk", {}).get("country") or "").upper()
    assert_true(country in TARGET_COUNTRIES, f"current IP country {country!r} is outside target countries {sorted(TARGET_COUNTRIES)}")

    standby = full.get("standby", [])
    bad_standby = [(x.get("ip"), x.get("risk", {}).get("country")) for x in standby if (x.get("risk", {}).get("country") or "").upper() not in TARGET_COUNTRIES]
    assert_true(not bad_standby, f"standby contains non-target countries: {bad_standby[:5]}")

    resolved = dns_ips()
    assert_true(resolved == [current], f"DNS must resolve to exactly current IP: {resolved} != {[current]}")

    status, body = fetch(f"{LIST_DOMAIN}/current.txt?t={TOKEN}&r={int(time.time())}")
    assert_true(status == 200 and body.strip() == current, f"live current.txt mismatch: {status} {body[:120]}")

    status, body = fetch(f"{LIST_DOMAIN}/health?t={TOKEN}&r={int(time.time())}")
    assert_true(status == 200, f"live health failed: {status} {body[:120]}")
    health = json.loads(body)
    assert_true(health.get("current") == current, "live health current mismatch")

    try:
        kv_current = kv_get("current_txt")
        assert_true(kv_current == current, f"KV current_txt mismatch: {kv_current} != {current}")
    except Exception as exc:
        raise RuntimeError(f"KV audit failed: {exc}") from exc

    print(json.dumps({
        "ok": True,
        "current": current,
        "country": country,
        "dns": resolved,
        "standby_count": len(standby),
        "health_count": health.get("count"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"AUDIT FAILED: {exc}", file=sys.stderr)
        raise
