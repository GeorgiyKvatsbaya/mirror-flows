"""model.json builder and partitioned Parquet export, on tiny inputs."""

import json

import duckdb

from wta import export, lineage


def manifest(tmp_path):
    def model(name, fqn_layer, parents, contract=False):
        return {
            "unique_id": f"model.world_trade_atlas.{name}",
            "resource_type": "model",
            "package_name": "world_trade_atlas",
            "name": name,
            "fqn": ["world_trade_atlas", fqn_layer, name],
            "config": {"materialized": "table"},
            "contract": {"enforced": contract},
            "description": f"{name} description",
            "columns": {"year": {"name": "year", "data_type": "smallint", "description": ""}},
            "depends_on": {"nodes": parents, "macros": ["macro.world_trade_atlas.hhi"]},
            "raw_code": "select 1",
            "original_file_path": f"models/{name}.sql",
            "schema": "marts",
            "alias": name,
            "tags": [],
        }

    data = {
        "metadata": {"dbt_version": "1.12.5", "generated_at": "2026-10-26T00:00:00Z"},
        "sources": {
            "source.world_trade_atlas.baci.flows": {
                "unique_id": "source.world_trade_atlas.baci.flows",
                "resource_type": "source",
                "package_name": "world_trade_atlas",
                "source_name": "baci",
                "name": "flows",
                "fqn": ["world_trade_atlas", "staging", "baci", "flows"],
                "description": "BACI",
                "columns": {},
                "meta": {},
            }
        },
        "nodes": {
            "model.world_trade_atlas.stg": model(
                "stg", "staging", ["source.world_trade_atlas.baci.flows"]
            ),
            "model.world_trade_atlas.mart": model(
                "mart", "marts", ["model.world_trade_atlas.stg"], contract=True
            ),
            "test.world_trade_atlas.unique_mart": {
                "unique_id": "test.world_trade_atlas.unique_mart",
                "resource_type": "test",
                "attached_node": "model.world_trade_atlas.mart",
                "depends_on": {"nodes": ["model.world_trade_atlas.mart"]},
            },
        },
        "exposures": {
            "exposure.world_trade_atlas.page": {
                "unique_id": "exposure.world_trade_atlas.page",
                "resource_type": "exposure",
                "package_name": "world_trade_atlas",
                "name": "page",
                "label": "Page",
                "fqn": ["world_trade_atlas", "page"],
                "description": "",
                "depends_on": {"nodes": ["model.world_trade_atlas.mart"]},
                "url": "https://example.org",
            }
        },
        "unit_tests": {},
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(data))
    return path


def test_model_json(tmp_path, monkeypatch):
    monkeypatch.setattr(lineage, "WAREHOUSE", tmp_path / "missing.duckdb")
    monkeypatch.setattr(lineage, "BUILD_RESULTS", tmp_path / "missing.json")
    out = tmp_path / "model.json"
    payload = lineage.build(manifest(tmp_path), out)
    nodes = {n["name"]: n for n in payload["nodes"]}
    assert [n["column"] for n in payload["nodes"]] == [0, 1, 3, 4]  # source, staging, mart, page
    assert nodes["mart"]["parents"] == ["model.world_trade_atlas.stg"]  # macros dropped
    assert nodes["mart"]["contract"] is True
    assert nodes["mart"]["tests"] == {"tests": 1, "passed": 0, "failed": 0}
    assert nodes["Page"]["docs"] == "/dbt/#!/exposure/exposure.world_trade_atlas.page"
    assert payload["tests_total"] == 1
    assert json.loads(out.read_text())["dbt_version"] == "1.12.5"


def test_partitioned_parquet(tmp_path):
    con = duckdb.connect()
    con.execute("SET threads = 1")
    size = export.partitioned(
        con,
        "SELECT * FROM (VALUES ('GEO', 2024, 1.5), ('GEO', 2023, 2.0), ('ARM', 2024, 3.0)) t(code, year, v)",
        "code",
        tmp_path / "out",
    )
    files = sorted(p.name for p in (tmp_path / "out").iterdir())
    assert files == ["ARM.parquet", "GEO.parquet"] and size > 0
    rows = con.execute(f"SELECT year, v FROM '{tmp_path}/out/GEO.parquet' ORDER BY year").fetchall()
    assert rows == [(2023, 2.0), (2024, 1.5)]
    assert not (tmp_path / "out_tmp").exists()
