"""World Bank country metadata: region and income group by ISO3 (CC BY 4.0)."""

from __future__ import annotations

import duckdb
import pyarrow as pa

from .http import PoliteClient
from .paths import REFERENCE

URL = "https://api.worldbank.org/v2/country"
OUTPUT = REFERENCE / "wb_countries.parquet"


def ingest() -> None:
    client = PoliteClient()
    meta, rows = client.get_json(URL, {"format": "json", "per_page": 400})
    if meta["pages"] != 1:
        raise RuntimeError("World Bank country list no longer fits one page")
    records = [
        {
            "iso3": row["id"],
            "iso2": row["iso2Code"] or None,
            "name": row["name"].strip(),
            "region_id": row["region"]["id"],
            "region": row["region"]["value"].strip(),
            "income_group_id": row["incomeLevel"]["id"],
            "income_group": row["incomeLevel"]["value"].strip(),
            "is_aggregate": row["region"]["value"] == "Aggregates",
        }
        for row in rows
    ]
    REFERENCE.mkdir(parents=True, exist_ok=True)
    wb_countries = pa.Table.from_pylist(records)  # noqa: F841 — read by DuckDB below
    duckdb.sql(f"COPY (SELECT * FROM wb_countries ORDER BY iso3) TO '{OUTPUT}' (FORMAT parquet)")
    print(f"Done: {len(records)} rows ({sum(not r['is_aggregate'] for r in records)} economies)")
