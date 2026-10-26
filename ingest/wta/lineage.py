"""`model.json` for the Data model page: the dbt DAG (sources, seeds, models, exposures) with
descriptions, columns, tests and row counts, read from dbt's manifest and the last full build.

Tests are not graph nodes; each model carries the count and status of the tests attached to it.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb

from .paths import ROOT, WAREHOUSE, WEB_DATA

DBT_DIR = ROOT / "dbt"
TARGET = DBT_DIR / "target"
# Written by `make build` (a copy of run_results.json from the last full `dbt build`).
BUILD_RESULTS = TARGET / "build_results.json"
LAYERS = {"source": 0, "seed": 0, "staging": 1, "intermediate": 2, "marts": 3, "exposure": 4}
GRAPH_TYPES = {"source", "seed", "model", "exposure"}
DOCS_PATH = {"source": "source", "seed": "seed", "model": "model", "exposure": "exposure"}


def layer_of(node: dict[str, Any]) -> str:
    kind = node["resource_type"]
    if kind in ("source", "seed", "exposure"):
        return kind
    return node["fqn"][1] if len(node["fqn"]) > 2 else "marts"


def node_name(node: dict[str, Any]) -> str:
    if node["resource_type"] == "source":
        return f"{node['source_name']}.{node['name']}"
    return node.get("label") or node["name"]


def test_index(manifest: dict[str, Any], results: dict[str, str]) -> dict[str, dict[str, int]]:
    """Per model: how many data/unit tests touch it and how many passed in the last build."""
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"tests": 0, "passed": 0, "failed": 0})
    tests = [n for n in manifest["nodes"].values() if n["resource_type"] == "test"]
    tests += list(manifest.get("unit_tests", {}).values())
    for test in tests:
        attached = test.get("attached_node")
        targets = [attached] if attached else test["depends_on"]["nodes"]
        status = results.get(test["unique_id"])
        for target in targets:
            counts[target]["tests"] += 1
            if status == "pass":
                counts[target]["passed"] += 1
            elif status in ("fail", "error"):
                counts[target]["failed"] += 1
    return counts


def row_count(con: duckdb.DuckDBPyConnection | None, node: dict[str, Any]) -> int | None:
    if con is None:
        return None
    try:
        if node["resource_type"] == "source":
            location = node.get("meta", {}).get("external_location")
            if not location:
                return None
            # Paths in the manifest are relative to dbt/.
            location = location.replace("'../", f"'{DBT_DIR.parent}/")
            return con.execute(f"SELECT count(*) FROM {location}").fetchone()[0]
        return con.execute(f'SELECT count(*) FROM "{node["schema"]}"."{node["alias"]}"').fetchone()[
            0
        ]
    except duckdb.Error:
        return None


def build(
    manifest_path: Path = TARGET / "manifest.json", output: Path = WEB_DATA / "model.json"
) -> dict:
    manifest = json.loads(manifest_path.read_text())
    results: dict[str, str] = {}
    if BUILD_RESULTS.exists():
        run = json.loads(BUILD_RESULTS.read_text())
        results = {r["unique_id"]: r["status"] for r in run["results"]}
    tests = test_index(manifest, results)
    con = duckdb.connect(str(WAREHOUSE), read_only=True) if WAREHOUSE.exists() else None

    candidates = [
        *manifest["sources"].values(),
        *manifest["nodes"].values(),
        *manifest["exposures"].values(),
    ]
    nodes = []
    for node in candidates:
        kind = node["resource_type"]
        if kind not in GRAPH_TYPES or node.get("package_name") != "world_trade_atlas":
            continue
        config = node.get("config", {})
        layer = layer_of(node)
        nodes.append(
            {
                "id": node["unique_id"],
                "name": node_name(node),
                "type": kind,
                "layer": layer,
                "column": LAYERS.get(layer, 3),
                "materialized": config.get("materialized"),
                "incremental_strategy": config.get("incremental_strategy"),
                "contract": bool(node.get("contract", {}).get("enforced")),
                "tags": node.get("tags", []),
                "description": node.get("description", ""),
                "columns": [
                    {
                        "name": c["name"],
                        "type": c.get("data_type"),
                        "description": c.get("description", ""),
                    }
                    for c in node.get("columns", {}).values()
                ],
                "parents": [
                    p
                    for p in node.get("depends_on", {}).get("nodes", [])
                    if not p.startswith("macro.")
                ],
                "tests": tests.get(node["unique_id"], {"tests": 0, "passed": 0, "failed": 0}),
                "rows": row_count(con, node) if kind != "exposure" else None,
                "sql": node.get("raw_code") if kind == "model" else None,
                "path": node.get("original_file_path"),
                "url": node.get("url"),
                "docs": f"/dbt/#!/{DOCS_PATH[kind]}/{node['unique_id']}",
            }
        )
    ids = {n["id"] for n in nodes}
    for node in nodes:
        node["parents"] = [p for p in node["parents"] if p in ids]
    payload = {
        "dbt_version": manifest["metadata"]["dbt_version"],
        "generated_at": manifest["metadata"]["generated_at"],
        "tests_total": sum(1 for n in manifest["nodes"].values() if n["resource_type"] == "test")
        + len(manifest.get("unit_tests", {})),
        "tests_passed": sum(1 for status in results.values() if status == "pass"),
        "nodes": sorted(nodes, key=lambda n: (n["column"], n["name"])),
    }
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # Never publish local absolute paths.
    text = text.replace(str(DBT_DIR.parent), "")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text)
    print(
        f"model.json: {len(nodes)} nodes, {payload['tests_total']} tests, {len(text) / 1024:.0f} KB"
    )
    return payload
