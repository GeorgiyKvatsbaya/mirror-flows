"""Export the dbt marts to static JSON for the web app (`web/public/data`).

Tables are columnar (`{"columns": [...], "rows": [[...], ...]}`), money in US$ millions rounded
to $10,000, shares to 4 decimals. One file per country and per HS4 product keeps each page's
download small; `meta.json` and `world.json` load on every page.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb

from .paths import REFERENCE, WAREHOUSE, WEB_DATA

MILLION = 1e6
TOP_PARTNERS_MONTHLY = 10
TOP_PRODUCT_TRADERS = 10
# Bytes for all of web/public/data. Every annual BACI refresh adds about this much to git history.
SIZE_BUDGET = 175_000_000


def money(column: str, alias: str | None = None) -> str:
    return f"round({column} / {MILLION}, 2) AS {alias or column.split('.')[-1].replace('_usd', '')}"


def share(column: str, alias: str | None = None) -> str:
    return f"round({column}, 4) AS {alias or column.split('.')[-1]}"


def table(con: duckdb.DuckDBPyConnection, sql: str, params: list | None = None) -> dict[str, Any]:
    result = con.execute(sql, params or [])
    columns = [d[0] for d in result.description]
    rows = [[_plain(v) for v in row] for row in result.fetchall()]
    return {"columns": columns, "rows": rows}


def _plain(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()[:7] if hasattr(value, "day") else value.isoformat()
    return value


def write(path: Path, payload: dict[str, Any]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text)
    return len(text)


def meta(con: duckdb.DuckDBPyConnection, latest_year: int, latest_month: str) -> dict[str, Any]:
    manifest = json.loads((REFERENCE / "baci_manifest.json").read_text())
    return {
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "baci": {"version": manifest["version"], "first_year": 1995, "last_year": latest_year},
        "imf": {"first_month": "2023-01", "last_month": latest_month},
        "countries": table(
            con,
            """
            SELECT entity_code AS code, iso2, map_iso3 AS map, name_en, name_ru, region,
                   income_group AS income, first_year AS first, last_year AS last,
                   is_historical AS historical
            FROM marts.dim_country WHERE first_year IS NOT NULL ORDER BY code
            """,
        ),
        "sections": table(
            con,
            "SELECT section_id AS id, roman, name_en, name_ru FROM reference.hs_sections ORDER BY 1",
        ),
        "chapters": table(
            con,
            """
            SELECT DISTINCT hs2 AS code, section_id AS section, hs2_name_en AS name_en,
                   hs2_name_ru AS name_ru
            FROM marts.dim_product ORDER BY 1
            """,
        ),
        "products": table(
            con,
            "SELECT DISTINCT hs4 AS code, hs4_name AS name FROM marts.dim_product ORDER BY 1",
        ),
    }


def world(con: duckdb.DuckDBPyConnection, latest_year: int) -> dict[str, Any]:
    return {
        "countries": table(
            con,
            f"""
            SELECT year, entity_code AS code, {money("exports_usd")}, {money("imports_usd")},
                   {share("exports_growth", "growth")}, {share("world_export_share", "share")}
            FROM marts.mart_country_year ORDER BY year, code
            """,
        ),
        "chapters": table(
            con,
            f"""
            SELECT year, left(hs4, 2) AS hs2, {money("sum(world_usd)", "value")}
            FROM marts.mart_product_year GROUP BY ALL ORDER BY year, hs2
            """,
        ),
        "products": table(
            con,
            f"""
            SELECT hs4, {money("world_usd", "value")}, {share("growth")},
                   top_exporter, {share("top_exporter_share")}, top_importer,
                   {share("top_importer_share")}, exporter_count
            FROM marts.mart_product_year WHERE year = ? ORDER BY world_usd DESC
            """,
            [latest_year],
        ),
        "sources": table(
            con,
            f"""
            SELECT year, entity_code AS code, {money("baci_exports_usd", "baci")},
                   {money("imf_exports_usd", "imf")}, {share("imf_vs_baci", "difference")}
            FROM marts.mart_source_comparison WHERE baci_rank <= 40 ORDER BY year, baci_rank
            """,
        ),
    }


def country(con: duckdb.DuckDBPyConnection, code: str, latest_year: int) -> dict[str, Any]:
    p = [code]
    return {
        "years": table(
            con,
            f"""
            SELECT year, {money("exports_usd")}, {money("imports_usd")}, {money("balance_usd")},
                   {share("exports_growth")}, {share("imports_growth")},
                   {share("world_export_share")}, export_partner_count, import_partner_count,
                   {share("export_partner_hhi")}, export_product_count,
                   {share("export_product_hhi")}, rca_product_count,
                   top_export_partner, top_import_partner, top_export_hs4
            FROM marts.mart_country_year WHERE entity_code = ? ORDER BY year
            """,
            p,
        ),
        "products": table(
            con,
            f"""
            WITH latest AS (
                SELECT * FROM marts.mart_country_product_year
                WHERE entity_code = ? AND year = ?
            ),
            earlier AS (
                SELECT hs4, exports_usd FROM marts.mart_country_product_year
                WHERE entity_code = ? AND year = ? - 5
            )
            SELECT latest.hs4, {money("latest.exports_usd")}, {money("latest.imports_usd")},
                   {money("earlier.exports_usd", "exports_5y_ago")},
                   {share("latest.world_market_share")}, round(latest.rca, 2) AS rca
            FROM latest LEFT JOIN earlier USING (hs4)
            WHERE latest.exports_usd >= 100000 OR latest.imports_usd >= 100000
            ORDER BY latest.exports_usd DESC
            """,
            [code, latest_year, code, latest_year],
        ),
        "monthly": monthly(con, code),
    }


def monthly(con: duckdb.DuckDBPyConnection, code: str) -> dict[str, Any]:
    """IMF months: the world total plus the largest partners over the last 12 months."""
    return table(
        con,
        f"""
        WITH top AS (
            SELECT partner_code FROM marts.mart_trade_monthly
            WHERE entity_code = ? AND partner_code <> 'WLD'
              AND month > (SELECT max(month) FROM marts.mart_trade_monthly) - INTERVAL 12 MONTH
            GROUP BY 1
            ORDER BY sum(coalesce(exports_usd, 0) + coalesce(imports_usd, 0)) DESC
            LIMIT {TOP_PARTNERS_MONTHLY}
        )
        SELECT month, partner_code AS partner, {money("exports_usd")}, {money("imports_usd")},
               {share("exports_yoy")}, {share("imports_yoy")}
        FROM marts.mart_trade_monthly
        WHERE entity_code = ? AND (partner_code = 'WLD' OR partner_code IN (SELECT * FROM top))
        ORDER BY partner, month
        """,
        [code, code],
    )


def product(con: duckdb.DuckDBPyConnection, hs4: str, latest_year: int) -> dict[str, Any]:
    return {
        "years": table(
            con,
            f"""
            SELECT year, {money("world_usd", "value")}, {share("growth")}, exporter_count,
                   {share("exporter_hhi")}
            FROM marts.mart_product_year WHERE hs4 = ? ORDER BY year
            """,
            [hs4],
        ),
        # Leading exporters over time (top N in any year) for the market-share chart.
        "exporters": table(
            con,
            f"""
            WITH ranked AS (
                SELECT *, rank() OVER (PARTITION BY year ORDER BY exports_usd DESC) AS r
                FROM marts.mart_country_product_year WHERE hs4 = ? AND exports_usd > 0
            ),
            leaders AS (SELECT DISTINCT entity_code FROM ranked WHERE r <= {TOP_PRODUCT_TRADERS})
            SELECT year, entity_code AS code, {money("exports_usd", "value")},
                   {share("world_market_share", "share")}
            FROM ranked WHERE entity_code IN (SELECT * FROM leaders) ORDER BY year, value DESC
            """,
            [hs4],
        ),
        # Every trader in the latest year, for the map and rankings.
        "latest": table(
            con,
            f"""
            SELECT entity_code AS code, {money("exports_usd")}, {money("imports_usd")},
                   {share("world_market_share", "share")}, round(rca, 2) AS rca
            FROM marts.mart_country_product_year
            WHERE hs4 = ? AND year = ? AND (exports_usd > 0 OR imports_usd > 0)
            ORDER BY exports_usd DESC
            """,
            [hs4, latest_year],
        ),
    }


# ── Parquet outputs for the cross-filters (read in the browser with hyparquet) ──
PARQUET = "FORMAT parquet, COMPRESSION snappy"
MIN_FLOW = 1_000_000  # partner x chapter cells under $1M are dropped (<0.3% of value)
MIN_MARGIN = 100_000  # partner totals under $100k are dropped


def partitioned(con: duckdb.DuckDBPyConnection, sql: str, key: str, folder: Path) -> int:
    """COPY a query partitioned by `key`, then flatten to folder/<value>.parquet."""
    staging = folder.with_name(folder.name + "_tmp")
    shutil.rmtree(staging, ignore_errors=True)
    shutil.rmtree(folder, ignore_errors=True)
    folder.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY ({sql}) TO '{staging}' ({PARQUET}, PARTITION_BY ({key}))")
    folder.mkdir(parents=True)
    size = 0
    for part in staging.iterdir():
        value = part.name.split("=", 1)[1]
        target = folder / f"{value}.parquet"
        files = sorted(part.glob("*.parquet"))
        if len(files) == 1:
            files[0].rename(target)
        else:  # several writer threads: merge into one file
            con.execute(
                f"COPY (SELECT * FROM read_parquet({[str(f) for f in files]})) TO '{target}' ({PARQUET})"
            )
        size += target.stat().st_size
    shutil.rmtree(staging)
    return size


def millions(column: str) -> str:
    return f"round({column} / {MILLION}, 2)::FLOAT"


def cross_filters(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    con.execute("SET threads = 1")  # one file per partition
    sizes = {
        # Cells (partner x chapter, >= $1M) plus exact margins: partner totals (hs2 NULL) and
        # chapter totals (partner NULL), so rankings and the treemap never lose small flows.
        "cross": partitioned(
            con,
            f"""WITH cells AS (SELECT * FROM marts.mart_country_partner_chapter_year)
                SELECT entity_code, year, partner_code AS partner, hs2,
                       {millions("exports_usd")} AS exports, {millions("imports_usd")} AS imports
                FROM cells WHERE exports_usd >= {MIN_FLOW} OR imports_usd >= {MIN_FLOW}
                UNION ALL
                SELECT entity_code, year, partner_code, NULL,
                       {millions("exports_usd")}, {millions("imports_usd")}
                FROM marts.mart_country_partner_year
                WHERE exports_usd + imports_usd >= {MIN_MARGIN}
                UNION ALL
                SELECT entity_code, year, NULL, hs2,
                       {millions("exports_usd")}, {millions("imports_usd")}
                FROM marts.mart_country_chapter_year
                WHERE exports_usd + imports_usd > 0
                ORDER BY entity_code, year, partner NULLS FIRST, hs2 NULLS FIRST""",
            "entity_code",
            WEB_DATA / "cross",
        ),
        "chapters": partitioned(
            con,
            f"""SELECT hs2, year, entity_code AS code, {millions("exports_usd")} AS exports,
                       {millions("imports_usd")} AS imports,
                       round(world_market_share, 4)::FLOAT AS share
                FROM marts.mart_country_chapter_year
                WHERE exports_usd > 0 OR imports_usd > 0
                ORDER BY hs2, year, code""",
            "hs2",
            WEB_DATA / "chapters",
        ),
        "routes/product": partitioned(
            con,
            f"""SELECT hs4, year, exporter_code AS exporter, importer_code AS importer,
                       {millions("value_usd")} AS value
                FROM marts.mart_route_product_year WHERE value_usd >= {MIN_FLOW}
                ORDER BY hs4, year, exporter, value DESC""",
            "hs4",
            WEB_DATA / "routes" / "product",
        ),
        "routes/exporter": partitioned(
            con,
            f"""SELECT exporter_code AS exporter_key, year, importer_code AS importer, hs4,
                       {millions("value_usd")} AS value
                FROM marts.mart_route_product_year WHERE value_usd >= {MIN_FLOW}
                ORDER BY exporter_key, year, importer, hs4""",
            "exporter_key",
            WEB_DATA / "routes" / "exporter",
        ),
    }
    con.execute("RESET threads")
    return sizes


def refresh_monthly(con: duckdb.DuckDBPyConnection) -> None:
    """Rewrite only the IMF series inside the existing country files (the monthly CI job).
    Needs nothing but the IMF mart, so it runs without the BACI warehouse."""
    latest_month = con.execute("SELECT max(month) FROM marts.mart_trade_monthly").fetchone()[0]
    files = sorted((WEB_DATA / "countries").glob("*.json"))
    for path in files:
        payload = json.loads(path.read_text())
        payload["monthly"] = monthly(con, path.stem)
        write(path, payload)
    meta_path = WEB_DATA / "meta.json"
    payload = json.loads(meta_path.read_text())
    payload["imf"]["last_month"] = latest_month.isoformat()[:7]
    payload["built_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    write(meta_path, payload)
    print(f"Monthly series refreshed in {len(files)} country files (latest {latest_month:%Y-%m})")


def run(monthly_only: bool = False) -> None:
    con = duckdb.connect(str(WAREHOUSE), read_only=True)
    if monthly_only:
        refresh_monthly(con)
        return
    latest_year = con.execute("SELECT max(year) FROM marts.mart_country_year").fetchone()[0]
    latest_month = con.execute("SELECT max(month) FROM marts.mart_trade_monthly").fetchone()[0]
    codes = [
        c
        for (c,) in con.execute(
            "SELECT entity_code FROM marts.dim_country WHERE first_year IS NOT NULL ORDER BY 1"
        ).fetchall()
    ]
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for folder in ("countries", "pairs", "products"):  # pairs/: removed in v2, cleaned up here
        shutil.rmtree(WEB_DATA / folder, ignore_errors=True)
    sizes: dict[str, int] = {}
    sizes["meta"] = write(
        WEB_DATA / "meta.json", meta(con, latest_year, latest_month.isoformat()[:7])
    )
    sizes["world"] = write(WEB_DATA / "world.json", world(con, latest_year))
    for code in codes:
        size = write(WEB_DATA / "countries" / f"{code}.json", country(con, code, latest_year))
        sizes["countries"] = sizes.get("countries", 0) + size
    products = con.execute("SELECT DISTINCT hs4 FROM marts.mart_product_year ORDER BY 1").fetchall()
    for (hs4,) in products:
        size = write(WEB_DATA / "products" / f"{hs4}.json", product(con, hs4, latest_year))
        sizes["products"] = sizes.get("products", 0) + size
    sizes.update(cross_filters(con))
    total = sum(sizes.values())
    if total > SIZE_BUDGET:
        raise SystemExit(
            f"Web data is {total / 1e6:.0f} MB, over the {SIZE_BUDGET / 1e6:.0f} MB budget"
        )
    print(
        "Exported "
        + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sizes.items())
        + f" — total {total / 1e6:.1f} MB"
    )
