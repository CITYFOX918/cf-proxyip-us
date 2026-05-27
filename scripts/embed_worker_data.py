#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

FULL_JSON = Path("docs/full.json")
WORKER_JS = Path("worker.js")


def slim_item(item: dict) -> dict:
    risk = item.get("risk") or {}
    return {
        "ip": item.get("ip"),
        "latency_ms": item.get("latency_ms"),
        "portRemote": item.get("portRemote", 443),
        "colo": risk.get("colo") or item.get("colo"),
        "risk": {
            "cf_bot_score": risk.get("cf_bot_score"),
            "grade": risk.get("grade"),
            "corporate_proxy": risk.get("corporate_proxy"),
            "verified_bot": risk.get("verified_bot"),
            "asn": risk.get("asn"),
            "as_organization": risk.get("as_organization"),
            "country": risk.get("country"),
            "city": risk.get("city"),
        },
    }


def main() -> None:
    full = json.loads(FULL_JSON.read_text(encoding="utf-8"))
    slim = {
        "summary": full["summary"],
        "recommended_top5": [slim_item(x) for x in full.get("recommended_top5", [])],
        "valid_ips": [slim_item(x) for x in full.get("valid_ips", [])],
    }
    content = WORKER_JS.read_text(encoding="utf-8")
    embedded = "const DEFAULT_RESULT = " + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";\n\nconst ACCESS_COOKIE"
    updated = re.sub(r"^const DEFAULT_RESULT = .*?;\n\nconst ACCESS_COOKIE", embedded, content, flags=re.S)
    if updated == content:
        raise SystemExit("worker.js DEFAULT_RESULT block was not updated")
    WORKER_JS.write_text(updated, encoding="utf-8")
    print(json.dumps({"embedded_valid": len(slim["valid_ips"]), "embedded_top5": [x["ip"] for x in slim["recommended_top5"]]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
