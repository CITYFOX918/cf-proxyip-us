#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

WRANGLER_TOML = Path("wrangler.toml")


def get_kv_namespace_id() -> str:
    text = WRANGLER_TOML.read_text(encoding="utf-8")
    m = re.search(r'id\s*=\s*"([^"]+)"', text)
    if not m:
        raise RuntimeError("Cannot find KV namespace id in wrangler.toml")
    return m.group(1)


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def slim_full(data: dict) -> dict:
    """Strip all_results from full.json before uploading to KV to save bandwidth."""
    slim = {k: v for k, v in data.items() if k != "all_results"}
    return slim


def main() -> None:
    namespace_id = get_kv_namespace_id()
    manifest = json.loads(Path("docs/kv-manifest.json").read_text(encoding="utf-8"))
    for key, source in manifest.items():
        path = Path(source)
        if not path.exists():
            raise RuntimeError(f"Missing KV source file: {path}")
        if key == "result_json":
            data = json.loads(path.read_text(encoding="utf-8"))
            slim_data = slim_full(data)
            slim_path = Path("docs/full.slim.json")
            slim_path.write_text(json.dumps(slim_data, ensure_ascii=False, indent=2), encoding="utf-8")
            run(["wrangler", "kv", "key", "put", key, "--path", str(slim_path), "--namespace-id", namespace_id, "--remote"])
            slim_path.unlink()
        else:
            run(["wrangler", "kv", "key", "put", key, "--path", str(path), "--namespace-id", namespace_id, "--remote"])
    print(json.dumps({"synced_keys": sorted(manifest), "namespace_id": namespace_id}, ensure_ascii=False))


if __name__ == "__main__":
    main()
